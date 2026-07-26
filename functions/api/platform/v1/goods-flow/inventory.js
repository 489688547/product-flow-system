import { hideGoodsFlowAmounts } from "./_shared/authorization.js";
import { goodsFlowError, jsonResponse } from "./_shared/http.js";
import { runGoodsFlowRoute } from "./_shared/route.js";
import { queryInventoryDaily } from "./_shared/storage.js";

function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function daysBetween(left, right) {
  return Math.floor((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86400000);
}

function inventoryQuality(rows, { latestDate, referenceDate }) {
  if (!rows.length) {
    return {
      status: "unavailable",
      lastSuccessfulSyncAt: null,
      coverage: 0,
      confidence: "insufficient",
      missing: ["inventory_snapshot"],
      latestSnapshotDate: latestDate || null,
      freshnessDays: null
    };
  }
  const complete = rows.filter(row => row.confidence === "complete").length;
  const coverage = complete / rows.length;
  const freshnessDays = Math.max(0, daysBetween(latestDate, referenceDate));
  return {
    status: coverage < 1 ? "partial" : freshnessDays > 1 ? "stale" : "trusted",
    lastSuccessfulSyncAt: rows.map(row => row.updatedAt).filter(Boolean).sort().at(-1) || null,
    coverage,
    confidence: coverage === 1 ? "complete" : complete ? "partial" : "insufficient",
    missing: coverage === 1 ? [] : ["inventory_confidence"],
    latestSnapshotDate: latestDate,
    freshnessDays
  };
}

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    handler: async ({ request, db, actor, requestId }) => {
      const url = new URL(request.url);
      const mode = String(url.searchParams.get("mode") || "current");
      const asOf = String(url.searchParams.get("asOf") || url.searchParams.get("through") || "");
      const skuId = String(url.searchParams.get("skuId") || "");
      const warehouseId = String(url.searchParams.get("warehouseId") || "");
      const cursor = String(url.searchParams.get("cursor") || "");
      if (
        !["current", "history"].includes(mode)
        || (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf))
        || skuId.length > 160
        || warehouseId.length > 160
        || cursor.length > 600
      ) {
        throw goodsFlowError("GOODS_FLOW_INVENTORY_QUERY_INVALID", 400, "库存查询参数无效。");
      }
      const result = await queryInventoryDaily(db, {
        mode,
        asOf: asOf || undefined,
        skuId: skuId || undefined,
        warehouseId: warehouseId || undefined,
        cursor: cursor || undefined
      });
      const rows = result.rows;
      const calibrated = rows.filter(row => row.stocktakeStatus === "calibrated").length;
      return jsonResponse({
        data: rows.map(({ updatedAt: _updatedAt, ...row }) => hideGoodsFlowAmounts(row, actor.canViewAmounts)),
        quality: inventoryQuality(rows, {
          latestDate: result.latestDate,
          referenceDate: asOf || shanghaiDate()
        }),
        page: { nextCursor: result.nextCursor },
        meta: {
          requestId,
          updatedAt: new Date().toISOString(),
          coverage: { stocktake: rows.length ? calibrated / rows.length : 0 },
          query: { mode, asOf: asOf || null, skuId: skuId || null, warehouseId: warehouseId || null },
          version: 2
        }
      });
    }
  });
}
