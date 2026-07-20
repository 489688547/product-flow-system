import { buildInventoryDailyRows } from "../../../../../../../src/domain/goodsFlow.js";
import { authorizeGoodsFlow, hideGoodsFlowAmounts } from "../../_shared/authorization.js";
import { goodsFlowError, readJson, requireIdempotencyKey, successResponse } from "../../_shared/http.js";
import { runGoodsFlowRoute } from "../../_shared/route.js";
import {
  appendGoodsFlowEvents,
  listInventoryDaily,
  listStocktakes,
  saveInventoryDaily,
  saveStocktake
} from "../../_shared/storage.js";

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
      if (body.action === "correct") {
        const correction = {
          ...current,
          id: `${current.id}-correction-${current.version + 1}`,
          status: "counted",
          version: 1,
          submittedBy: actor.actor,
          differenceConfirmedBy: "",
          amountConfirmedBy: "",
          correctedFromId: current.id,
          sourceReference: `${current.sourceReference || current.id}:correction:${current.version + 1}`
        };
        await saveStocktake(db, correction, current.lines, actor.actor);
        return successResponse({
          ...correction,
          lines: correction.lines.map(line => hideGoodsFlowAmounts(line, actor.canViewAmounts))
        }, { id: requestId, version: correction.version, status: 201 });
      }
      const updated = {
        ...current,
        status: transition.to,
        version: current.version + 1,
        [transition.actorField]: actor.actor
      };
      await saveStocktake(db, updated, current.lines, actor.actor);
      if (body.action === "confirm_amount") {
        const now = new Date().toISOString();
        const events = current.lines.map(line => {
          const amountVariance = line.amountVariance ?? (Number(line.quantityVariance || 0) * Number(line.unitCost || 0));
          return {
            id: `stocktake-adjustment-${current.id}-${line.skuId}-${line.warehouseId}`,
            eventType: "inventory_adjustment_confirmed",
            skuId: line.skuId,
            warehouseId: line.warehouseId,
            occurredAt: `${String(current.countedAt).slice(0, 10)}T23:59:59.000Z`,
            source: current.source || "manual-stocktake",
            sourceReference: `${current.id}:${line.skuId}:${line.warehouseId}`,
            sourceVersion: String(updated.version),
            payload: {
              stocktakeId: current.id,
              erpQuantity: line.erpQuantity,
              countedQuantity: line.countedQuantity,
              quantityVariance: line.quantityVariance,
              amountVariance
            },
            createdAt: now,
            createdBy: actor.actor
          };
        });
        await appendGoodsFlowEvents(db, events);

        const existingInventory = await listInventoryDaily(db);
        const allStocktakes = await listStocktakes(db);
        const latestDate = [current.countedAt, ...existingInventory.map(row => row.date)].filter(Boolean).sort().at(-1);
        const calibrated = buildInventoryDailyRows({
          asOf: latestDate,
          erpSnapshots: existingInventory.map(row => ({ ...row, quantity: row.erpQuantity })),
          stocktakes: allStocktakes
        }).map(row => {
          const source = existingInventory
            .filter(item => item.skuId === row.skuId && item.warehouseId === row.warehouseId && item.date <= latestDate)
            .sort((left, right) => right.date.localeCompare(left.date))[0];
          return {
            ...source,
            ...row,
            id: `inventory-daily-${row.date}-${row.skuId}-${row.warehouseId}`,
            productId: source?.productId || row.skuId.split("::")[0],
            sellableQuantity: source?.sellableQuantity ?? null,
            daysOfSupply: source?.daysOfSupply ?? null,
            ageBucket: source?.ageBucket || null,
            confidence: "complete"
          };
        });
        await saveInventoryDaily(db, calibrated, now);
      }
      return successResponse({
        ...updated,
        lines: updated.lines.map(line => hideGoodsFlowAmounts(line, actor.canViewAmounts))
      }, { id: requestId, version: updated.version });
    }
  });
}
