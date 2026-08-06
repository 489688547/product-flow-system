import { routeError, successResponse } from "../../_shared/http.js";
import {
  appendCollectorTemplateVersion,
  collectorIdempotencyKey
} from "../../_shared/templateStorage.js";
import { runCollectorSessionRoute } from "../../_shared/templateRoute.js";

export async function onRequest(context) {
  return runCollectorSessionRoute(context, {
    permission: "write",
    methods: ["POST"],
    handler: async ({ request, db, actor, requestId, params }) => {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw routeError(400, "COLLECTOR_TEMPLATE_INVALID", "采集模板改版请求无效。");
      }
      const result = await appendCollectorTemplateVersion(db, String(params?.id || ""), {
        expectedVersion: body.expectedVersion,
        patch: body.patch,
        actor,
        idempotencyKey: collectorIdempotencyKey(request)
      });
      return successResponse(result, requestId, result.idempotentReplay ? 200 : 201);
    }
  });
}
