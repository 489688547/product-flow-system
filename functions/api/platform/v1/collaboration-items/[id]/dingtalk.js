import { normalizeCollaborationDraft } from "../../../../../../src/domain/collaboration.js";
import { buildCollaborationTodoPayload } from "../../../../../../src/domain/collaborationNotifications.js";
import { getDingAccessToken, syncDingTodoTask } from "../../../../dingtalk/_shared/dingtalk.js";
import { assertCanRead, collaborationActor } from "../../_shared/collaborationAuthorization.js";
import { CollaborationHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireSession, requireWritable } from "../../_shared/collaborationHttp.js";
import { collaborationDatabase, createActivity, ensureCollaborationTables, findItemById, updateItem } from "../../_shared/collaborationStorage.js";

function userMatches(identity, actor) {
  return Boolean((identity?.userId && identity.userId === actor.userId) || (identity?.unionId && identity.unionId === actor.unionId));
}

function dependencies(data = {}) {
  return data.collaborationDingTalkDependencies || {
    ensureTables: ensureCollaborationTables,
    findItem: findItemById,
    updateItem,
    getAccessToken: getDingAccessToken,
    syncTodo: syncDingTodoTask
  };
}

function conflict(item) {
  return new CollaborationHttpError(409, "COLLABORATION_VERSION_CONFLICT", "事项已被其他同事更新，请刷新后重试。", { currentVersion: item?.version, updatedAt: item?.updatedAt });
}

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const session = requireSession(data);
    requireWritable(session);
    const actor = collaborationActor(session);
    const db = collaborationDatabase(env, data);
    if (!db) throw new CollaborationHttpError(501, "COLLABORATION_STORAGE_UNAVAILABLE", "共享协同数据暂不可用。", undefined, true);
    const deps = dependencies(data);
    await deps.ensureTables(db);
    const item = await deps.findItem(db, params.id);
    if (!item) throw new CollaborationHttpError(404, "COLLABORATION_ITEM_NOT_FOUND", "协同事项不存在或当前无权查看。");
    assertCanRead(item, actor);
    if (!actor.executive && !userMatches(item.requesterUser, actor) && !userMatches(item.ownerUser, actor)) {
      throw new CollaborationHttpError(403, "PERMISSION_WRITE_DENIED", "只有发起人、主负责人或总经办可以同步协同待办。");
    }
    const body = await readJson(request);
    if (!Number.isInteger(body.version) || body.version !== item.version) throw conflict(item);
    let todoInput;
    try {
      todoInput = buildCollaborationTodoPayload(item, actor, body.detailUrl);
    } catch (validationError) {
      throw new CollaborationHttpError(400, "COLLABORATION_ITEM_INVALID", validationError.message);
    }
    const now = new Date().toISOString();
    try {
      const accessToken = await deps.getAccessToken(env);
      const todo = await deps.syncTodo(accessToken, todoInput);
      const next = normalizeCollaborationDraft({
        ...item,
        version: item.version + 1,
        updatedAt: now,
        updatedBy: { userId: actor.userId, unionId: actor.unionId, name: actor.name },
        dingTodo: {
          id: todo.id || todo.taskId || todoInput.todoId,
          sourceId: todo.sourceId || todoInput.sourceId,
          creatorUnionId: todoInput.creatorUnionId,
          executorUnionIds: todoInput.executorUnionIds,
          syncedAt: now,
          lastError: "",
          failedAt: ""
        }
      }, { now });
      const activity = createActivity(next, actor, "sync_dingtalk", { idempotencyKey: `dingtalk:${next.id}:${next.version}`, fromStatus: item.status, toStatus: item.status, changedFields: ["dingTodo"], now });
      if (!await deps.updateItem(db, next, item.version, activity)) throw conflict(await deps.findItem(db, item.id));
      return jsonResponse({ synced: true, item: next, todo: { id: next.dingTodo.id, updated: Boolean(todo.updated) } });
    } catch (providerError) {
      if (providerError instanceof CollaborationHttpError) throw providerError;
      const failed = normalizeCollaborationDraft({
        ...item,
        version: item.version + 1,
        updatedAt: now,
        updatedBy: { userId: actor.userId, unionId: actor.unionId, name: actor.name },
        dingTodo: {
          ...(item.dingTodo || {}),
          sourceId: todoInput.sourceId,
          creatorUnionId: todoInput.creatorUnionId,
          executorUnionIds: todoInput.executorUnionIds,
          lastError: "钉钉待办同步失败，请稍后重试。",
          failedAt: now
        }
      }, { now });
      const activity = createActivity(failed, actor, "sync_dingtalk_failed", { idempotencyKey: `dingtalk-failed:${failed.id}:${failed.version}`, fromStatus: item.status, toStatus: item.status, reason: "钉钉待办同步失败，请稍后重试。", changedFields: ["dingTodo"], now });
      if (!await deps.updateItem(db, failed, item.version, activity)) throw conflict(await deps.findItem(db, item.id));
      throw new CollaborationHttpError(502, "DINGTALK_TODO_SYNC_FAILED", "协同事项已保存，但钉钉待办同步失败。", undefined, true);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
