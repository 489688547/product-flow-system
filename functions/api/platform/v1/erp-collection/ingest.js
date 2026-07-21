import { normalizeErpCollectionPayload } from "../../../../../src/domain/kuaimaiErpCollection.js";
import { authorizeErpCollection } from "./_shared/authorization.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { erpCollectionDatabase, ingestErpCollection } from "./_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  const id = requestId();
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
    if (request.method !== "POST") throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    const actor = authorizeErpCollection(data.session);
    const db = erpCollectionDatabase(env);
    if (!db) throw routeError(501, "ERP_COLLECTION_STORAGE_UNAVAILABLE", "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", true);
    const idempotencyKey = String(request.headers.get("idempotency-key") || "").trim();
    if (!idempotencyKey) throw routeError(400, "ERP_COLLECTION_IDEMPOTENCY_KEY_REQUIRED", "写入操作需要 Idempotency-Key。");
    const body = await request.json().catch(() => {
      throw routeError(400, "VALIDATION_INVALID_JSON", "请求内容不是有效的 JSON 对象。");
    });
    const normalized = normalizeErpCollectionPayload(body, { idempotencyKey });
    const result = await ingestErpCollection(db, normalized, actor);
    return successResponse(result, id, result.duplicateFile && result.counts.inserted === 0 && result.counts.updated === 0 ? 200 : 201);
  } catch (error) {
    return errorResponse(error, id);
  }
}
