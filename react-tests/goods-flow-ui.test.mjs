import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("goods-flow cockpit exposes exactly three headline metrics and real evidence states", () => {
  const source = read("src/features/supply-chain/GoodsFlowOverview.jsx");
  assert.equal((source.match(/<MetricHeadline/g) || []).length, 3);
  for (const label of ["CCC 现金循环周期", "断货率", "库存周转天数", "数据覆盖", "需要判断", "库存资金与来源核对"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /value === null \|\| value === undefined/);
  assert.match(source, /尚无可用数据|暂不可计算/);
  assert.doesNotMatch(source, /summary\.actualPaid[^\n]*summary\.consumedSalesCost[^\n]*summary\.adjustedInventoryFunds/);
});

test("future goods-flow phases disclose missing sources instead of fake KPIs", () => {
  const source = read("src/features/supply-chain/ComingPhaseWorkspace.jsx");
  for (const label of ["当前可用依据", "上线所需数据", "尚未启用自动决策"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /Math\.random|模拟数据|示例指标/);
});

test("goods-flow tables and navigation remain readable at laptop and DingTalk widths", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.goods-flow-headlines/);
  assert.match(css, /\.goods-flow-workspace \.data-table th[^}]*white-space:\s*nowrap/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.goods-flow-headlines/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.goods-flow-headlines/);
  assert.doesNotMatch(css, /\.goods-flow[^\n{]*\{[^}]*border-left:\s*[2-9]/);
});

test("supply-chain composition consumes goods-flow state and preserves legacy operations", () => {
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  assert.match(page, /useGoodsFlow\(\)/);
  assert.match(page, /overview: <GoodsFlowOverview/);
  assert.match(page, /demand: <ComingPhaseWorkspace/);
  assert.match(page, /transit: <ComingPhaseWorkspace/);
  assert.match(page, /fulfillment: <ComingPhaseWorkspace/);
  assert.match(page, /cash: <CashCycleWorkspace/);
  for (const workspace of ["SupplierWorkspace", "ApprovalWorkspace", "ProductSupplyWorkspace", "InventoryWorkspace", "QualityWorkspace"]) {
    assert.match(page, new RegExp(workspace));
  }
});
