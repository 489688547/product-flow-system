import {
  backlogActor,
  findBacklogConflicts,
  resolveBacklogAction
} from "../../../../../../src/domain/developmentBacklog.js";
import { BacklogHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireExpectedVersion, requireSession } from "../_shared/http.js";
import { readAllBacklogItems, readBacklogItem, requireBacklogDatabase, updateBacklogItem } from "../_shared/storage.js";

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const actor = backlogActor(requireSession(data));
    const db = requireBacklogDatabase(env, data);
    const body = await readJson(request);
    const expectedVersion = requireExpectedVersion(body.expectedVersion);
    const current = await readBacklogItem(db, String(params.id || ""));
    if (!current) throw new BacklogHttpError(404, "BACKLOG_NOT_FOUND", "研发待办不存在。");
    if (current.version !== expectedVersion) {
      throw new BacklogHttpError(409, "BACKLOG_VERSION_CONFLICT", "事项已被其他任务更新，请刷新后重试。", {
        currentVersion: current.version
      });
    }
    if (body.action === "claim") {
      if (!current.scopePaths.length) {
        throw new BacklogHttpError(409, "BACKLOG_SCOPE_REQUIRED", "请先明确受影响路径再认领。");
      }
      const conflicts = findBacklogConflicts(current, await readAllBacklogItems(db));
      if (conflicts.length) {
        throw new BacklogHttpError(409, "BACKLOG_ACTIVE_CONFLICT", "存在范围重叠的活跃研发待办。", { conflicts });
      }
    }
    const resolved = resolveBacklogAction(current, body.action, actor, body);
    const item = await updateBacklogItem(db, current, resolved.patch, actor, body.action, {
      expectedVersion,
      changedFields: Object.keys(resolved.patch),
      evidenceSummary: resolved.evidenceSummary
    });
    return jsonResponse({ synced: true, item });
  } catch (error) {
    return errorResponse(error, "BACKLOG_WRITE_FAILED");
  }
}
