import { jsonResponse, optionsResponse } from "../../dingtalk/_shared/dingtalk.js";
import {
  authorizeProductionAccess,
  createProductionWriteUnlock,
  ensureProductionAccessTables,
  productionAccessError,
  revokeProductionWriteUnlocks
} from "../_shared/productionDataAccess.js";

function database(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

function errorResponse(error) {
  const message = error?.message || "生产写入授权失败。";
  const requestId = crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ allowed: false, message, error: { code: error?.code || "PRODUCTION_ACCESS_FAILED", message, requestId, retryable: Boolean(error?.retryable) } }, error?.status || 500);
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST", "DELETE"].includes(request.method)) return errorResponse(productionAccessError("Method not allowed", 405, "METHOD_NOT_ALLOWED"));
  const db = database(env);
  if (!db) return errorResponse(productionAccessError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", 501, "PRODUCTION_STORAGE_UNAVAILABLE"));
  try {
    await ensureProductionAccessTables(db);
    const access = await authorizeProductionAccess(request, db, { capability: request.method === "GET" ? "read" : "write" });
    if (request.method === "GET") {
      return jsonResponse({ allowed: access.capabilities.includes("write"), unlocked: false, expiresAt: "", reason: "" });
    }
    if (request.method === "DELETE") {
      await revokeProductionWriteUnlocks(db, access);
      return jsonResponse({ allowed: true, unlocked: false, expiresAt: "", reason: "" });
    }
    const input = await request.json().catch(() => ({}));
    const unlocked = await createProductionWriteUnlock(db, access, input);
    return jsonResponse({ allowed: true, unlocked: true, ...unlocked });
  } catch (error) {
    return errorResponse(error);
  }
}
