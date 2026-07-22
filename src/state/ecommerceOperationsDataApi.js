import { fetchGoodsFlowDashboard, fetchGoodsFlowInventory } from "./goodsFlowApi.js";

function errorSummary(result) {
  if (result.status !== "rejected") return null;
  return {
    code: result.reason?.code || "GOODS_FLOW_REQUEST_FAILED",
    message: result.reason?.message || "货流数据暂不可用。"
  };
}

export async function loadOperationsSupplyData({ through, fetchImpl = fetch } = {}) {
  const [inventoryResult, dashboardResult] = await Promise.allSettled([
    fetchGoodsFlowInventory({ through, fetchImpl }),
    fetchGoodsFlowDashboard({ fetchImpl })
  ]);
  if (inventoryResult.status === "rejected" && dashboardResult.status === "rejected") {
    throw inventoryResult.reason;
  }
  const inventoryPayload = inventoryResult.status === "fulfilled" ? inventoryResult.value : null;
  const dashboardPayload = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
  return {
    inventory: Array.isArray(inventoryPayload?.data) ? inventoryPayload.data : [],
    dashboard: dashboardPayload?.data || null,
    quality: {
      inventoryCoverage: inventoryPayload?.meta?.coverage?.stocktake ?? null,
      metricCoverage: dashboardPayload?.meta?.coverage ?? null,
      confidence: dashboardPayload?.data?.metrics?.confidence ?? null
    },
    partial: inventoryResult.status === "rejected" || dashboardResult.status === "rejected",
    errors: [errorSummary(inventoryResult), errorSummary(dashboardResult)].filter(Boolean)
  };
}
