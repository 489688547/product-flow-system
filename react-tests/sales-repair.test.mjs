import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSalesRepairCandidate, repairRunId, SALES_REPAIR_ENTITY_TYPE } from "../functions/api/platform/v1/data-services/_shared/salesRepair.js";

const baseline = [
  ["2026-07-14", 100, 10],
  ["2026-07-15", 120, 12],
  ["2026-07-16", 110, 11],
  ["2026-07-17", 130, 13],
  ["2026-07-18", 90, 9],
  ["2026-07-19", 105, 10],
  ["2026-07-20", 115, 12],
  ["2026-07-21", 20, 2]
].map(([date, sales, qty]) => ({ date, sales, qty }));

test("sales repair becomes writable only after a complete pull restores the latest day", () => {
  assert.equal(SALES_REPAIR_ENTITY_TYPE, "systemSyncRuns");
  assert.equal(repairRunId("2026-07-21"), "kuaimai-sales-repair:2026-07-21:sales-completeness-v1");
  const result = evaluateSalesRepairCandidate({
    latestDailyFacts: baseline,
    currentRows: [{ date: "2026-07-21", sales: 20, qty: 2, refund: 0, preShipRefund: 0, postShipRefund: 0 }],
    pulledRows: [{ date: "2026-07-21", sales: 120, qty: 12, refund: 0, preShipRefund: 0, postShipRefund: 0 }],
    complete: true
  });
  assert.equal(result.action, "replace");
  assert.equal(result.after.status, "healthy");
  assert.deepEqual(result.summary, { sales: 120, qty: 12, rowCount: 1 });
});

test("sales repair preserves richer refund facts for an official file re-import", () => {
  const result = evaluateSalesRepairCandidate({
    latestDailyFacts: baseline,
    currentRows: [{ date: "2026-07-21", sales: 20, qty: 2, refund: 3, preShipRefund: 1, postShipRefund: 2 }],
    pulledRows: [{ date: "2026-07-21", sales: 120, qty: 12 }],
    complete: true
  });
  assert.deepEqual(result, {
    action: "manual_required",
    code: "SALES_REPAIR_RICH_FACTS_PROTECTED",
    message: "当天已有退款明细，不能用快麦订单 API 覆盖，请重新导入官方文件。"
  });
});

test("sales repair never writes a partial or still-abnormal pull", () => {
  assert.equal(evaluateSalesRepairCandidate({
    latestDailyFacts: baseline,
    currentRows: [],
    pulledRows: [{ date: "2026-07-21", sales: 120, qty: 12 }],
    complete: false
  }).code, "SALES_REPAIR_PAGINATION_INCOMPLETE");

  const stillLow = evaluateSalesRepairCandidate({
    latestDailyFacts: baseline,
    currentRows: [],
    pulledRows: [{ date: "2026-07-21", sales: 21, qty: 2 }],
    complete: true
  });
  assert.equal(stillLow.action, "failed");
  assert.equal(stillLow.code, "SALES_REPAIR_STILL_INCOMPLETE");
});
