import { calculateGoodsFlowMetrics } from "../../../../../../../src/domain/goodsFlow.js";
import { goodsFlowError, readJson, requireIdempotencyKey, successResponse } from "../../_shared/http.js";
import { runGoodsFlowRoute } from "../../_shared/route.js";
import { buildGoodsFlowMetricInput } from "../../_shared/metricsProjection.js";
import {
  listGoodsFlowEvents,
  listInventoryDaily,
  listMonthlyMetrics,
  listReceivableTerms,
  saveMonthlyMetrics
} from "../../_shared/storage.js";

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
}

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    action: "recalculate_ccc",
    methods: ["POST"],
    handler: async ({ request, db, actor, requestId, params }) => {
      const idempotencyKey = requireIdempotencyKey(request);
      await readJson(request);
      const month = String(params.month || "");
      if (!/^\d{4}-\d{2}$/.test(month)) throw goodsFlowError("GOODS_FLOW_MONTH_INVALID", 400, "月份格式必须为 YYYY-MM。");
      const history = await listMonthlyMetrics(db, { month });
      const metricId = `ccc-${safeId(month)}-${safeId(idempotencyKey)}`;
      const existing = history.find(row => row.id === metricId);
      if (existing) return successResponse(existing, { id: requestId, status: 201, version: existing.version, coverage: existing.coverage });
      const version = (history[0]?.version || 0) + 1;
      const [events, inventoryDaily, receivableTerms] = await Promise.all([
        listGoodsFlowEvents(db),
        listInventoryDaily(db, { through: `${month}-31` }),
        listReceivableTerms(db)
      ]);
      const sourceFacts = buildGoodsFlowMetricInput({ month, events, inventoryDaily, receivableTerms });
      const calculated = calculateGoodsFlowMetrics(sourceFacts);
      const metrics = {
        ...calculated,
        id: metricId,
        version,
        status: "draft",
        sourceUpdatedAt: sourceFacts.sourceUpdatedAt
      };
      await saveMonthlyMetrics(db, metrics, actor.actor);
      const saved = (await listMonthlyMetrics(db, { month })).find(row => row.id === metricId) || metrics;
      return successResponse(saved, { id: requestId, status: 201, version, coverage: saved.coverage });
    }
  });
}
