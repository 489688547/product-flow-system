import {
  getDingAccessToken,
  jsonResponse,
  listDingUserTodoTasks,
  optionsResponse
} from "../_shared/dingtalk.js";

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

  const result = await collectDingTodoCards({
    personalAuthorized: true,
    loadPersonal: async () => {
      const accessToken = await getDingAccessToken(env);
      const pending = await listDingUserTodoTasks(accessToken, unionId, {
        isDone: false,
        maxPages: 1,
        nextToken: workPendingToken
      });
      const completed = await listDingUserTodoTasks(accessToken, unionId, {
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
