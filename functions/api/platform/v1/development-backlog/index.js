import {
  BACKLOG_MODULES,
  BACKLOG_PRIORITIES,
  BACKLOG_STATUSES,
  backlogActor,
  canManageBacklog,
  findBacklogConflicts,
  normalizeBacklogDraft
} from "../../../../../src/domain/developmentBacklog.js";
import { BacklogHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireSession } from "./_shared/http.js";
import { createBacklogItem, listBacklogItems, readAllBacklogItems, requireBacklogDatabase } from "./_shared/storage.js";

function parseBoolean(value) {
  return value === "1" || value === "true";
}

function parseQuery(request) {
  const params = new URL(request.url).searchParams;
  const query = {
    status: String(params.get("status") || ""),
    priority: String(params.get("priority") || ""),
    moduleId: String(params.get("moduleId") || ""),
    ownerId: String(params.get("ownerId") || "").slice(0, 120),
    query: String(params.get("query") || "").trim().slice(0, 120),
    includeClosed: parseBoolean(params.get("includeClosed")),
    page: Number(params.get("page") || 1),
    pageSize: Number(params.get("pageSize") || 30)
  };
  if (
    (query.status && !BACKLOG_STATUSES.includes(query.status))
    || (query.priority && !BACKLOG_PRIORITIES.includes(query.priority))
    || (query.moduleId && !BACKLOG_MODULES.some(module => module.id === query.moduleId))
    || !Number.isInteger(query.page)
    || query.page < 1
    || !Number.isInteger(query.pageSize)
    || query.pageSize < 1
    || query.pageSize > 100
  ) {
    throw new BacklogHttpError(400, "BACKLOG_INPUT_INVALID", "研发待办筛选条件无效。");
  }
  return query;
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return methodNotAllowed();
  const fallback = request.method === "POST" ? "BACKLOG_WRITE_FAILED" : "BACKLOG_QUERY_FAILED";
  try {
    const actor = backlogActor(requireSession(data));
    const db = requireBacklogDatabase(env, data);
    if (request.method === "GET") {
      const result = await listBacklogItems(db, parseQuery(request));
      const activeItems = await readAllBacklogItems(db);
      return jsonResponse({
        synced: true,
        ...result,
        items: result.items.map(item => ({
          ...item,
          conflicts: findBacklogConflicts(item, activeItems)
        }))
      });
    }
    if (!canManageBacklog(actor)) {
      throw new BacklogHttpError(403, "BACKLOG_FORBIDDEN", "仅总经办可新增研发待办。");
    }
    const body = await readJson(request);
    const draft = normalizeBacklogDraft(body);
    const item = await createBacklogItem(db, draft, actor);
    return jsonResponse({ synced: true, item: { ...item, conflicts: [] } }, 201);
  } catch (error) {
    return errorResponse(error, fallback);
  }
}
