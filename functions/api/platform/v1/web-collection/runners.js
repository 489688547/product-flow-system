import { authorizeProductionAccess } from "../../_shared/productionDataAccess.js";
import { authorizeWebCollectionAdmin } from "./_shared/authorization.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { registerWebCollectionRunner, webCollectionDatabase } from "./_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  const id = requestId();
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
    if (request.method !== "POST") throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    const db = webCollectionDatabase(env);
    if (!db) throw routeError(501, "WEB_COLLECTION_STORAGE_UNAVAILABLE", "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", true);
    const session = data.session || await authorizeProductionAccess(request, db, { capability: "write" });
    const actor = authorizeWebCollectionAdmin(session);
    const body = await request.json().catch(() => { throw routeError(400, "VALIDATION_INVALID_JSON", "请求内容不是有效的 JSON 对象。"); });
    const result = await registerWebCollectionRunner(db, { name: body?.name }, actor);
    return successResponse({ ...result, tokenNotice: "令牌只显示一次，安装命令会写入公司 Mac 钥匙串。" }, id, 201);
  } catch (error) {
    return errorResponse(error, id);
  }
}
