import { hideGoodsFlowAmounts } from "./_shared/authorization.js";
import { successResponse } from "./_shared/http.js";
import { runGoodsFlowRoute } from "./_shared/route.js";
import {
  listGoodsFlowExceptions,
  listInventoryDaily,
  listMonthlyMetrics,
  listStocktakes
} from "./_shared/storage.js";

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    handler: async ({ db, actor, requestId }) => {
      const [monthly, inventory, exceptions, stocktakes] = await Promise.all([
        listMonthlyMetrics(db),
        listInventoryDaily(db),
        listGoodsFlowExceptions(db),
        listStocktakes(db)
      ]);
      const latest = monthly[0] ? hideGoodsFlowAmounts(monthly[0], actor.canViewAmounts) : null;
      return successResponse({
        metrics: latest,
        inventorySummary: {
          rows: inventory.length,
          calibratedRows: inventory.filter(row => row.stocktakeStatus === "calibrated").length,
          ...(actor.canViewAmounts ? { cashTied: latest?.inventoryCashTied ?? null } : {})
        },
        exceptions: exceptions.filter(row => row.status === "open"),
        stocktakes: stocktakes.slice(0, 6)
      }, {
        id: requestId,
        coverage: latest?.coverage || {},
        version: latest?.version || 0,
        updatedAt: latest?.calculatedAt || new Date().toISOString()
      });
    }
  });
}
