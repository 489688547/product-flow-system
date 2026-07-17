import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("supply chain App exposes all confirmed workspaces", () => {
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  for (const label of ["供应链总览", "供应商管理", "采购与付款", "产品供应链", "库存盘点", "质量管理", "同步记录", "设置"]) {
    assert.match(page, new RegExp(label));
  }
});

test("inventory and quality imports preview before saving", () => {
  const inventory = read("src/features/supply-chain/InventoryWorkspace.jsx");
  const quality = read("src/features/supply-chain/QualityWorkspace.jsx");
  assert.match(inventory, /streamSpreadsheetRows/);
  assert.match(inventory, /确认导入/);
  assert.match(inventory, /ERP库存/);
  assert.match(quality, /streamSpreadsheetRows/);
  assert.match(quality, /确认导入/);
  assert.match(quality, /公关处理/);
});

test("approval workspace keeps purchase requests separate from linked payments", () => {
  const approval = read("src/features/supply-chain/ApprovalWorkspace.jsx");
  assert.match(approval, /采购申请/);
  assert.match(approval, /付款申请/);
  assert.match(approval, /purchaseProcessInstanceId/);
  assert.match(approval, /同步钉钉审批/);
  assert.match(approval, /处理映射/);
  assert.match(approval, /supplierValueMap/);
  assert.match(approval, /productValueMap/);
});

test("supplier product and quality workspaces dispatch auditable domain changes", () => {
  const supplier = read("src/features/supply-chain/SupplierWorkspace.jsx");
  const product = read("src/features/supply-chain/ProductSupplyWorkspace.jsx");
  const quality = read("src/features/supply-chain/QualityWorkspace.jsx");
  assert.match(supplier, /collection: "suppliers"/);
  assert.match(product, /collection: "productSupplierLinks"/);
  assert.match(quality, /collection: "qualityIssues"/);
  assert.match(quality, /关闭问题/);
});

test("supply chain workbench has stable responsive structure", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.supply-chain-app/);
  assert.match(css, /\.supply-chain-nav/);
  assert.match(css, /\.supply-metric-strip/);
  assert.match(css, /\.supply-import-preview/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.supply-chain-app/);
  assert.match(css, /\.supply-chain-nav button:focus-visible/);
});
