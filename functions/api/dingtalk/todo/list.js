import {
  getDingTodoTask,
  getDingAccessToken,
  jsonResponse,
  listDingTodoTasks,
  optionsResponse
} from "../_shared/dingtalk.js";
import { readCompanyState } from "../../state.js";
import { requestBusinessDatabase } from "../../platform/_shared/dataEnvironment.js";

const MAX_BOUND_TASKS = 40;
const TASK_DETAIL_CONCURRENCY = 4;

function requestedTaskIds(url) {
  return [...new Set(url.searchParams.getAll("taskId")
    .map(value => String(value || "").trim())
    .filter(value => /^[A-Za-z0-9:_-]{1,128}$/.test(value)))]
    .slice(0, MAX_BOUND_TASKS);
}

export function buildBoundTodoQueries(state = {}, taskIds = [], actorUnionId = "") {
  const requested = new Set(taskIds);
  const products = new Map((state.products || []).map(product => [String(product.id), product]));
  return (state.tasks || []).flatMap(task => {
    const taskId = String(task?.dingTodo?.id || "").trim();
    if (!requested.has(taskId)) return [];
    const product = products.get(String(task.productId)) || {};
    const managerUnionId = String(product.productManagerUnionId || "").trim();
    const creatorUnionId = String(task?.dingTodo?.creatorUnionId || "").trim();
    const executorUnionIds = [...new Set((task?.dingTodo?.executorUnionIds || [])
      .map(value => String(value || "").trim())
      .filter(Boolean))];
    const actor = String(actorUnionId || "").trim();
    if (![managerUnionId, creatorUnionId, ...executorUnionIds].includes(actor)) return [];
    return executorUnionIds
      .filter(unionId => unionId !== managerUnionId)
      .map(executorUnionId => ({ taskId, executorUnionId }));
  }).slice(0, MAX_BOUND_TASKS);
}

export async function loadBoundTaskDetails(accessToken, queries, getTask = getDingTodoTask) {
  const results = [];
  for (let offset = 0; offset < queries.length; offset += TASK_DETAIL_CONCURRENCY) {
    const batch = queries.slice(offset, offset + TASK_DETAIL_CONCURRENCY);
    results.push(...await Promise.all(batch.map(async query => {
      try {
        const card = await getTask(accessToken, query.executorUnionId, query.taskId);
        return { ...query, card, ok: true };
      } catch {
        return { ...query, card: null, ok: false };
      }
    })));
  }
  const grouped = new Map();
  results.forEach(result => {
    const group = grouped.get(result.taskId) || [];
    group.push(result);
    grouped.set(result.taskId, group);
  });
  const cards = [...grouped].map(([taskId, group]) => {
    const first = group.find(item => item.ok)?.card || { taskId };
    const executorStatuses = group
      .filter(item => item.ok)
      .map(item => ({ unionId: item.executorUnionId, isDone: Boolean(item.card?.isDone) }));
    return {
      ...first,
      taskId,
      executorStatuses,
      executorStatusCoverage: {
        complete: executorStatuses.length === group.length,
        expectedCount: group.length,
        statusCount: executorStatuses.length
      }
    };
  });
  const partial = results.some(result => !result.ok);
  return {
    cards,
    warning: partial ? {
      source: "personal",
      code: "DINGTALK_EXECUTOR_STATUS_PARTIAL",
      message: "部分执行人的完成状态暂未读取，负责人验收已暂停。",
      retryable: true
    } : null
  };
}

function safeLaneWarning(source, error) {
  const status = Number(error?.status) || 500;
  if (source === "personal" && [401, 428].includes(status)) {
    return {
      source,
      code: "DINGTALK_USER_AUTH_REQUIRED",
      message: "请重新使用钉钉登录，以恢复个人待办双向同步。",
      retryable: true
    };
  }
  if (status === 429) {
    return { source, code: "DINGTALK_RATE_LIMITED", message: "钉钉接口繁忙，本次状态覆盖不完整。", retryable: true };
  }
  return { source, code: "DINGTALK_SOURCE_FAILED", message: "钉钉待办状态暂未完整读取。", retryable: status >= 500 };
}

export async function collectDingTodoCards({
  personalAuthorized = true,
  loadPersonal,
  loadWork
} = {}) {
  const warnings = [];
  const coverage = {
    personal: {
      authorized: Boolean(personalAuthorized),
      ok: false,
      truncated: false,
      nextPage: 1,
      pendingNextToken: "",
      completedNextToken: ""
    },
    work: { ok: false, truncated: false, pendingNextToken: "", completedNextToken: "" }
  };
  let personal = [];
  let work = [];

  if (personalAuthorized && typeof loadPersonal === "function") {
    try {
      const result = await loadPersonal();
      personal = Array.isArray(result?.cards) ? result.cards : [];
      warnings.push(...(Array.isArray(result?.warnings) ? result.warnings : []));
      coverage.personal.ok = true;
      coverage.personal.truncated = Boolean(result?.truncated);
      coverage.personal.nextPage = Number(result?.nextPage) || 1;
      coverage.personal.pendingNextToken = String(result?.pendingNextToken || "");
      coverage.personal.completedNextToken = String(result?.completedNextToken || "");
      if (coverage.personal.truncated) {
        warnings.push({
          source: "personal",
          code: "DINGTALK_RESULTS_TRUNCATED",
          message: "个人待办数量较多，本次只覆盖最近部分记录。",
          retryable: true
        });
      }
    } catch (error) {
      const warning = safeLaneWarning("personal", error);
      if (warning.code === "DINGTALK_USER_AUTH_REQUIRED") coverage.personal.authorized = false;
      warnings.push(warning);
    }
  } else if (!personalAuthorized) {
    warnings.push({
      source: "personal",
      code: "DINGTALK_USER_AUTH_REQUIRED",
      message: "请重新使用钉钉登录，以恢复个人待办双向同步。",
      retryable: true
    });
  }

  if (typeof loadWork === "function") {
    try {
      const result = await loadWork();
      work = Array.isArray(result?.cards) ? result.cards : [];
      coverage.work.ok = true;
      coverage.work.truncated = Boolean(result?.truncated);
      coverage.work.pendingNextToken = String(result?.pendingNextToken || "");
      coverage.work.completedNextToken = String(result?.completedNextToken || "");
      if (coverage.work.truncated) {
        warnings.push({
          source: "work",
          code: "DINGTALK_RESULTS_TRUNCATED",
          message: "历史工作待办数量较多，本次只覆盖最近部分记录。",
          retryable: true
        });
      }
    } catch (error) {
      warnings.push(safeLaneWarning("work", error));
    }
  }

  const byTaskId = new Map();
  [...work, ...personal].forEach(todo => {
    const taskId = String(todo?.taskId || todo?.id || todo?.todoTaskId || "").trim();
    if (taskId) byTaskId.set(taskId, todo);
  });
  return { todos: [...byTaskId.values()], warnings, coverage };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const unionId = String(data.session?.unionId || "").trim();
  if (!unionId) return jsonResponse({ synced: false, message: "当前登录账号缺少 unionId。" }, 400);
  const url = new URL(request.url);
  const personalPage = Math.max(1, Math.min(100, Number(url.searchParams.get("personalPage")) || 1));
  const safeCursor = name => {
    const value = String(url.searchParams.get(name) || "");
    return /^[A-Za-z0-9._~+/=-]{0,512}$/.test(value) ? value : "";
  };
  const workPendingToken = safeCursor("workPendingToken");
  const workCompletedToken = safeCursor("workCompletedToken");
  const taskIds = requestedTaskIds(url);
  let boundQueries = [];
  if (taskIds.length) {
    const db = requestBusinessDatabase({ env, data });
    const stored = db ? await readCompanyState(db) : null;
    boundQueries = buildBoundTodoQueries(stored?.state, taskIds, unionId);
    if (!boundQueries.length) {
      return jsonResponse({ synced: false, message: "没有可读取的已绑定待办。" }, 403);
    }
  }

  const result = await collectDingTodoCards({
    personalAuthorized: true,
    loadPersonal: async () => {
      const accessToken = await getDingAccessToken(env);
      if (taskIds.length) {
        const detailResult = await loadBoundTaskDetails(accessToken, boundQueries);
        return {
          cards: detailResult.cards,
          warnings: detailResult.warning ? [detailResult.warning] : [],
          truncated: false,
          nextPage: personalPage,
          pendingNextToken: "",
          completedNextToken: ""
        };
      }
      const pending = await listDingTodoTasks(accessToken, unionId, {
        isDone: false,
        maxPages: 1,
        nextToken: workPendingToken
      });
      const completed = await listDingTodoTasks(accessToken, unionId, {
        isDone: true,
        maxPages: 1,
        nextToken: workCompletedToken
      });
      return {
        cards: [...pending, ...completed],
        truncated: pending.truncated || completed.truncated,
        nextPage: personalPage,
        pendingNextToken: pending.nextToken,
        completedNextToken: completed.nextToken
      };
    }
  });
  if (!result.coverage.personal.ok) {
    return jsonResponse({
      synced: false,
      code: "DINGTALK_TODO_LIST_UNAVAILABLE",
      message: "钉钉待办状态暂时无法读取，请稍后重试。",
      retryable: true
    }, 502);
  }

  return jsonResponse({
    synced: true,
    personalTodoAuthorized: true,
    todos: result.todos,
    warnings: result.warnings,
    coverage: result.coverage,
    nextCursor: {
      personalPage: result.coverage.personal.nextPage,
      workPendingToken: result.coverage.personal.pendingNextToken,
      workCompletedToken: result.coverage.personal.completedNextToken
    }
  });
}
