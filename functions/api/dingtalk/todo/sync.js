import {
  getDingAccessToken,
  jsonResponse,
  optionsResponse,
  retireReplacedWorkTodo,
  syncDingPersonalTodoTask
} from "../_shared/dingtalk.js";
import { getValidDingUserToken } from "../../auth/_shared/ding-user-token.js";
import { readCompanyState, writeCompanyState } from "../../state.js";
import { requestBusinessDatabase } from "../../platform/_shared/dataEnvironment.js";
import { shouldSimulateExternalAction } from "../../platform/_shared/externalActionMode.js";
import { applyTaskTodoSyncSuccess } from "../../../../src/domain/taskTodo.js";
import {
  auditDisplayExternalAction,
  simulateDingTodoSync
} from "../../platform/_shared/displayExternalActionAdapter.js";
import {
  ensureProductionAccessTables,
  finishProductionAudit,
  saveProductionSnapshot,
  startProductionAudit
} from "../../platform/_shared/productionDataAccess.js";

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function safeDingTalkError(error, fallback) {
  const status = Number(error?.status) || 500;
  if (error?.code === "DINGTALK_TODO_REPLACEMENT_RETIRE_FAILED") {
    return {
      status: 502,
      body: {
        synced: false,
        code: "DINGTALK_TODO_REPLACEMENT_RETIRE_FAILED",
        message: "新版待办已创建，但旧待办尚未退出未完成列表，请重试。",
        retryable: true
      }
    };
  }
  if (error?.code === "DINGTALK_TODO_BINDING_CONFLICT") {
    return {
      status: 409,
      body: {
        synced: false,
        providerSynced: true,
        todoId: String(error?.todoId || ""),
        code: "DINGTALK_TODO_BINDING_CONFLICT",
        message: "钉钉待办已创建，但系统绑定保存冲突，请重试同步。",
        retryable: true
      }
    };
  }
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

function taskSourceParts(sourceId) {
  const match = String(sourceId || "").trim().match(/^task:([^:]+):([^:]+)$/);
  return match ? { productId: match[1], taskId: match[2] } : null;
}

function taskExecutorUsers(state, executorUnionIds = []) {
  const wanted = new Set(executorUnionIds.map(value => String(value || "").trim()).filter(Boolean));
  return (state?.orgCache?.users || []).filter(user => wanted.has(String(user?.unionid || user?.unionId || "").trim()));
}

function bindingConflict(todoId) {
  const error = new Error("钉钉待办已创建，但系统绑定保存冲突，请重试同步。");
  error.status = 409;
  error.code = "DINGTALK_TODO_BINDING_CONFLICT";
  error.retryable = true;
  error.todoId = String(todoId || "");
  return error;
}

async function writeTaskTodoState({ db, state, stored, session, sourceEnvironment, writeState }) {
  await ensureProductionAccessTables(db);
  const snapshotId = await saveProductionSnapshot(db, stored);
  const audit = await startProductionAudit({
    db,
    action: "dingtalk-todo-binding-write",
    access: {
      userId: session.userId || "company-session",
      unionId: session.unionId || "",
      name: session.name || "公司会话"
    },
    unlock: { reason: "钉钉待办绑定保存" },
    snapshotId,
    before: stored,
    sourceEnvironment
  });
  try {
    const saved = await writeState(
      db,
      state,
      session.name || session.unionId || "公司会话",
      { baseUpdatedAt: stored.updatedAt }
    );
    await finishProductionAudit(db, audit.id, saved);
    return { ...saved, auditId: audit.id };
  } catch (error) {
    await finishProductionAudit(db, audit.id, stored, "failed").catch(() => {});
    throw error;
  }
}

export async function persistTaskTodoSyncResult({
  db,
  sourceId,
  payload,
  todo,
  session = {},
  syncedAt = new Date().toISOString(),
  maxAttempts = 3,
  sourceEnvironment = "production",
  readState = readCompanyState,
  writeState = writeCompanyState,
  writeBinding = writeTaskTodoState
}) {
  const source = taskSourceParts(sourceId);
  if (!source) throw requestError("待办来源标识无效。", 400);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const stored = await readState(db);
    if (!stored?.state) throw requestError("产品流程共享数据尚未初始化。", 409);
    const task = (stored.state.tasks || []).find(item => (
      String(item.id) === source.taskId
      && String(item.productId) === source.productId
    ));
    if (!task) throw requestError("待同步的产品任务不存在。", 404);

    const executors = taskExecutorUsers(stored.state, payload?.executorUnionIds || []);
    const persistedTask = applyTaskTodoSyncSuccess(task, {
      payload,
      executors,
      todo,
      syncedAt
    });
    const nextState = {
      ...stored.state,
      tasks: (stored.state.tasks || []).map(item => item === task ? persistedTask : item)
    };

    try {
      const saved = await writeBinding({
        db,
        state: nextState,
        stored,
        session,
        sourceEnvironment,
        writeState
      });
      return { ...saved, task: persistedTask };
    } catch (error) {
      const isConflict = Number(error?.status) === 409 || error?.code === "SHARED_STATE_VERSION_CONFLICT";
      if (!isConflict) throw error;
      if (attempt === maxAttempts - 1) throw bindingConflict(todo?.id || todo?.taskId);
    }
  }
  throw bindingConflict(todo?.id || todo?.taskId);
}

function isTaskTodoSourceForTask(value, sourceId) {
  const actual = String(value || "").trim();
  if (actual === sourceId) return true;
  const recoverySuffix = actual.startsWith(`${sourceId}:`)
    ? actual.slice(sourceId.length)
    : "";
  return /^(?::r\d+)+$/.test(recoverySuffix);
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
  const recordedTodoId = String(task.dingTodo?.id || "").trim();
  const storedTodoSource = String(task.dingTodo?.source || "");
  const recordedWorkTodoRequested = requestedTodoId
    && requestedTodoId === recordedTodoId
    && storedTodoSource.startsWith("todo_open_");
  const storedTodoId = (
    isTaskTodoSourceForTask(task.dingTodo?.sourceId, sourceId)
    || recordedWorkTodoRequested
  ) ? recordedTodoId : "";
  if (requestedTodoId && requestedTodoId !== recordedTodoId) {
    throw requestError("待办 ID 与产品任务记录不一致。", 403);
  }
  const storedCreatorUnionId = String(task.dingTodo?.creatorUnionId || "").trim();
  const storedExecutorUnionIds = Array.isArray(task.dingTodo?.executorUnionIds)
    ? task.dingTodo.executorUnionIds.map(value => String(value || "").trim())
    : [];
  const pendingLegacyTodo = task.dingTodo?.legacyTodo && typeof task.dingTodo.legacyTodo === "object"
    ? task.dingTodo.legacyTodo
    : null;
  const productManagerUnionId = String(product.productManagerUnionId || "").trim();
  const canReusePersonalTodo = storedTodoId
    && storedTodoSource === "todo_personal_user"
    && (
      storedCreatorUnionId === creatorUnionId
      || productManagerUnionId === creatorUnionId
      || storedExecutorUnionIds.includes(creatorUnionId)
    );
  const requiresPersonalTodoUpgrade = Boolean(
    storedTodoId && storedTodoSource.startsWith("todo_open_")
  );
  const canReplaceWorkTodo = requiresPersonalTodoUpgrade && (
    storedCreatorUnionId === creatorUnionId
    || productManagerUnionId === creatorUnionId
    || storedExecutorUnionIds.includes(creatorUnionId)
  );
  if (storedTodoId && storedTodoSource === "todo_personal_user") {
    if (!canReusePersonalTodo) {
      throw requestError("该个人待办只能由产品负责人、原创建人或执行人更新。", 403);
    }
  }
  if (requiresPersonalTodoUpgrade && !canReplaceWorkTodo) {
    throw requestError("该工作待办需要由产品负责人、原创建人或执行人升级为个人待办。", 403);
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
    sourceId,
    todoId: canReusePersonalTodo ? storedTodoId : "",
    todoSource: canReusePersonalTodo ? storedTodoSource : "",
    replacementOfTodoId: canReplaceWorkTodo
      ? storedTodoId
      : String(pendingLegacyTodo?.id || ""),
    replacementTodoSource: canReplaceWorkTodo
      ? storedTodoSource
      : String(pendingLegacyTodo?.source || ""),
    replacementCreatorUnionId: canReplaceWorkTodo
      ? storedCreatorUnionId || creatorUnionId
      : String(pendingLegacyTodo?.creatorUnionId || ""),
    replacementExecutorUnionIds: canReplaceWorkTodo
      ? storedExecutorUnionIds
      : Array.isArray(pendingLegacyTodo?.executorUnionIds)
        ? pendingLegacyTodo.executorUnionIds
        : [],
    creatorUnionId,
    recoveryUnionIds: productManagerUnionId && productManagerUnionId !== creatorUnionId
      ? [productManagerUnionId]
      : []
  };
}

export async function onRequest({ request, env, data = {} }, dependencies = {}) {
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
      const saved = await persistTaskTodoSyncResult({
        db,
        sourceId: body.sourceId,
        payload: authorizedBody,
        todo,
        session: data.session,
        sourceEnvironment: data.dataEnvironment?.id || "display"
      });
      return jsonResponse({ synced: true, todo, task: saved.task, version: saved.version, updatedAt: saved.updatedAt });
    }
    const getUserToken = dependencies.getUserToken || getValidDingUserToken;
    const syncPersonalTodo = dependencies.syncPersonalTodo || syncDingPersonalTodoTask;
    const retireWorkTodo = dependencies.retireWorkTodo || retireReplacedWorkTodo;
    let todo = await syncPersonalTodo(
      await getUserToken(request, env),
      authorizedBody
    );
    const replacesWorkTodo = Boolean(
      authorizedBody.replacementOfTodoId
      && String(authorizedBody.replacementTodoSource || "").startsWith("todo_open_")
    );
    if (replacesWorkTodo) {
      todo = {
        ...todo,
        legacyTodo: {
          id: authorizedBody.replacementOfTodoId,
          source: authorizedBody.replacementTodoSource,
          creatorUnionId: authorizedBody.replacementCreatorUnionId,
          executorUnionIds: authorizedBody.replacementExecutorUnionIds
        }
      };
    }
    let saved = await persistTaskTodoSyncResult({
      db,
      sourceId: body.sourceId,
      payload: authorizedBody,
      todo,
      session: data.session,
      sourceEnvironment: data.dataEnvironment?.id || "production"
    });
    if (replacesWorkTodo) {
      const getAppToken = dependencies.getAppToken || getDingAccessToken;
      todo = await retireWorkTodo(
        await getAppToken(env),
        authorizedBody,
        todo
      );
      todo = { ...todo, legacyTodo: null };
      saved = await persistTaskTodoSyncResult({
        db,
        sourceId: body.sourceId,
        payload: authorizedBody,
        todo,
        session: data.session,
        sourceEnvironment: data.dataEnvironment?.id || "production"
      });
    }
    return jsonResponse({ synced: true, todo, task: saved.task, version: saved.version, updatedAt: saved.updatedAt });
  } catch (error) {
    const safe = safeDingTalkError(error, "钉钉待办同步失败，请稍后重试。");
    return jsonResponse(safe.body, safe.status);
  }
}
