import { authorizeWebCollectionView } from "./_shared/authorization.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import {
  authenticateWebCollectionRunner,
  claimWebCollectionJob,
  completeWebCollectionJob,
  ensureWebCollectionPlan,
  heartbeatRunner,
  listWebCollectionStatus,
  recordWebCollectionNotification,
  transitionWebCollectionJob,
  webCollectionDatabase
} from "./_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  const id = requestId();
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "GET, POST, OPTIONS" } });
    const db = webCollectionDatabase(env);
    if (!db) throw routeError(501, "WEB_COLLECTION_STORAGE_UNAVAILABLE", "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", true);
    if (request.method === "GET") {
      authorizeWebCollectionView(data.session);
      const url = new URL(request.url);
      return successResponse(await listWebCollectionStatus(db, { limit: url.searchParams.get("limit") }), id);
    }
    if (request.method !== "POST") throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    const runner = await authenticateWebCollectionRunner(db, request);
    const body = await request.json().catch(() => { throw routeError(400, "VALIDATION_INVALID_JSON", "请求内容不是有效的 JSON 对象。"); });
    let result;
    switch (body?.action) {
      case "heartbeat": result = await heartbeatRunner(db, runner, body); break;
      case "ensure_plan": result = await ensureWebCollectionPlan(db, body.jobs); break;
      case "claim": result = await claimWebCollectionJob(db, runner, body); break;
      case "transition": result = await transitionWebCollectionJob(db, runner, body); break;
      case "complete": result = await completeWebCollectionJob(db, runner, body); break;
      case "record_notification": result = await recordWebCollectionNotification(db, runner, body); break;
      default: throw routeError(400, "WEB_COLLECTION_ACTION_INVALID", "采集任务动作无效。");
    }
    return successResponse(result, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}

