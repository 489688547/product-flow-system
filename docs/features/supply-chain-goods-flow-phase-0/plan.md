# Supply Chain Goods Flow Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留“供应链管理”唯一入口的前提下，交付可追溯的库存日快照、月度盘点校准、平台账期、库存资金和 CCC 月度计算，并通过统一货流 API 提供给多个 App 读取。

**Architecture:** 新建纯领域 `goodsFlow` 模块和 `/api/platform/v1/goods-flow/*` 服务端边界，D1 保存追加式事件、日库存、盘点、账期、月度指标和异常。现有 `/api/supply-chain` 在迁移期继续工作，由兼容投影把已有采购付款、库存和销售事实转换成货流读模型；供应链页面切换到货流驾驶舱和七环节导航。

**Tech Stack:** React 19、Vite 7、Node `node:test`、Cloudflare Pages Functions、Cloudflare D1、原生 Fetch、现有 CSS 设计变量和 UI 组件。

## Global Constraints

- 供应链管理是唯一业务 App 入口，不新增平行“货流 App”。
- 驾驶舱顶部只显示 CCC、断货率、库存周转天数。
- ERP 账面库存永不被盘点覆盖；月度线下盘点通过追加事件校准。
- 应收天数由财务按平台维护固定账期，按生效日版本化，不回写历史月份。
- 缺数据不补零；指标必须返回来源时间、覆盖率、可信等级和计算版本。
- 商品使用现有产品主数据中的 product ID、SKU code 和 69 码，不建立第二份可编辑商品档案。
- 钉钉、快麦和 ERP 只能由服务端适配器访问，React 页面不得直接调用 provider。
- 快麦库存自动能力在独立验证前保持不可用；Phase 0 使用 ERP/文件库存快照。
- 金额、成本、盘点确认、账期和冻结权限必须由服务端校验。
- 新 D1 表、API、错误码、集成路径和环境能力必须在同一变更中更新平台文档与生成模块。
- 现有 `/api/supply-chain` 和供应链数据必须保持兼容；回滚关闭新读模型，不删除新表或历史事件。

---

### Task 1: Pure goods-flow domain rules

**Files:**
- Create: `src/domain/goodsFlow.js`
- Create: `react-tests/goods-flow-domain.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: normalized dates, SKU/warehouse snapshots, stocktakes, sales, purchases, payments and receivable-term rows.
- Produces: `calibrateInventoryQuantity(input) -> number`, `resolveReceivableTerm(terms, platform, date) -> object|null`, `buildInventoryDailyRows(input) -> InventoryDailyRow[]`, `calculateGoodsFlowMetrics(input) -> GoodsFlowMetrics`.

- [ ] **Step 1: Write failing calibration and term-version tests**

```js
import { calibrateInventoryQuantity, resolveReceivableTerm } from "../src/domain/goodsFlow.js";

test("stocktake anchors calibrated inventory without overwriting ERP", () => {
  assert.equal(calibrateInventoryQuantity({ currentErpQuantity: 88, anchorErpQuantity: 100, anchorCountedQuantity: 96 }), 84);
});

test("receivable terms use the version effective on the metric date", () => {
  const term = resolveReceivableTerm([
    { id: "tmall-30", platform: "天猫", days: 30, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
    { id: "tmall-45", platform: "天猫", days: 45, effectiveFrom: "2026-07-01" }
  ], "天猫", "2026-07-20");
  assert.equal(term.days, 45);
});
```

- [ ] **Step 2: Run the domain test and verify missing exports fail**

Run: `node --test react-tests/goods-flow-domain.test.mjs`

Expected: FAIL because `src/domain/goodsFlow.js` does not exist.

- [ ] **Step 3: Implement normalization, calibration and term selection**

```js
export function calibrateInventoryQuantity({ currentErpQuantity, anchorErpQuantity, anchorCountedQuantity }) {
  if (!Number.isFinite(Number(anchorCountedQuantity))) return Number(currentErpQuantity) || 0;
  return Number(anchorCountedQuantity) + (Number(currentErpQuantity) - Number(anchorErpQuantity));
}

export function resolveReceivableTerm(terms, platform, date) {
  return terms
    .filter(row => row.platform === platform && row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
}
```

- [ ] **Step 4: Add failing daily projection and metric tests**

The test must cover: latest ERP snapshot per SKU×warehouse, latest confirmed stocktake anchor, inventory-days null when COGS is missing, net-sales-weighted receivable days, paid plus unpaid payable days, core-SKU stockout rate, CCC coverage and inventory cash formula.

```js
const metrics = calculateGoodsFlowMetrics({
  month: "2026-07",
  daysInPeriod: 31,
  inventoryDaily: [{ date: "2026-07-20", skuId: "sku-1", calibratedInventoryValue: 3100, sellableQuantity: 0, isCore: true }],
  sales: [{ platform: "天猫", netSales: 7000, cost: 3100 }, { platform: "抖音", netSales: 3000, cost: 0 }],
  receivableTerms: [{ platform: "天猫", days: 30, effectiveFrom: "2026-01-01" }, { platform: "抖音", days: 10, effectiveFrom: "2026-01-01" }],
  purchases: [{ id: "po-1", amount: 1000, receivedAt: "2026-07-01" }],
  payments: [{ purchaseId: "po-1", amount: 600, paidAt: "2026-07-11" }],
  inventoryFunds: { paidPurchaseAmount: 4000, consumedSalesCost: 3100, confirmedStocktakeAdjustment: -100 }
});
assert.equal(metrics.receivableDays, 24);
assert.equal(metrics.inventoryCashTied, 800);
assert.equal(metrics.coverage.receivableTerms, 1);
```

- [ ] **Step 5: Implement daily projection, metric components and confidence projection**

`calculateGoodsFlowMetrics` returns:

```js
{
  month, cccDays, inventoryDays, receivableDays, payableDays, stockoutRate,
  inventoryCashTied,
  coverage: { inventory, salesCost, receivableTerms, payableDates, stocktake },
  confidence: "complete" | "partial" | "insufficient",
  formulaVersion: "goods-flow-v1"
}
```

- [ ] **Step 6: Run tests and commit**

Run: `node --test react-tests/goods-flow-domain.test.mjs`

Expected: PASS.

```bash
git add src/domain/goodsFlow.js react-tests/goods-flow-domain.test.mjs package.json
git commit -m "feat: add goods flow domain metrics"
```

### Task 2: D1 schema and executable platform contract

**Files:**
- Create: `migrations/0005_goods_flow_core.sql`
- Create: `tests/goods-flow-migration.test.mjs`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `functions/api/platform/_generated/environmentCapabilities.js`
- Modify: `functions/api/platform/_generated/integrationRegistry.js`
- Modify: `tests/environment-capabilities.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PRODUCT_FLOW_DB`; existing Cloudflare Pages, D1, DingTalk, Kuaimai and ERP-file registry entries.
- Produces: seven durable tables and the declared `goods-flow-core` environment capability.

- [ ] **Step 1: Write failing migration and manifest assertions**

```js
test("goods flow declares its production D1 schema", () => {
  const capability = manifest.capabilities.find(entry => entry.id === "goods-flow-core");
  assert.deepEqual(capability.platforms, ["cloudflare-pages", "cloudflare-d1", "dingtalk", "kuaimai", "erp-file-import"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, [
    "goods_flow_events", "goods_flow_inventory_daily", "goods_flow_stocktakes",
    "goods_flow_stocktake_lines", "goods_flow_receivable_terms", "goods_flow_ccc_monthly",
    "goods_flow_exceptions"
  ]);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test tests/goods-flow-migration.test.mjs tests/environment-capabilities.test.mjs`

Expected: FAIL because the migration and capability do not exist.

- [ ] **Step 3: Add idempotent schema**

The migration creates the seven tables with stable primary keys, source/idempotency indexes, SKU×warehouse×date unique projection keys, term effective-date indexes, stocktake status/version fields and CCC month/version unique keys. Events and frozen metric rows have no physical-delete route.

```sql
CREATE TABLE IF NOT EXISTS goods_flow_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  sku_id TEXT,
  warehouse_id TEXT,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  source_version TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  UNIQUE(source, source_reference, source_version)
);
```

- [ ] **Step 4: Update platform contract and generated modules**

Add `goods-flow-core`, extend provider code paths/relations without claiming Kuaimai inventory capability, document planned v1 routes, stable `GOODS_FLOW_*` errors, timeout/retry/idempotency, migration and rollback.

Run: `npm run generate:platform-manifests`

- [ ] **Step 5: Run contract checks and commit**

Run: `node --test tests/goods-flow-migration.test.mjs tests/environment-capabilities.test.mjs && npm run check:integrations && npm run check:environment-capabilities`

Expected: PASS.

```bash
git add migrations/0005_goods_flow_core.sql tests/goods-flow-migration.test.mjs tests/environment-capabilities.test.mjs docs/platform functions/api/platform/_generated package.json
git commit -m "feat: declare goods flow platform schema"
```

### Task 3: Goods-flow storage and legacy compatibility projection

**Files:**
- Create: `functions/api/platform/v1/goods-flow/_shared/storage.js`
- Create: `functions/api/platform/v1/goods-flow/_shared/legacyProjection.js`
- Create: `tests/helpers/goods-flow-d1-mock.mjs`
- Create: `tests/goods-flow-storage.test.mjs`

**Interfaces:**
- Consumes: D1 binding and normalized legacy supply-chain state plus product/sales rows.
- Produces: `goodsFlowDatabase(env)`, `appendGoodsFlowEvents(db, events)`, `listInventoryDaily(db, filters)`, `upsertReceivableTerm(db, term, actor)`, `saveStocktake(db, stocktake, lines, actor)`, `saveMonthlyMetrics(db, metrics, actor)`, `projectLegacyGoodsFlow(input)`.

- [ ] **Step 1: Write failing idempotency, term-version and projection tests**

```js
await appendGoodsFlowEvents(db, [event, event]);
assert.equal(db.tables.goods_flow_events.size, 1);

const projection = projectLegacyGoodsFlow({ supplyState, products, salesRows, asOf: "2026-07-20" });
assert.equal(projection.events.some(row => row.eventType === "purchase_paid"), true);
assert.equal(projection.exceptions.some(row => row.code === "GOODS_FLOW_SKU_MAPPING_REQUIRED"), true);
```

- [ ] **Step 2: Run and verify missing-module failure**

Run: `node --test tests/goods-flow-storage.test.mjs`

Expected: FAIL because storage and projection modules do not exist.

- [ ] **Step 3: Implement focused repository functions**

Keep SQL and JSON serialization in storage. Keep provider payload mapping in `legacyProjection.js`. Never import React or browser globals. `projectLegacyGoodsFlow` must ignore unlinked payment approvals and preserve source evidence.

```js
export async function appendGoodsFlowEvents(db, events = []) {
  const statements = events.map(event => db.prepare(`INSERT INTO goods_flow_events
    (id, event_type, sku_id, warehouse_id, occurred_at, source, source_reference, source_version, payload, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_reference, source_version) DO NOTHING`).bind(
      event.id, event.eventType, event.skuId || null, event.warehouseId || null,
      event.occurredAt, event.source, event.sourceReference, event.sourceVersion,
      JSON.stringify(event.payload || {}), event.createdAt, event.createdBy || null
    ));
  return statements.length ? db.batch(statements) : [];
}

export function projectLegacyGoodsFlow({ supplyState, products, salesRows, asOf }) {
  return { events: [], inventoryDaily: [], exceptions: [], asOf, products, salesRows, supplyState };
}
```

- [ ] **Step 4: Test malformed rows and partial batches**

Add tests showing one malformed payload does not hide valid rows, duplicate source references are idempotent, overlapping platform terms fail, and frozen CCC rows are inserted as new versions rather than overwritten.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/goods-flow-storage.test.mjs`

Expected: PASS.

```bash
git add functions/api/platform/v1/goods-flow/_shared tests/helpers/goods-flow-d1-mock.mjs tests/goods-flow-storage.test.mjs
git commit -m "feat: persist goods flow facts"
```

### Task 4: Authenticated goods-flow v1 API

**Files:**
- Create: `functions/api/platform/v1/goods-flow/_shared/authorization.js`
- Create: `functions/api/platform/v1/goods-flow/_shared/http.js`
- Create: `functions/api/platform/v1/goods-flow/dashboard.js`
- Create: `functions/api/platform/v1/goods-flow/inventory.js`
- Create: `functions/api/platform/v1/goods-flow/imports.js`
- Create: `functions/api/platform/v1/goods-flow/stocktakes.js`
- Create: `functions/api/platform/v1/goods-flow/stocktakes/[id]/transitions.js`
- Create: `functions/api/platform/v1/goods-flow/receivable-terms.js`
- Create: `functions/api/platform/v1/goods-flow/ccc.js`
- Create: `functions/api/platform/v1/goods-flow/ccc/[month]/recalculate.js`
- Create: `functions/api/platform/v1/goods-flow/ccc/[month]/freeze.js`
- Create: `tests/goods-flow-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 domain functions and Task 3 storage functions; `data.session` from existing authentication middleware.
- Produces: documented v1 JSON resources with `{ data, meta: { requestId, updatedAt, coverage, version } }` and stable `{ error: { code, message, requestId, retryable } }` failures.

- [ ] **Step 1: Write failing authentication and permission tests**

```js
assert.equal((await dashboard.onRequest({ request, env, data: {} })).status, 401);
assert.equal((await terms.onRequest({ request: putRequest, env, data: { session: productUser } })).status, 403);
assert.equal((await terms.onRequest({ request: putRequest, env, data: { session: financeUser } })).status, 200);
```

- [ ] **Step 2: Run and verify route failure**

Run: `node --test tests/goods-flow-api.test.mjs`

Expected: FAIL because route modules do not exist.

- [ ] **Step 3: Implement shared HTTP and role policies**

Define read departments, warehouse stocktake actions, supply difference confirmation, finance terms/amount/freeze actions and executive read scope. Read permission must not imply provider synchronization permission.

```js
export function authorizeGoodsFlow(session, action) {
  const department = String(session?.department || session?.departmentName || "").trim();
  if (!session?.userId && !session?.unionId && !session?.name) throw goodsFlowError("AUTH_SESSION_REQUIRED", 401);
  if (session.role === "readonly" && action !== "read") throw goodsFlowError("GOODS_FLOW_WRITE_DENIED", 403);
  if (!GOODS_FLOW_ACTION_DEPARTMENTS[action]?.has(department)) throw goodsFlowError("GOODS_FLOW_ACTION_DENIED", 403);
  return { department, actor: String(session.name || session.userId || "").slice(0, 80) };
}
```

- [ ] **Step 4: Implement query and command routes**

All writes validate body shape, expected version and idempotency key. Stocktake transitions allow `submit_count`, `confirm_difference`, `confirm_amount`, `correct`; CCC commands allow `recalculate` and `freeze`. Imports return success/failure counts and never clear prior successful data.

```js
export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  const requestId = crypto.randomUUID();
  try {
    const actor = authorizeGoodsFlow(data.session, request.method === "GET" ? "read" : "write");
    const db = goodsFlowDatabase(env);
    if (!db) throw goodsFlowError("GOODS_FLOW_STORAGE_UNAVAILABLE", 501);
    return jsonResponse({ data: await handleGoodsFlowRequest({ request, db, actor, params }), meta: { requestId } });
  } catch (error) {
    return goodsFlowErrorResponse(error, requestId);
  }
}
```

- [ ] **Step 5: Add failure, timeout and compatibility tests**

Cover missing D1 (501), malformed JSON (400), duplicate command (same response), version conflict (409), source partial failure (207), readonly identity (403), stale data metadata and old `/api/supply-chain` remaining unchanged.

- [ ] **Step 6: Run API tests and commit**

Run: `node --test tests/goods-flow-api.test.mjs tests/supply-chain-api.test.mjs`

Expected: PASS.

```bash
git add functions/api/platform/v1/goods-flow tests/goods-flow-api.test.mjs package.json
git commit -m "feat: expose goods flow platform api"
```

### Task 5: Goods-flow client and state orchestration

**Files:**
- Create: `src/state/goodsFlowApi.js`
- Create: `src/state/GoodsFlowProvider.jsx`
- Create: `react-tests/goods-flow-state.test.mjs`
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: v1 API resources and existing `SupplyChainProvider` compatibility data.
- Produces: `useGoodsFlow()` with `{ dashboard, inventory, terms, stocktakes, loading, stale, error, refresh, saveTerm, transitionStocktake, recalculateCcc, freezeCcc }`.

- [ ] **Step 1: Write failing client tests**

```js
const payload = await fetchGoodsFlowDashboard({ fetchImpl, url: "/api/platform/v1/goods-flow/dashboard" });
assert.equal(payload.data.metrics.cccDays, 67.4);
await assert.rejects(() => fetchGoodsFlowDashboard({ fetchImpl: failingFetch }), /上次成功数据/);
```

- [ ] **Step 2: Run and verify missing client failure**

Run: `node --test react-tests/goods-flow-state.test.mjs`

Expected: FAIL because the API client does not exist.

- [ ] **Step 3: Implement request helpers and provider**

The client converts stable API errors to Chinese messages but retains `code`, `requestId` and `retryable`. The provider keeps the most recent successful projection when refresh fails and sets `stale: true`; it does not persist financial facts in `localStorage`.

```js
export async function fetchGoodsFlowDashboard({ fetchImpl = fetch, url = "/api/platform/v1/goods-flow/dashboard" } = {}) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw toGoodsFlowClientError(payload, response.status);
  return payload;
}

export function GoodsFlowProvider({ children, enabled = true }) {
  const [dashboard, setDashboard] = useState(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  // refresh keeps dashboard unchanged on failure and only marks it stale.
  return <GoodsFlowContext.Provider value={{ dashboard, stale, error }}>{children}</GoodsFlowContext.Provider>;
}
```

- [ ] **Step 4: Wire the provider under authenticated supply access**

```jsx
<SupplyChainProvider enabled={hasSupplyChainAccess}>
  <GoodsFlowProvider enabled={hasSupplyChainAccess}>
    {children}
  </GoodsFlowProvider>
</SupplyChainProvider>
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test react-tests/goods-flow-state.test.mjs react-tests/platform-ui.test.mjs`

Expected: PASS.

```bash
git add src/state/goodsFlowApi.js src/state/GoodsFlowProvider.jsx src/main.jsx react-tests/goods-flow-state.test.mjs
git commit -m "feat: orchestrate goods flow state"
```

### Task 6: Supply-chain navigation and goods-flow cockpit

**Files:**
- Create: `src/features/supply-chain/GoodsFlowOverview.jsx`
- Create: `src/features/supply-chain/CashCycleWorkspace.jsx`
- Create: `src/features/supply-chain/ComingPhaseWorkspace.jsx`
- Modify: `src/features/supply-chain/SupplyChainAppPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/supply-chain-ui.test.mjs`
- Create: `react-tests/goods-flow-ui.test.mjs`

**Interfaces:**
- Consumes: `useGoodsFlow()` and the legacy summary for compatibility detail tables.
- Produces: routes `supply-overview`, `supply-demand`, `supply-procurement`, `supply-transit`, `supply-inventory`, `supply-fulfillment`, `supply-quality`, `supply-cash`, `supply-records`, `supply-settings` under the existing “供应链管理” navigation group.

- [ ] **Step 1: Replace old navigation assertions with failing merged-navigation assertions**

```js
for (const label of ["货流驾驶舱", "需求计划", "采购与供应商", "生产与在途", "库存管理", "履约物流", "逆向与质量", "现金循环", "同步与覆盖", "规则设置"]) {
  assert.match(app, new RegExp(label));
}
assert.doesNotMatch(app, /"货流管理", AppWindow/);
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test react-tests/supply-chain-ui.test.mjs react-tests/goods-flow-ui.test.mjs`

Expected: FAIL because the merged labels and workspaces are absent.

- [ ] **Step 3: Implement cockpit hierarchy**

`GoodsFlowOverview` renders exactly three headline metrics, freshness/coverage text, a compact human-decision exception strip, CCC/inventory-funds trend summary and the existing product detail table. It must render `—` with a reason when a metric is not computable.

```jsx
export function GoodsFlowOverview({ dashboard, legacySummary }) {
  const metrics = dashboard?.metrics || {};
  return <div className="goods-flow-workspace">
    <section className="goods-flow-headlines" aria-label="货流核心指标">
      <MetricHeadline label="CCC 现金循环周期" value={metrics.cccDays} unit="天" />
      <MetricHeadline label="断货率" value={metrics.stockoutRate} unit="%" />
      <MetricHeadline label="库存周转天数" value={metrics.inventoryDays} unit="天" />
    </section>
    <GoodsFlowExceptionStrip exceptions={dashboard?.exceptions || []} />
    <GoodsFlowTrend rows={dashboard?.trend || []} />
    <LegacySupplyDetail summary={legacySummary} />
  </div>;
}
```

- [ ] **Step 4: Implement Phase 0 routes and explicit future-phase states**

Existing supplier, approval and product-supply workspaces remain reachable through “采购与供应商” without nested title cards. Future-phase routes use `ComingPhaseWorkspace` with phase, required source and current available evidence; they do not render fake KPIs.

```jsx
const content = {
  overview: <GoodsFlowOverview dashboard={dashboard} legacySummary={summary} />,
  demand: <ComingPhaseWorkspace phase="Phase 1" title="需求计划" />,
  procurement: <ProcurementWorkspace products={products} />,
  transit: <ComingPhaseWorkspace phase="Phase 2" title="生产与在途" />,
  inventory: <InventoryWorkspace products={products} summary={summary} />,
  fulfillment: <ComingPhaseWorkspace phase="Phase 2" title="履约物流" />,
  quality: <QualityWorkspace products={products} />,
  cash: <CashCycleWorkspace />
};
```

- [ ] **Step 5: Add responsive and focus CSS**

At 1440px and laptop widths the three metrics stay readable. Below 1180px they wrap; tables scroll horizontally and keep Chinese labels horizontal. All route links and metric drill-down controls have visible `:focus-visible`.

- [ ] **Step 6: Run UI tests and commit**

Run: `node --test react-tests/supply-chain-ui.test.mjs react-tests/goods-flow-ui.test.mjs react-tests/laptop-readability.test.mjs`

Expected: PASS.

```bash
git add src/App.jsx src/features/supply-chain src/styles.css react-tests/supply-chain-ui.test.mjs react-tests/goods-flow-ui.test.mjs
git commit -m "feat: merge goods flow into supply chain ui"
```

### Task 7: Inventory calibration, monthly stocktake and finance terms UI

**Files:**
- Modify: `src/features/supply-chain/InventoryWorkspace.jsx`
- Create: `src/features/supply-chain/StocktakeWorkspace.jsx`
- Modify: `src/features/supply-chain/CashCycleWorkspace.jsx`
- Modify: `src/features/supply-chain/SupplyChainAppPage.jsx`
- Modify: `src/styles.css`
- Create: `react-tests/goods-flow-stocktake-ui.test.mjs`

**Interfaces:**
- Consumes: `inventory`, `stocktakes`, `terms` and actions from `useGoodsFlow()`.
- Produces: readable SKU×warehouse inventory table, monthly stocktake state flow, finance term editor and CCC version/freeze controls.

- [ ] **Step 1: Write failing structure and action tests**

Assertions require headers `69码`, `ERP账面`, `最近实盘`, `校准库存`, `盘点差异`, `可售天数`, `库龄`, `库存资金`, horizontal category labels, role-disabled reasons, import preview and the five stocktake stages.

- [ ] **Step 2: Run and verify failure**

Run: `node --test react-tests/goods-flow-stocktake-ui.test.mjs`

Expected: FAIL because the new columns and workflows are absent.

- [ ] **Step 3: Implement inventory table and monthly stocktake**

Replace the current snapshot-only table with a projection table while keeping source history below it. Import previews valid/failed rows. Warehouse submits counts, supply confirms differences, finance confirms amount when required; confirmed rows expose only “追加更正”.

```jsx
const projectionColumns = [
  { key: "product", header: "产品 / SKU / 69码", render: renderProductIdentity },
  { key: "warehouse", header: "仓库" },
  { key: "erp", header: "ERP账面", render: row => number(row.erpQuantity) },
  { key: "counted", header: "最近实盘", render: row => nullableNumber(row.countedQuantity) },
  { key: "calibrated", header: "校准库存", render: row => number(row.calibratedQuantity) },
  { key: "variance", header: "盘点差异", render: renderVariance },
  { key: "days", header: "可售天数", render: renderSellableDays },
  { key: "age", header: "库龄" },
  { key: "funds", header: "库存资金", render: renderPermittedMoney }
];
```

- [ ] **Step 4: Implement finance term and CCC controls**

Term rows contain platform, days, effective-from, optional effective-to and reason. Overlapping dates fail inline. Recalculate shows a version comparison; freeze requires a confirmation dialog and displays actor/time/version.

```jsx
<form onSubmit={saveTerm} className="goods-flow-term-form">
  <label>平台<select name="platform" required>{platformOptions}</select></label>
  <label>账期天数<input name="days" type="number" min="0" required /></label>
  <label>生效日期<input name="effectiveFrom" type="date" required /></label>
  <label>结束日期<input name="effectiveTo" type="date" /></label>
  <label>调整原因<input name="reason" required /></label>
  <Button type="submit" disabled={!canEditTerms}>保存账期</Button>
</form>
```

- [ ] **Step 5: Test responsive, empty, stale, error and permission states**

The test verifies no amount placeholder leaks to unauthorized roles, stale source banner appears beside affected rows, buttons expose disabled reasons, and original ERP source rows remain visible after stocktake confirmation.

- [ ] **Step 6: Run tests and commit**

Run: `node --test react-tests/goods-flow-stocktake-ui.test.mjs react-tests/supply-chain-ui.test.mjs`

Expected: PASS.

```bash
git add src/features/supply-chain src/styles.css react-tests/goods-flow-stocktake-ui.test.mjs
git commit -m "feat: add stocktake and cash cycle workspaces"
```

### Task 8: Migration preview, durable docs and full verification

**Files:**
- Create: `scripts/preview-goods-flow-migration.mjs`
- Create: `tests/goods-flow-migration-preview.test.mjs`
- Modify: `docs/product/data-definitions.md`
- Modify: `docs/product/roles-and-permissions.md`
- Modify: `DESIGN.md`
- Modify: `docs/features/supply-chain-goods-flow-phase-0/tasks.md`
- Modify: `docs/features/supply-chain-goods-flow-phase-0/plan.md`

**Interfaces:**
- Consumes: exported legacy projection and a sanitized supply snapshot.
- Produces: a no-write JSON reconciliation report with counts, mapped/unmapped entities, metric coverage and blocking differences.

- [ ] **Step 1: Write failing no-write migration preview test**

```js
const report = buildGoodsFlowMigrationPreview(snapshot);
assert.deepEqual(Object.keys(report), ["counts", "coverage", "unmapped", "blockingDifferences"]);
assert.equal(report.blockingDifferences.some(row => row.type === "payment_without_purchase"), true);
```

- [ ] **Step 2: Implement preview-only script**

The CLI accepts an input JSON path and optional output path, never accepts a database binding or writes production. It redacts provider payloads and personal fields.

```js
export function buildGoodsFlowMigrationPreview(snapshot) {
  const projection = projectLegacyGoodsFlow(snapshot);
  return {
    counts: countProjection(projection),
    coverage: calculateProjectionCoverage(projection),
    unmapped: projection.exceptions.filter(row => row.code.includes("MAPPING")),
    blockingDifferences: projection.exceptions.filter(row => row.severity === "blocking")
  };
}
```

- [ ] **Step 3: Update durable sources and task evidence**

Document double inventory ledgers, CCC components, versioned terms, server permissions, one App entry, no nested single-purpose title cards, horizontal table text, migration/rollback and Kuaimai inventory limitation. Mark each completed task with its actual test command and commit.

- [ ] **Step 4: Run focused integration checks**

```bash
node scripts/check-integration-impact.mjs --route --text "goods flow ERP DingTalk Kuaimai D1" --paths "functions/api/platform/v1/goods-flow,migrations,src/features/supply-chain"
npm run generate:platform-manifests
npm run check:integrations
npm run check:environment-capabilities
```

Expected: all affected platforms are declared and generated modules are current.

- [ ] **Step 5: Run the repository Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: every command exits 0.

- [ ] **Step 6: Perform UI verification**

Verify keyboard/focus, normal, loading, empty, stale, partial-success, error, no-permission, disabled and version-conflict states at 1440px, 1180px and a narrow 钉钉 WebView. Record local verification separately from Preview and Production; do not deploy without explicit release authorization.

- [ ] **Step 7: Commit final evidence**

```bash
git add scripts/preview-goods-flow-migration.mjs tests/goods-flow-migration-preview.test.mjs docs DESIGN.md
git commit -m "docs: finalize goods flow phase 0"
```
