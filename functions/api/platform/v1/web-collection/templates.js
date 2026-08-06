import { successResponse, routeError } from "./_shared/http.js";
import {
  collectorIdempotencyKey,
  createCollectorTemplate,
  listCollectorTemplates
} from "./_shared/templateStorage.js";
import { runCollectorSessionRoute } from "./_shared/templateRoute.js";

export async function onRequest(context) {
  return runCollectorSessionRoute(context, {
    permission: context.request.method === "GET" ? "view" : "write",
    methods: ["GET", "POST"],
    handler: async ({ request, db, actor, requestId }) => {
      if (request.method === "GET") {
        return successResponse(await listCollectorTemplates(db), requestId);
      }
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body) || !body.template) {
        throw routeError(400, "COLLECTOR_TEMPLATE_INVALID", "请求内容不是有效的采集模板对象。");
      }
      const result = await createCollectorTemplate(db, body.template, {
        actor,
        idempotencyKey: collectorIdempotencyKey(request)
      });
      return successResponse(result, requestId, result.idempotentReplay ? 200 : 201);
    }
  });
}
