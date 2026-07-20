import { readJson, requireIdempotencyKey, successResponse } from "./_shared/http.js";
import { runGoodsFlowRoute } from "./_shared/route.js";
import { listReceivableTerms, upsertReceivableTerm } from "./_shared/storage.js";

export async function onRequest(context) {
  const action = context.request.method === "GET" ? "read" : "manage_terms";
  return runGoodsFlowRoute(context, {
    action,
    methods: ["GET", "PUT"],
    handler: async ({ request, db, actor, requestId }) => {
      if (request.method === "GET") {
        const platform = new URL(request.url).searchParams.get("platform") || undefined;
        return successResponse(await listReceivableTerms(db, { platform }), { id: requestId, version: 1 });
      }
      const term = await readJson(request);
      requireIdempotencyKey(request);
      const saved = await upsertReceivableTerm(db, term, actor.actor);
      return successResponse(saved, { id: requestId, version: saved.version });
    }
  });
}
