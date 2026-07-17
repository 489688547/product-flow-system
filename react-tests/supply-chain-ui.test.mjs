import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("primary sidebar exposes every supply chain workspace in its own group", () => {
  const app = read("src/App.jsx");
  for (const label of ["供应链总览", "供应商管理", "采购与付款", "产品供应链", "库存盘点", "质量管理", "同步记录", "设置"]) {
    assert.match(app, new RegExp(label));
  }
  for (const key of ["supply-overview", "supply-suppliers", "supply-approvals", "supply-products", "supply-inventory", "supply-quality", "supply-records", "supply-settings"]) {
    assert.match(app, new RegExp(`"${key}"`));
  }
  assert.match(app, /"供应链管理"/);
  assert.doesNotMatch(app, /\["supply-chain", "供应链管理", Truck, "业务 Apps"\]/);
  assert.match(app, /navigationPermissionKey/);
  assert.match(app, /return SUPPLY_CHAIN_SCREEN_TO_SECTION\.has\(screen\) \? "supply-chain" : screen/);
  assert.match(app, /screen === "supply-chain" \? "supply-overview" : screen/);
});

test("supply chain page is controlled by the primary route and has no internal navigation", () => {
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  const css = read("src/styles.css");
  assert.match(page, /SupplyChainAppPage\(\{ onNavigate, section = "overview" \}\)/);
  assert.doesNotMatch(page, /SupplyChainSectionNav/);
  assert.doesNotMatch(page, /useState\("overview"\)/);
  assert.doesNotMatch(page, /supply-chain-layout/);
  assert.doesNotMatch(page, /supply-chain-content/);
  assert.doesNotMatch(css, /\.supply-chain-section-nav/);
  assert.doesNotMatch(css, /\.supply-chain-layout/);
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
  assert.match(css, /\.supply-metric-strip/);
  assert.match(css, /\.supply-import-preview/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.supply-metric-strip\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(170px, 1fr\)\)/);
});
