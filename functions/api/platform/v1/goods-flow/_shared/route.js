import { authorizeGoodsFlow } from "./authorization.js";
import { errorResponse, goodsFlowError, optionsResponse, requestId } from "./http.js";
import { goodsFlowDatabase } from "./storage.js";

export async function runGoodsFlowRoute(context, { action = "read", methods = ["GET"], handler }) {
  const id = requestId();
  try {
    if (context.request.method === "OPTIONS") return optionsResponse();
    if (!methods.includes(context.request.method)) throw goodsFlowError("VALIDATION_METHOD_NOT_ALLOWED", 405, "Method not allowed");
    const actor = authorizeGoodsFlow(context.data?.session, action);
    const db = goodsFlowDatabase(context.env, context.data);
    if (!db) throw goodsFlowError("GOODS_FLOW_STORAGE_UNAVAILABLE", 501, "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", true);
    return await handler({ ...context, db, actor, requestId: id });
  } catch (error) {
    return errorResponse(error, id);
  }
}
