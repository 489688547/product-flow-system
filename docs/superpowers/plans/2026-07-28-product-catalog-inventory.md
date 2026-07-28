# 商品主数据库存与日期经营视图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让商品主数据在成本列后展示最新可信校准库存，并在表格右上角确认日期后自动刷新销量和净销售额。

**Architecture:** 扩展现有 `/api/platform/v1/product-catalog` 共享读模型。服务端从同一 `businessDb` 读取商品目录、日期段销售事实和最新库存快照，使用纯领域函数完成单品多仓汇总、组合品可组套计算与未知状态判定；React 页面只消费合并结果。

**Tech Stack:** React、Node.js ESM、Cloudflare Pages Functions、D1、Node test runner。

## Global Constraints

- 库存只使用最新可信快照的 `calibratedQuantity`，不随销售日期段变化。
- 单品跨仓汇总；组合品使用 `MIN(FLOOR(componentQuantity / ratio))`。
- 缺失、冲突或不完整映射不得显示为零。
- 日期范围闭区间、最长 370 天；确认后自动刷新销售事实。
- 不新增 D1 表、环境变量、绑定或外部 Provider 调用。
- 所有业务 D1 读取继续使用请求上下文选择的 `businessDb`。
- 功能分支只合并到 `dev`；开发站验收后才通过 `dev → main` 发布。

---

### Task 1: 实现商品库存纯领域聚合

**Files:**
- Create: `src/domain/productCatalogInventory.js`
- Create: `react-tests/product-catalog-inventory.test.mjs`
- Modify: `docs/features/product-catalog-inventory/tasks.md`

**Interfaces:**
- Consumes: catalog items with `id`, `sourceProductId`, `skus`, `components`; inventory rows with `productId`, `skuId`, `skuCode`, `warehouseId`, `calibratedQuantity`.
- Produces: `aggregateProductCatalogInventory(items, rows, quality) -> { items, meta }`.

- [ ] **Step 1: Write failing single-product tests**

Add literal fixtures proving one SKU sums two warehouses, two SKUs sum once, a true zero becomes `zero`, and a missing/conflicting identity becomes `unmatched` rather than zero.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test react-tests/product-catalog-inventory.test.mjs
```

Expected: FAIL because `src/domain/productCatalogInventory.js` does not exist.

- [ ] **Step 3: Implement minimal deterministic matching**

Export:

```js
export function aggregateProductCatalogInventory(items = [], rows = [], quality = {}) {
  // Build unique product/SKU/code ownership, deduplicate rows, and attach:
  // { quantity, status, snapshotDate, coverage, confidence,
  //   matchedSkuCount, requiredComponentCount, matchedComponentCount }
}
```

Match only real `item.id`/`sourceProductId`, `sku.id`/`sourceSkuId`, `merchantSkuCode`, `barcode`, and component identity fields. Never derive identity from names or warehouses.

- [ ] **Step 4: Add bundle tests and verify RED**

Add literals for component stocks `10 / 2` and `8 / 3`, expecting `2` bundles; add missing component and invalid ratio cases expecting `incomplete` with `quantity: null`.

- [ ] **Step 5: Complete bundle calculation and verify GREEN**

Run the focused test and expect all cases to pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/productCatalogInventory.js react-tests/product-catalog-inventory.test.mjs docs/features/product-catalog-inventory/tasks.md
git commit -m "feat: aggregate catalog inventory"
```

### Task 2: Extend the product catalog API with current inventory

**Files:**
- Create: `functions/api/platform/v1/product-catalog/_shared/inventory.js`
- Create: `tests/product-catalog-inventory-api.test.mjs`
- Modify: `functions/api/platform/v1/product-catalog.js`
- Modify: `docs/platform/apis/product-catalog-v1.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/features/product-catalog-inventory/tasks.md`

**Interfaces:**
- Consumes: `queryInventoryDaily(db, { mode: "current", cursor })` and Task 1 aggregation.
- Produces: catalog `items[].inventory` and `meta.inventory` without changing existing query parameters.

- [ ] **Step 1: Write failing API contract tests**

Cover:

```js
assert.deepEqual(payload.items[0].inventory, {
  quantity: 12,
  status: "available",
  snapshotDate: "2026-07-28",
  coverage: 1,
  confidence: "partial",
  matchedSkuCount: 1,
  requiredComponentCount: 0,
  matchedComponentCount: 0
});
assert.equal(payload.meta.inventory.status, "trusted");
```

Also prove no-date legacy requests avoid `product_sales_daily` but still receive inventory, inventory pagination is fully consumed, and empty inventory returns `unavailable` without clearing catalog data.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```bash
node --test tests/product-catalog-inventory-api.test.mjs tests/product-catalog-sales-api.test.mjs
```

Expected: FAIL because the catalog response lacks `inventory`.

- [ ] **Step 3: Implement bounded current-snapshot reading**

Create `readCatalogInventory(db, items, { now })` that:

1. calls `queryInventoryDaily` in `current` mode;
2. follows `nextCursor` with a hard maximum of 20 pages;
3. derives quality using latest date, row confidence, coverage and Shanghai freshness;
4. returns `aggregateProductCatalogInventory(...)`;
5. throws stable `PRODUCT_CATALOG_INVENTORY_QUERY_LIMIT` if the bound is exceeded.

- [ ] **Step 4: Merge sales and inventory in the existing route**

After `readProductCatalog(db)`, run sales and inventory reads in parallel when a sales range exists. Merge by stable item ID, then apply `filterCatalogCosts`. Without a range, read only inventory and do not scan sales.

- [ ] **Step 5: Document the stable contract**

Create `docs/platform/apis/product-catalog-v1.md` with authentication, permissions, request, response, inventory statuses, errors, compatibility, observability and rollback. Update `docs/platform/api-catalog.md` to link it.

- [ ] **Step 6: Verify GREEN and compatibility**

Run:

```bash
node --test tests/product-catalog-inventory-api.test.mjs tests/product-catalog-api.test.mjs tests/product-catalog-sales-api.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add functions/api/platform/v1/product-catalog.js functions/api/platform/v1/product-catalog/_shared/inventory.js tests/product-catalog-inventory-api.test.mjs docs/platform/apis/product-catalog-v1.md docs/platform/api-catalog.md docs/features/product-catalog-inventory/tasks.md
git commit -m "feat: expose catalog inventory"
```

### Task 3: Add the inventory column and automatic date refresh

**Files:**
- Modify: `src/features/data-center/ProductCatalogWorkspace.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/product-catalog-ui.test.mjs`
- Modify: `react-tests/product-catalog-provider.test.mjs`
- Modify: `docs/features/product-catalog-inventory/tasks.md`

**Interfaces:**
- Consumes: `item.inventory`, `meta.inventory`, `setSalesQuery`.
- Produces: cost → inventory table order and date-confirm auto-refresh.

- [ ] **Step 1: Replace the old explicit-query UI test with failing behavior expectations**

Require:

- header order matches `销量 / 净销售额`, `成本`, `库存`, `状态 / 操作`;
- no “查询数据” button;
- `DateRangePickerField.onConfirm` applies the validated range through `setSalesQuery`;
- platform selection applies directly;
- inventory statuses render distinct Chinese labels.

- [ ] **Step 2: Run UI/provider tests and verify RED**

Run:

```bash
node --test react-tests/product-catalog-ui.test.mjs react-tests/product-catalog-provider.test.mjs
```

Expected: FAIL on missing inventory column and old explicit-query behavior.

- [ ] **Step 3: Implement automatic query application**

Remove `salesDraft`, `salesDraftChanged`, `rangeError`, form submission and query button. Use:

```jsx
<HeaderFilter
  label="平台"
  value={salesQuery.platform || ""}
  onChange={platform => setSalesQuery(current => ({ ...current, platform }))}
  ...
/>
<DateRangePickerField
  value={{ from: salesQuery.from, to: salesQuery.to }}
  onConfirm={range => setSalesQuery(current => ({ ...current, ...range, preset: "custom" }))}
  ...
/>
```

The existing Provider request sequence must continue rejecting stale responses.

- [ ] **Step 4: Render inventory after cost**

Add `inventorySummary(item)` with these literal states:

- `available`: quantity + “最新快照 YYYY-MM-DD”;
- `zero`: `0` + “已匹配，当前无库存”;
- `unmatched`: `—` + “库存待匹配”;
- `incomplete`: `—` + “组件或 SKU 关系不完整”;
- `unavailable`: `—` + “库存暂不可用”.

Add an inventory issue count to the top summary without exposing warehouse rows.

- [ ] **Step 5: Place the sales range at the table heading right**

Move platform/date controls into `.product-catalog-results-heading`, keep mobile wrapping and table-only horizontal scrolling, and add `aria-live="polite"` for refresh state.

- [ ] **Step 6: Verify GREEN and responsive style contracts**

Run:

```bash
node --test react-tests/product-catalog-ui.test.mjs react-tests/product-catalog-provider.test.mjs react-tests/product-catalog-inventory.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add src/features/data-center/ProductCatalogWorkspace.jsx src/styles.css react-tests/product-catalog-ui.test.mjs react-tests/product-catalog-provider.test.mjs docs/features/product-catalog-inventory/tasks.md
git commit -m "feat: show inventory in product catalog"
```

### Task 4: Complete verification, PR and GitOps delivery

**Files:**
- Modify only files required by test or acceptance failures.
- Modify: `docs/features/product-catalog-inventory/tasks.md`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: reviewed feature PR to `dev`, fixed dev-site acceptance, then `dev → main` production release.

- [ ] **Step 1: Run complete local gates**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
npx wrangler pages functions build
npm run check:pr -- --base origin/dev
```

- [ ] **Step 2: Run local browser acceptance**

Use the authenticated local-online runtime at laptop and 390px widths. Verify keyboard focus, date confirmation, stale-request protection, inventory state text, no page-level overflow and no console errors.

- [ ] **Step 3: Update durable task evidence and commit**

Mark completed checkboxes and record focused/full test evidence in `tasks.md`. Inspect `git status --short` and stage only this feature.

- [ ] **Step 4: Push and open PR to `dev`**

PR body must declare:

```text
Integration-Impact: cloudflare-pages,cloudflare-d1,erp-file-import,kuaimai
Integration-Impact-Reason: 商品目录共享 API 读取既有货流库存和销售事实，不新增外部调用
Rule-Writeback: docs/platform/apis/product-catalog-v1.md
Rule-Writeback-Reason: 固化商品目录库存响应、日期销售范围和兼容边界
```

- [ ] **Step 5: Merge after checks and validate the fixed dev site**

Confirm the deployed commit at `https://deshan-tiyes-system-dev.pages.dev`, then verify authenticated product catalog API cold/warm responses and real UI behavior. Do not treat an arbitrary Preview URL as acceptance.

- [ ] **Step 6: Release `dev → main` and validate production**

Open the sole release PR, merge after checks, wait for Cloudflare Git deployment, then run readiness/OAuth and authenticated product catalog smoke at `https://deshan-tiyes-system.pages.dev`. Confirm inventory counts and date-driven sales change without outputting product details.

