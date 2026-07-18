import { applyCollaborationTransition } from "../../../../../../src/domain/collaboration.js";
import { assertCanRead, collaborationActor } from "../../_shared/collaborationAuthorization.js";
import { CollaborationHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireSession, requireWritable } from "../../_shared/collaborationHttp.js";
import { collaborationDatabase, ensureCollaborationTables, findActivityByIdempotencyKey, findItemById, updateItem } from "../../_shared/collaborationStorage.js";
import { validateTransitionInput } from "../../_shared/collaborationValidation.js";

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const session = requireSession(data);
    requireWritable(session);
    const actor = collaborationActor(session);
    const db = collaborationDatabase(env);
    if (!db) throw new CollaborationHttpError(501, "COLLABORATION_STORAGE_UNAVAILABLE", "共享协同数据暂不可用。", undefined, true);
    await ensureCollaborationTables(db);
    const item = await findItemById(db, params.id);
    if (!item) throw new CollaborationHttpError(404, "COLLABORATION_ITEM_NOT_FOUND", "协同事项不存在或当前无权查看。");
    assertCanRead(item, actor);
    const input = validateTransitionInput(await readJson(request));
    const existingActivity = await findActivityByIdempotencyKey(db, item.id, input.idempotencyKey);
    if (existingActivity) return jsonResponse({ synced: true, deduplicated: true, item });
    if (input.version !== item.version) {
      throw new CollaborationHttpError(409, "COLLABORATION_VERSION_CONFLICT", "事项已被其他同事更新，请刷新后重试。", { currentVersion: item.version, updatedAt: item.updatedAt });
    }
    let result;
    try {
      result = applyCollaborationTransition(item, input, actor, new Date());
    } catch (error) {
      throw new CollaborationHttpError(400, "COLLABORATION_TRANSITION_INVALID", error.message || "当前状态不能执行此动作。");
    }
    const saved = await updateItem(db, result.item, input.version, result.activity);
    if (!saved) {
      const current = await findItemById(db, item.id);
      throw new CollaborationHttpError(409, "COLLABORATION_VERSION_CONFLICT", "事项已被其他同事更新，请刷新后重试。", { currentVersion: current?.version, updatedAt: current?.updatedAt });
    }
    return jsonResponse({ synced: true, item: result.item });
  } catch (error) {
    return errorResponse(error);
  }
}
