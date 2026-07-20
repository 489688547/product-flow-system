import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("inventory projection keeps SKU and warehouse balances readable", () => {
  const inventory = read("src/features/supply-chain/InventoryWorkspace.jsx");
  for (const label of ["69码", "ERP账面", "最近实盘", "校准库存", "盘点差异", "可售天数", "库龄", "库存资金", "数据状态"]) {
    assert.match(inventory, new RegExp(label));
  }
  assert.match(inventory, /goods-flow-inventory-table/);
  assert.match(inventory, /按权限隐藏/);
  assert.match(inventory, /成品库存与盘点轨迹/);
  assert.match(inventory, /state\.inventorySnapshots/);
  assert.doesNotMatch(inventory, /collection: "inventoryAdjustments"/);
});

test("monthly stocktake exposes import preview and five accountable stages", () => {
  const stocktake = read("src/features/supply-chain/StocktakeWorkspace.jsx");
  for (const label of ["生成任务", "线下盘库", "导入实存", "确认差异", "确认金额", "追加更正"]) {
    assert.match(stocktake, new RegExp(label));
  }
  for (const action of ["createStocktake", "confirm_difference", "confirm_amount", "correct"]) {
    assert.match(stocktake, new RegExp(action));
  }
  assert.match(stocktake, /有效 .*失败/);
  assert.match(stocktake, /disabledReason/);
  assert.match(stocktake, /ERP 原始快照/);
});

test("cash cycle lets finance version terms and deliberately freeze CCC", () => {
  const cash = read("src/features/supply-chain/CashCycleWorkspace.jsx");
  for (const label of ["平台", "账期天数", "生效日期", "结束日期", "调整原因", "保存账期", "重新计算", "冻结本版", "计算版本"]) {
    assert.match(cash, new RegExp(label));
  }
  assert.match(cash, /goods-flow-term-form/);
  assert.match(cash, /GOODS_FLOW_TERM_OVERLAP|生效区间重叠/);
  assert.match(cash, /<Modal/);
  assert.match(cash, /disabledReason/);
  assert.match(cash, /后续补录将生成新版本/);
});

test("server-derived role capabilities are passed into stocktake and cash controls", () => {
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  for (const capability of ["canSubmitCount", "canConfirmDifference", "canConfirmAmount", "canEditTerms", "canFreezeCcc"]) {
    assert.match(page, new RegExp(capability));
  }
  assert.match(page, /goodsFlow\.inventory/);
  assert.match(page, /goodsFlow\.stocktakes/);
  assert.match(page, /goodsFlow\.saveTerm/);
  assert.match(page, /goodsFlow\.freezeCcc/);
});

test("stocktake and inventory layouts keep Chinese labels horizontal", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.goods-flow-inventory-table \.data-table th[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.stocktake-stage[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.goods-flow-term-form/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.goods-flow-term-form/);
});
