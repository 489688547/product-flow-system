import { goodsFlowError, readJson, requireIdempotencyKey, successResponse } from "../../_shared/http.js";
import { runGoodsFlowRoute } from "../../_shared/route.js";
import { listMonthlyMetrics, saveMonthlyMetrics } from "../../_shared/storage.js";

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    action: "freeze_ccc",
    methods: ["POST"],
    handler: async ({ request, db, actor, requestId, params }) => {
      requireIdempotencyKey(request);
      const body = await readJson(request);
      const current = (await listMonthlyMetrics(db, { month: params.month }))[0];
      if (!current) throw goodsFlowError("GOODS_FLOW_CCC_NOT_FOUND", 404, "该月份尚未生成 CCC 草稿。");
      if (Number(body.expectedVersion) !== current.version) {
        throw goodsFlowError("GOODS_FLOW_VERSION_CONFLICT", 409, "CCC 已被更新，请刷新后重试。", false, { version: current.version });
      }
      if (current.confidence !== "complete") {
        throw goodsFlowError("GOODS_FLOW_METRIC_INCOMPLETE", 409, "CCC 来源覆盖不足，补齐数据后才能冻结。", false, { coverage: current.coverage });
      }
      const now = new Date().toISOString();
      const frozen = {
        ...current,
        id: `ccc-${params.month}-frozen-${current.version + 1}`,
        version: current.version + 1,
        status: "frozen",
        frozenAt: now,
        frozenBy: actor.actor
      };
      await saveMonthlyMetrics(db, frozen, actor.actor, now);
      return successResponse(frozen, { id: requestId, version: frozen.version, coverage: frozen.coverage });
    }
  });
}
