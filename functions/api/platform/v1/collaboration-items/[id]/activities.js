import { assertCanRead, collaborationActor } from "../../_shared/collaborationAuthorization.js";
import { CollaborationHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, requireSession } from "../../_shared/collaborationHttp.js";
import { collaborationDatabase, ensureCollaborationTables, findItemById, listActivities } from "../../_shared/collaborationStorage.js";

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return methodNotAllowed();
  try {
    const actor = collaborationActor(requireSession(data));
    const db = collaborationDatabase(env);
    if (!db) throw new CollaborationHttpError(501, "COLLABORATION_STORAGE_UNAVAILABLE", "共享协同数据暂不可用。", undefined, true);
    await ensureCollaborationTables(db);
    const item = await findItemById(db, params.id);
    if (!item) throw new CollaborationHttpError(404, "COLLABORATION_ITEM_NOT_FOUND", "协同事项不存在或当前无权查看。");
    assertCanRead(item, actor);
    return jsonResponse({ synced: true, activities: await listActivities(db, item.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
