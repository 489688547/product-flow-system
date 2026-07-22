import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/features/ecommerce-operations/EcommerceOperationsAppPage.jsx", import.meta.url), "utf8");
const cockpit = readFileSync(new URL("../src/features/ecommerce-operations/OperationsCockpit.jsx", import.meta.url), "utf8");
const focus = readFileSync(new URL("../src/features/ecommerce-operations/FocusProductWorkspace.jsx", import.meta.url), "utf8");

test("operations page composes a role-aware cockpit and focus product workspace", () => {
  assert.match(page, /OperationsCockpit/);
  assert.match(page, /FocusProductWorkspace/);
  assert.match(page, /useProductCatalog/);
  assert.match(page, /useDataStandards/);
  assert.match(page, /connections/);
  assert.match(page, /setRange/);
  assert.match(page, /OrgSelect/);
  assert.match(page, /team\.storeId/);
  assert.match(page, /team\.productId/);
  assert.match(page, /经营数据暂时无法读取/);
  assert.match(page, /已加载的数据不会被清空/);
  assert.match(page, /resultLoading && !metricError/);
});

test("cockpit leads with trusted facts, actions and explicit unavailable datasets", () => {
  for (const label of ["数据截止", "数据质量", "待我处理", "平台经营", "重点产品"]) assert.match(cockpit, new RegExp(label));
  assert.match(cockpit, /暂无投放数据/);
  assert.match(cockpit, /DateRangeControls/);
  assert.match(cockpit, /查询经营数据/);
  assert.match(cockpit, /可售库存/);
  assert.match(cockpit, /最低库存覆盖天数/);
  assert.doesNotMatch(cockpit, /投放 ROI[^\n]*0/);
});

test("focus workspace selects governed products and stores and saves automatic evidence", () => {
  assert.match(focus, /productId/);
  assert.match(focus, /storeId/);
  assert.match(focus, /自动经营基线/);
  assert.match(focus, /evidenceSnapshot/);
  assert.match(focus, /店铺维度尚未接入/);
  assert.doesNotMatch(focus, /现状数据与情况/);
});
