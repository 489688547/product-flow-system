import { filterCollaborationItems } from "../../../../src/domain/collaboration.js";
import { collaborationActor, participantSubjects, requesterIdentity } from "./_shared/collaborationAuthorization.js";
import { CollaborationHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireSession, requireWritable } from "./_shared/collaborationHttp.js";
import { collaborationDatabase, createActivity, ensureCollaborationTables, findItemByIdempotencyKey, insertItem, listItems } from "./_shared/collaborationStorage.js";
import { validateCreateInput } from "./_shared/collaborationValidation.js";

const VIEWS = new Set(["my_scope", "pending_acceptance", "in_progress", "waiting_others", "pending_verification", "participating", "completed", "executive"]);
const STATUSES = new Set(["pending_acceptance", "in_progress", "blocked", "pending_verification", "closed", "returned", "cancelled"]);

function parseBoolean(value) {
  return value === "true" || value === "1";
}

function parseQuery(request, actor) {
  const params = new URL(request.url).searchParams;
  const view = params.get("view") || "my_scope";
  const status = params.getAll("status").flatMap(value => value.split(",")).filter(Boolean);
  const limit = Number(params.get("limit") || 50);
  if (!VIEWS.has(view) || status.some(value => !STATUSES.has(value)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new CollaborationHttpError(400, "COLLABORATION_ITEM_INVALID", "协同事项筛选条件无效。");
  }
  const departmentId = String(params.get("departmentId") || "").slice(0, 120);
  if (view === "executive" && !actor.executive) {
    throw new CollaborationHttpError(403, "PERMISSION_READ_DENIED", "当前身份不能查看该协同范围。");
  }
  if (departmentId && !actor.executive && !actor.departmentIds.includes(departmentId) && !actor.departmentNames.includes(departmentId)) {
    throw new CollaborationHttpError(403, "PERMISSION_READ_DENIED", "当前身份不能查看该协同范围。");
  }
  return {
    view,
    status,
    appId: String(params.get("appId") || "").slice(0, 80),
    kind: String(params.get("kind") || "").slice(0, 40),
    impactLevel: String(params.get("impactLevel") || "").slice(0, 20),
    departmentId,
    query: String(params.get("query") || "").slice(0, 80),
    dueBefore: String(params.get("dueBefore") || ""),
    includeArchived: parseBoolean(params.get("includeArchived")),
    cursor: String(params.get("cursor") || ""),
    limit
  };
}

function requireDatabase(env, data) {
  const db = collaborationDatabase(env, data);
  if (!db) throw new CollaborationHttpError(501, "COLLABORATION_STORAGE_UNAVAILABLE", "共享协同数据暂不可用。", undefined, true);
  return db;
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return methodNotAllowed();
  try {
    const session = requireSession(data);
    const actor = collaborationActor(session);
    const db = requireDatabase(env, data);
    await ensureCollaborationTables(db);

    if (request.method === "GET") {
      const query = parseQuery(request, actor);
      const result = await listItems(db, actor, query, participantSubjects(actor));
      const items = filterCollaborationItems(result.items, query, actor);
      return jsonResponse({
        synced: true,
        items,
        nextCursor: result.nextCursor,
        scope: { mode: actor.executive ? "company" : "department", departmentIds: actor.departmentIds }
      });
    }

    requireWritable(session);
    const body = await readJson(request);
    const existing = await findItemByIdempotencyKey(db, String(body.idempotencyKey || ""));
    if (existing) return jsonResponse({ synced: true, deduplicated: true, item: existing });
    const now = new Date();
    const item = validateCreateInput(body, requesterIdentity(actor), now);
    const activity = createActivity(item, actor, "create", { idempotencyKey: `create:${item.idempotencyKey}`, now });
    await insertItem(db, item, activity);
    return jsonResponse({ synced: true, item }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
