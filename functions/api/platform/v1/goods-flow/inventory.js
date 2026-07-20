import { hideGoodsFlowAmounts } from "./_shared/authorization.js";
import { successResponse } from "./_shared/http.js";
import { runGoodsFlowRoute } from "./_shared/route.js";
import { listInventoryDaily } from "./_shared/storage.js";

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    handler: async ({ request, db, actor, requestId }) => {
      const through = new URL(request.url).searchParams.get("through") || undefined;
      const rows = await listInventoryDaily(db, { through });
      const calibrated = rows.filter(row => row.stocktakeStatus === "calibrated").length;
      return successResponse(rows.map(row => hideGoodsFlowAmounts(row, actor.canViewAmounts)), {
        id: requestId,
        coverage: { stocktake: rows.length ? calibrated / rows.length : 0 },
        version: 1
      });
    }
  });
}
