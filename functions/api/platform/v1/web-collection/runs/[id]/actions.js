import { errorResponse, requestId, routeError, successResponse } from "../../_shared/http.js";
import { authenticateWebCollectionRunner, webCollectionDatabase } from "../../_shared/storage.js";
import {
  applyExperimentalRunAction,
  collectorIdempotencyKey
} from "../../_shared/templateStorage.js";
import { normalizeCollectorRouteError } from "../../_shared/templateRoute.js";

export async function onRequest(context) {
  const id = requestId();
  try {
    if (context.request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
    }
    if (context.request.method !== "POST") {
      throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    }
    const db = webCollectionDatabase(context.env);
    if (!db) throw routeError(501, "WEB_COLLECTION_STORAGE_UNAVAILABLE", "网页采集控制数据库暂不可用。", true);
    const runner = await authenticateWebCollectionRunner(db, context.request);
    const body = await context.request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw routeError(400, "COLLECTOR_RUN_INPUT_INVALID", "实验采集运行操作无效。");
    }
    const result = await applyExperimentalRunAction(db, String(context.params?.id || ""), body, {
      runner,
      idempotencyKey: collectorIdempotencyKey(context.request)
    });
    return successResponse(result, id);
  } catch (error) {
    return errorResponse(normalizeCollectorRouteError(error), id);
  }
}
