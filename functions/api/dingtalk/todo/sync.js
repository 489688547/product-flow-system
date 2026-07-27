import {
  createDingPersonalTodoTask,
  getDingAccessToken,
  jsonResponse,
  optionsResponse,
  syncDingTodoTask,
  updateDingPersonalTodoTask,
  updateDingTodoTask
} from "../_shared/dingtalk.js";
import { getValidDingUserToken } from "../../auth/_shared/ding-user-token.js";
import { readCompanyState } from "../../state.js";
import { requestBusinessDatabase } from "../../platform/_shared/dataEnvironment.js";
import { shouldSimulateExternalAction } from "../../platform/_shared/externalActionMode.js";
import {
  auditDisplayExternalAction,
  simulateDingTodoSync
} from "../../platform/_shared/displayExternalActionAdapter.js";

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function safeDingTalkError(error, fallback) {
  const status = Number(error?.status) || 500;
  if ([401, 428].includes(status)) {
    return {
      status,
      body: {
        synced: false,
        code: "DINGTALK_USER_AUTH_REQUIRED",
        message: "请重新使用钉钉登录后再同步待办。",
        retryable: true
      }
    };
  }
  if (status === 429) {
    return { status, body: { synced: false, code: "DINGTALK_RATE_LIMITED", message: "钉钉接口繁忙，请稍后重试。", retryable: true } };
  }
  if (error?.detail) {
    return { status, body: { synced: false, code: "DINGTALK_PROVIDER_FAILED", message: fallback, retryable: status >= 500 } };
  }
  if ([400, 403, 404, 409].includes(status)) {
    return {
      status,
      body: {
        synced: false,
        code: "DINGTALK_REQUEST_REJECTED",
        message: String(error?.message || fallback),
        retryable: false
      }
    };
  }
  return { status, body: { synced: false, code: "DINGTALK_PROVIDER_FAILED", message: fallback, retryable: true } };
}

function isTaskTodoSourceForTask(value, sourceId) {
  const actual = String(value || "").trim();
  if (actual === sourceId) return true;
  const recoverySuffix = actual.startsWith(`${sourceId}:r`)
    ? actual.slice(sourceId.length + 2)
    : "";
  return /^\d+$/.test(recoverySuffix);
}

function nextRecoverySourceId(sourceId, storedSourceId) {
  const match = String(storedSourceId || "").match(/:r(\d+)$/);
  return `${sourceId}:r${match ? Number(match[1]) + 1 : 1}`;
}

export function authorizeTaskTodoSyncRequest(input = {}, session = {}, state = {}) {
  if (session.role === "readonly") throw requestError("只读账号不能同步钉钉待办。", 403);
  const creatorUnionId = String(session.unionId || "").trim();
  if (!creatorUnionId) throw requestError("当前登录账号缺少 unionId。", 400);

  const sourceId = String(input.sourceId || "").trim();
  const sourceMatch = sourceId.match(/^task:([^:]+):([^:]+)$/);
  if (!sourceMatch) throw requestError("待办来源标识无效。", 400);
  const [, productId, taskId] = sourceMatch;
  const product = (state.products || []).find(item => String(item.id) === productId);
  const task = (state.tasks || []).find(item => String(item.id) === taskId && String(item.productId) === productId);
  if (!product || !task) throw requestError("待同步的产品任务不存在。", 404);

  const requestedTodoId = String(input.todoId || "").trim();
  const storedTodoId = isTaskTodoSourceForTask(task.dingTodo?.sourceId, sourceId)
    ? String(task.dingTodo?.id || "").trim()
    : "";
  if (requestedTodoId && requestedTodoId !== storedTodoId) {
    throw requestError("待办 ID 与产品任务记录不一致。", 403);
  }
  const storedTodoSource = String(task.dingTodo?.source || "");
  const storedCreatorUnionId = String(task.dingTodo?.creatorUnionId || "").trim();
  const storedExecutorUnionIds = Array.isArray(task.dingTodo?.executorUnionIds)
    ? task.dingTodo.executorUnionIds.map(value => String(value || "").trim())
    : [];
  const productManagerUnionId = String(product.productManagerUnionId || "").trim();
  const canReplaceOwnerlessPersonalTodo = storedTodoId
    && storedTodoSource === "todo_personal_user"
    && !storedCreatorUnionId
    && (productManagerUnionId === creatorUnionId || storedExecutorUnionIds.includes(creatorUnionId));
  if (storedTodoId && storedTodoSource === "todo_personal_user") {
    if (!storedCreatorUnionId && !canReplaceOwnerlessPersonalTodo) {
      throw requestError("该个人待办缺少创建人标识，请由产品负责人或原执行人重新同步。", 409);
    }
    if (storedCreatorUnionId && storedCreatorUnionId !== creatorUnionId) {
      throw requestError("只有该个人待办的创建人可以更新。", 403);
    }
  }
  const {
    creatorUnionId: ignoredCreator,
    operatorUnionId: ignoredOperator,
    resourceUnionId: ignoredResource,
    recoveryUnionIds: ignoredRecovery,
    todoId: ignoredTodoId,
    ...safeInput
  } = input;
  void ignoredCreator;
  void ignoredOperator;
  void ignoredResource;
  void ignoredRecovery;
  void ignoredTodoId;
  return {
    ...safeInput,
    sourceId: canReplaceOwnerlessPersonalTodo
      ? nextRecoverySourceId(sourceId, task.dingTodo?.sourceId)
      : sourceId,
    todoId: canReplaceOwnerlessPersonalTodo ? "" : storedTodoId,
    todoSource: canReplaceOwnerlessPersonalTodo ? "" : storedTodoSource,
    replacementOfTodoId: canReplaceOwnerlessPersonalTodo ? storedTodoId : "",
    creatorUnionId,
    recoveryUnionIds: productManagerUnionId && productManagerUnionId !== creatorUnionId
      ? [productManagerUnionId]
      : []
  };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const db = requestBusinessDatabase({ env, data });
    if (!db) throw requestError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", 501);
    const stored = await readCompanyState(db);
    if (!stored?.state) throw requestError("产品流程共享数据尚未初始化。", 409);
    const authorizedBody = authorizeTaskTodoSyncRequest(body, data.session, stored.state);
    if (shouldSimulateExternalAction(data)) {
      const todo = simulateDingTodoSync(authorizedBody);
      await auditDisplayExternalAction({ env, data, kind: "dingtalk_todo_sync", resultId: todo.id });
      return jsonResponse({ synced: true, todo });
    }
    let todo;
    if (!authorizedBody.todoId) {
      todo = await createDingPersonalTodoTask(
        await getValidDingUserToken(request, env),
        authorizedBody
      );
    } else if (authorizedBody.todoSource === "todo_personal_user") {
      const personal = await updateDingPersonalTodoTask(
        await getValidDingUserToken(request, env),
        authorizedBody
      );
      try {
        const updated = await updateDingTodoTask(await getDingAccessToken(env), authorizedBody);
        todo = { ...updated, ...personal };
      } catch {
        todo = {
          ...personal,
          syncWarning: "钉钉个人待办已更新，但正文或执行人同步未完成，请稍后重试。"
        };
      }
    } else {
      todo = await syncDingTodoTask(await getDingAccessToken(env), authorizedBody);
    }
    return jsonResponse({ synced: true, todo });
  } catch (error) {
    const safe = safeDingTalkError(error, "钉钉待办同步失败，请稍后重试。");
    return jsonResponse(safe.body, safe.status);
  }
}
