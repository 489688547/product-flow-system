import { assertCanEdit, assertCanRead, collaborationActor } from "../_shared/collaborationAuthorization.js";
import { CollaborationHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireSession, requireWritable } from "../_shared/collaborationHttp.js";
import { collaborationDatabase, createActivity, ensureCollaborationTables, findItemById, updateItem } from "../_shared/collaborationStorage.js";
import { validatePatchInput } from "../_shared/collaborationValidation.js";

function database(env, data) {
  const db = collaborationDatabase(env, data);
  if (!db) throw new CollaborationHttpError(501, "COLLABORATION_STORAGE_UNAVAILABLE", "共享协同数据暂不可用。", undefined, true);
  return db;
}

function changedFields(before, after) {
  return Object.keys(after).filter(key => !["version", "updatedAt", "updatedBy"].includes(key)
    && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "PATCH"].includes(request.method)) return methodNotAllowed();
  try {
    const session = requireSession(data);
    const actor = collaborationActor(session);
    const db = database(env, data);
    await ensureCollaborationTables(db);
    const item = await findItemById(db, params.id);
    if (!item) throw new CollaborationHttpError(404, "COLLABORATION_ITEM_NOT_FOUND", "协同事项不存在或当前无权查看。");
    assertCanRead(item, actor);
    if (request.method === "GET") return jsonResponse({ synced: true, item });

    requireWritable(session);
    assertCanEdit(item, actor);
    const body = await readJson(request);
    if (body.version !== item.version) {
      throw new CollaborationHttpError(409, "COLLABORATION_VERSION_CONFLICT", "事项已被其他同事更新，请刷新后重试。", { currentVersion: item.version, updatedAt: item.updatedAt });
    }
    const update = validatePatchInput(body, item, actor, new Date());
    const activity = createActivity(update.item, actor, update.action, {
      idempotencyKey: `${update.action}:${update.item.id}:${update.item.version}`,
      fromStatus: item.status,
      toStatus: update.item.status,
      reason: update.reason,
      changedFields: changedFields(item, update.item),
      now: update.item.updatedAt
    });
    const saved = await updateItem(db, update.item, update.expectedVersion, activity);
    if (!saved) {
      const current = await findItemById(db, params.id);
      throw new CollaborationHttpError(409, "COLLABORATION_VERSION_CONFLICT", "事项已被其他同事更新，请刷新后重试。", { currentVersion: current?.version, updatedAt: current?.updatedAt });
    }
    return jsonResponse({ synced: true, item: update.item });
  } catch (error) {
    return errorResponse(error);
  }
}
