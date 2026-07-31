import { collectionTargetFromRequestData } from "../../_shared/collectionTarget.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { authenticateWebCollectionRunner, webCollectionDatabase } from "./_shared/storage.js";
import {
  collectorIdempotencyKey,
  createExperimentalRun,
  listExperimentalRunsForRunner
} from "./_shared/templateStorage.js";
import { runCollectorSessionRoute } from "./_shared/templateRoute.js";

export async function onRequest(context) {
  if (context.request.method === "GET") {
    const id = requestId();
    try {
      const db = webCollectionDatabase(context.env);
      if (!db) throw routeError(501, "WEB_COLLECTION_STORAGE_UNAVAILABLE", "网页采集控制数据库暂不可用。", true);
      if (context.env?.COLLECTOR_EXPERIMENTAL_MODE !== "1") {
        throw routeError(503, "COLLECTOR_EXPERIMENT_DISABLED", "服务端实验采集模式尚未启用。");
      }
      const runner = await authenticateWebCollectionRunner(db, context.request);
      return successResponse(await listExperimentalRunsForRunner(db, runner), id);
    } catch (error) {
      return errorResponse(error, id);
    }
  }
  return runCollectorSessionRoute(context, {
    permission: "trigger",
    methods: ["POST"],
    handler: async ({ request, db, actor, requestId, data, env }) => {
      if (env?.COLLECTOR_EXPERIMENTAL_MODE !== "1") {
        throw routeError(503, "COLLECTOR_EXPERIMENT_DISABLED", "服务端实验采集模式尚未启用。");
      }
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw routeError(400, "COLLECTOR_RUN_INPUT_INVALID", "实验采集运行请求无效。");
      }
      const result = await createExperimentalRun(db, body, {
        actor,
        target: collectionTargetFromRequestData(data),
        idempotencyKey: collectorIdempotencyKey(request)
      });
      return successResponse(result, requestId, result.idempotentReplay ? 200 : 201);
    }
  });
}
