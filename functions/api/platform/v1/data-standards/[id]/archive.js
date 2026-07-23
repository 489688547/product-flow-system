import { dataStandardActor, requireDefinitionView, requireDefinitionWrite } from "../../_shared/dataStandardsAuthorization.js";
import { DataStandardsHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireDatabase, requireSession } from "../../_shared/dataStandardsHttp.js";
import { archiveDefinition, dataStandardsDatabase, ensureDataStandardsTables, getDefinitionDetail } from "../../_shared/dataStandardsStorage.js";
import { validateArchiveInput } from "../../_shared/dataStandardsValidation.js";

function id(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
}

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse(["POST", "OPTIONS"]);
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const session = requireSession(data);
    const actor = dataStandardActor(session);
    requireDefinitionView(actor);
    const db = requireDatabase(dataStandardsDatabase(env, data));
    await ensureDataStandardsTables(db);
    const existing = await getDefinitionDetail(db, String(params.id || ""));
    if (!existing) throw new DataStandardsHttpError(404, "DATA_STANDARD_INVALID", "数据口径不存在或不可用。");
    requireDefinitionWrite(actor, existing.ownerDepartment);
    const { expectedVersion } = validateArchiveInput(await readJson(request));
    if (expectedVersion !== existing.currentVersion) {
      throw new DataStandardsHttpError(409, "DATA_STANDARD_VERSION_CONFLICT", "口径版本已更新，请刷新后重试。", { currentVersion: existing.currentVersion });
    }
    const now = new Date().toISOString();
    await archiveDefinition(db, existing.id, expectedVersion, {
      id: id("audit"),
      action: "archive",
      actorId: actor.id,
      actorName: actor.name,
      definitionVersion: existing.currentVersion,
      changedFields: ["status"],
      createdAt: now
    });
    const saved = await getDefinitionDetail(db, existing.id);
    return jsonResponse({ synced: true, definition: saved });
  } catch (error) {
    return errorResponse(error);
  }
}
