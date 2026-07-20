import { hideGoodsFlowAmounts } from "./_shared/authorization.js";
import { successResponse } from "./_shared/http.js";
import { runGoodsFlowRoute } from "./_shared/route.js";
import { listMonthlyMetrics } from "./_shared/storage.js";

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    handler: async ({ request, db, actor, requestId }) => {
      const month = new URL(request.url).searchParams.get("month") || undefined;
      const rows = await listMonthlyMetrics(db, { month });
      return successResponse(rows.map(row => hideGoodsFlowAmounts(row, actor.canViewAmounts)), { id: requestId, version: rows[0]?.version || 0, coverage: rows[0]?.coverage || {} });
    }
  });
}
