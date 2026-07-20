import { authorizeGoodsFlow, hideGoodsFlowAmounts } from "../../_shared/authorization.js";
import { goodsFlowError, readJson, requireIdempotencyKey, successResponse } from "../../_shared/http.js";
import { runGoodsFlowRoute } from "../../_shared/route.js";
import { listStocktakes, saveStocktake } from "../../_shared/storage.js";

const TRANSITIONS = {
  confirm_difference: { action: "confirm_difference", from: "counted", to: "difference_confirmed", actorField: "differenceConfirmedBy" },
  confirm_amount: { action: "confirm_amount", from: "difference_confirmed", to: "confirmed", actorField: "amountConfirmedBy" },
  correct: { action: "submit_count", from: "confirmed", to: "counted", actorField: "submittedBy" }
};

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    action: "read",
    methods: ["POST"],
    handler: async ({ request, db, requestId, params }) => {
      requireIdempotencyKey(request);
      const body = await readJson(request);
      const transition = TRANSITIONS[body.action];
      if (!transition) throw goodsFlowError("GOODS_FLOW_STOCKTAKE_TRANSITION_INVALID", 400, "不支持的盘点状态操作。");
      const actor = authorizeGoodsFlow(context.data?.session, transition.action);
      const current = (await listStocktakes(db, { id: params.id }))[0];
      if (!current) throw goodsFlowError("GOODS_FLOW_STOCKTAKE_NOT_FOUND", 404, "未找到盘点任务。");
      if (Number(body.expectedVersion) !== current.version) {
        throw goodsFlowError("GOODS_FLOW_VERSION_CONFLICT", 409, "盘点已被其他同事更新，请刷新后重试。", false, { version: current.version });
      }
      if (current.status !== transition.from) {
        throw goodsFlowError("GOODS_FLOW_STOCKTAKE_STATE_CONFLICT", 409, "当前盘点状态不能执行此操作。", false, { status: current.status });
      }
      const updated = {
        ...current,
        status: transition.to,
        version: current.version + 1,
        [transition.actorField]: actor.actor,
        ...(body.action === "correct" ? { correctedFromId: current.id } : {})
      };
      await saveStocktake(db, updated, current.lines, actor.actor);
      return successResponse({
        ...updated,
        lines: updated.lines.map(line => hideGoodsFlowAmounts(line, actor.canViewAmounts))
      }, { id: requestId, version: updated.version });
    }
  });
}
