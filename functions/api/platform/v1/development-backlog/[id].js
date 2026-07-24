import {
  backlogActor,
  canManageBacklog,
  findBacklogConflicts,
  normalizeBacklogDraft
} from "../../../../../src/domain/developmentBacklog.js";
import { BacklogHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireExpectedVersion, requireSession } from "./_shared/http.js";
import { readAllBacklogItems, readBacklogEvents, readBacklogItem, requireBacklogDatabase, updateBacklogItem } from "./_shared/storage.js";

function requireItem(item) {
  if (!item) throw new BacklogHttpError(404, "BACKLOG_NOT_FOUND", "研发待办不存在。");
  return item;
}

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "PATCH"].includes(request.method)) return methodNotAllowed();
  const fallback = request.method === "PATCH" ? "BACKLOG_WRITE_FAILED" : "BACKLOG_QUERY_FAILED";
  try {
    const actor = backlogActor(requireSession(data));
    const db = requireBacklogDatabase(env, data);
    const current = requireItem(await readBacklogItem(db, String(params.id || "")));
    if (request.method === "GET") {
      const [events, allItems] = await Promise.all([
        readBacklogEvents(db, current.id),
        readAllBacklogItems(db)
      ]);
      return jsonResponse({
        synced: true,
        item: {
          ...current,
          conflicts: findBacklogConflicts(current, allItems)
        },
        events
      });
    }
    if (!canManageBacklog(actor)) {
      throw new BacklogHttpError(403, "BACKLOG_FORBIDDEN", "仅总经办可编辑研发待办。");
    }
    const body = await readJson(request);
    const expectedVersion = requireExpectedVersion(body.expectedVersion);
    const incoming = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? body.patch : {};
    const normalized = normalizeBacklogDraft({
      title: incoming.title ?? current.title,
      background: incoming.background ?? current.background,
      moduleId: incoming.moduleId ?? current.moduleId,
      priority: incoming.priority ?? current.priority,
      acceptanceCriteria: incoming.acceptanceCriteria ?? current.acceptanceCriteria,
      scopePaths: incoming.scopePaths ?? current.scopePaths,
      dependencyIds: incoming.dependencyIds ?? current.dependencyIds,
      sourceType: current.sourceType
    });
    const editable = ["title", "background", "moduleId", "priority", "acceptanceCriteria", "scopePaths", "dependencyIds"];
    const changedFields = editable.filter(key => JSON.stringify(normalized[key]) !== JSON.stringify(current[key]));
    const nextStatus = ["clarification", "ready"].includes(current.status) ? normalized.status : current.status;
    const item = await updateBacklogItem(db, current, {
      ...Object.fromEntries(editable.map(key => [key, normalized[key]])),
      status: nextStatus
    }, actor, "edit", { expectedVersion, changedFields });
    return jsonResponse({ synced: true, item });
  } catch (error) {
    return errorResponse(error, fallback);
  }
}
