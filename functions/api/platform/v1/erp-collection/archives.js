import { normalizeErpArchive } from "../../../../../src/domain/kuaimaiErpCollection.js";
import { authorizeErpCollection } from "./_shared/authorization.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { authenticateErpCollector, erpCollectionDatabase, listErpArchives, upsertErpArchive } from "./_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  const id = requestId();
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "GET, POST, OPTIONS" } });
    const db = erpCollectionDatabase(env);
    if (!db) throw routeError(501, "ERP_COLLECTION_STORAGE_UNAVAILABLE", "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", true);
    if (request.method === "POST") {
      const actor = data.session ? authorizeErpCollection(data.session) : await authenticateErpCollector(db, request);
      const body = await request.json().catch(() => {
        throw routeError(400, "VALIDATION_INVALID_JSON", "请求内容不是有效的 JSON 对象。");
      });
      const archive = normalizeErpArchive(body?.archive || body);
      if (actor.runnerId) archive.runnerId = actor.runnerId;
      const result = await upsertErpArchive(db, archive, actor);
      return successResponse(result, id, result.duplicateFile ? 200 : 201);
    }
    if (request.method !== "GET") throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    authorizeErpCollection(data.session);
    const url = new URL(request.url);
    const archives = await listErpArchives(db, {
      resourceType: String(url.searchParams.get("resourceType") || "").trim(),
      status: String(url.searchParams.get("status") || "").trim(),
      limit: url.searchParams.get("limit") || 100
    });
    return successResponse({ archives }, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}
