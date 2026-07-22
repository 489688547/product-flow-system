import { authorizeErpCollection } from "./_shared/authorization.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { erpCollectionDatabase, listErpArchives } from "./_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  const id = requestId();
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "GET, OPTIONS" } });
    if (request.method !== "GET") throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    authorizeErpCollection(data.session);
    const db = erpCollectionDatabase(env);
    if (!db) throw routeError(501, "ERP_COLLECTION_STORAGE_UNAVAILABLE", "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", true);
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

