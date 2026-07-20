import { hideGoodsFlowAmounts } from "./_shared/authorization.js";
import { goodsFlowError, readJson, requireIdempotencyKey, successResponse } from "./_shared/http.js";
import { runGoodsFlowRoute } from "./_shared/route.js";
import { listStocktakes, saveStocktake } from "./_shared/storage.js";

export async function onRequest(context) {
  const action = context.request.method === "GET" ? "read" : "submit_count";
  return runGoodsFlowRoute(context, {
    action,
    methods: ["GET", "POST"],
    handler: async ({ request, db, actor, requestId }) => {
      if (request.method === "GET") {
        const rows = await listStocktakes(db);
        return successResponse(rows.map(row => ({
          ...row,
          lines: row.lines.map(line => hideGoodsFlowAmounts(line, actor.canViewAmounts))
        })), { id: requestId, version: 1 });
      }
      requireIdempotencyKey(request);
      const body = await readJson(request);
      if (!body.id || !body.warehouseId || !body.countedAt || !Array.isArray(body.lines) || !body.lines.length) {
        throw goodsFlowError("GOODS_FLOW_STOCKTAKE_INVALID", 400, "盘点任务、仓库、日期和明细不能为空。");
      }
      const stocktake = {
        id: body.id,
        warehouseId: body.warehouseId,
        countedAt: body.countedAt,
        status: "counted",
        version: Number(body.version || 1),
        source: body.source || "manual-stocktake",
        sourceReference: body.sourceReference || body.id,
        submittedBy: actor.actor
      };
      await saveStocktake(db, stocktake, body.lines, actor.actor);
      return successResponse({
        ...stocktake,
        lines: body.lines.map(line => hideGoodsFlowAmounts(line, actor.canViewAmounts))
      }, { id: requestId, status: 201, version: stocktake.version });
    }
  });
}
