# 数据中心应用第一阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third embedded Data Center App after Product Lifecycle, backed by D1 metadata and the existing daily sales fact table, with executive overview, operational analysis, source/metric/quality/sync/service/settings workspaces, permissions, and complete UI states.

**Architecture:** Build on the clean supply-chain integration branch so all three Apps share the existing React shell, authentication, organization permissions, platform registry, and design system. Keep sales facts in `product_sales_daily`; add a dedicated data-center metadata API and a read-only sales query API, then isolate all frontend data access behind `DataCenterProvider`.

**Tech Stack:** React 19, Vite 7, Recharts 3, Node test runner, Cloudflare Pages Functions, Cloudflare D1, existing CSS tokens and UI primitives.

## Global Constraints

- Execute from a clean branch containing the completed Supply Chain App; do not build from the current `codex/aliyun-deployment` source tree before that integration is present.
- The existing supply-chain worktree currently contains user-owned uncommitted changes in `src/App.jsx`, `src/features/supply-chain/SupplyChainAppPage.jsx`, and `react-tests/supply-chain-ui.test.mjs`; preserve them and resolve their branch state before creating the execution worktree.
- Main navigation order is exactly `公司经营 → 供应链管理 → 产品全周期 → 数据中心 → 平台`.
- Data Center App ID is `data-center`; its entry route is `data-overview`.
- Sales reporting uses order creation time, timezone `Asia/Shanghai`, and defaults to data through yesterday.
- Normal operational queries exclude `其它`, `其他`, `未知`, `未知平台`, and blank platform values; raw source facts remain unchanged.
- No account password, verification code, Cookie, browser Token, or browser session may be accepted by the UI or stored in D1/localStorage.
- Phase 1 reuses `product_sales_daily`; it does not duplicate sales facts or change `/api/sales` consumers.
- Phase 1 does not automate Chrome, download platform files, backfill history, or ingest ad-platform facts.
- All API authorization is enforced server-side in addition to navigation visibility.
- Use TDD for every behavior and keep existing Product Lifecycle and Supply Chain tests green.

---

## File Structure

### Create

- `src/domain/dataCenter.js`: date-range, platform exclusion, normalization, reducer, sales summary, freshness, and quality rules.
- `src/state/dataCenterApi.js`: data-center metadata and sales-query HTTP clients.
- `src/state/DataCenterProvider.jsx`: authenticated load/save state, sales range loading, local cache, and public context.
- `src/features/data-center/DataCenterAppPage.jsx`: section router and App-level loading/error shell.
- `src/features/data-center/DataOverview.jsx`: executive metric strip, trend, platform contribution, product movement, and warnings.
- `src/features/data-center/DataAnalysis.jsx`: operational filters and daily/platform/SKU drilldown.
- `src/features/data-center/DataSourceWorkspace.jsx`: safe source registration and status cards.
- `src/features/data-center/MetricCenterWorkspace.jsx`: metric definitions and immutable time-basis copy.
- `src/features/data-center/DataQualityWorkspace.jsx`: mapping, freshness, and coverage issues.
- `src/features/data-center/SyncRecordsWorkspace.jsx`: sync-run history and status vocabulary.
- `src/features/data-center/DataServiceWorkspace.jsx`: consumer subscriptions and freshness contracts.
- `src/features/data-center/DataCenterSettingsWorkspace.jsx`: timezone, day cutoff, retention, and thresholds.
- `functions/api/data-center.js`: metadata GET/POST route with department and readonly enforcement.
- `functions/api/data-center/sales.js`: read-only sales fact query with stable response metadata.
- `functions/api/data-center/_shared/storage.js`: D1 metadata records across the spec-named tables and settings persistence.
- `react-tests/data-center.test.mjs`: domain, shell, registry, permissions, UI-state, and responsive source checks.
- `tests/data-center-api.test.mjs`: D1, permission, query, exclusion, range, and response-contract tests.
- `tests/local-data-center-server.test.mjs`: local route and JSON fallback contract.

### Modify

- `src/App.jsx`: add the eight Data Center routes after Product Lifecycle and map them to one permission key.
- `src/main.jsx`: mount `DataCenterProvider` for authorized sessions.
- `src/domain/permissions.js`: add navigation/feature scopes and `canAccessDataCenter`.
- `src/domain/strategyExecution.js`: register Data Center as the third business App.
- `src/features/platform/AppCenterPage.jsx`: update the connected-App capability copy.
- `functions/api/sales.js`: export existing sales table helpers for the data-center query route without changing behavior.
- `server.mjs`: expose local metadata and sales-query routes using local JSON plus existing sales storage.
- `src/styles.css`: add dense Data Center layout, charts, tables, status states, and responsive rules.
- `package.json`: include data-center API tests in `test:api`.

---

### Task 1: Data Center domain contract

**Files:**
- Create: `src/domain/dataCenter.js`
- Create: `react-tests/data-center.test.mjs`

**Interfaces:**
- Produces: `DATA_CENTER_COLLECTIONS`, `DATA_CENTER_STATUS`, `createDefaultDataCenterState()`, `normalizeDataCenterState(input)`, `reduceDataCenterState(state, action)`, `defaultDataCenterRange(today)`, `isOperationalPlatform(value)`, `filterOperationalSales(rows)`, `summarizeDataCenterSales(rows, options)`, and `buildDataQualitySummary(input)`.
- Consumes: existing sales row shape `{ code, date, platform, qty, sales, netSales, grossProfit, refund, cost, preShipRefund, postShipRefund }`.

- [ ] **Step 1: Write failing date, platform, normalization, reducer, and summary tests**

Add these imports and tests to `react-tests/data-center.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultDataCenterState,
  defaultDataCenterRange,
  filterOperationalSales,
  normalizeDataCenterState,
  reduceDataCenterState,
  summarizeDataCenterSales
} from "../src/domain/dataCenter.js";

test("data center defaults to the month containing yesterday in Shanghai", () => {
  assert.deepEqual(defaultDataCenterRange(new Date("2026-07-18T04:00:00.000Z")), {
    from: "2026-07-01",
    to: "2026-07-17"
  });
  assert.deepEqual(defaultDataCenterRange(new Date("2026-08-01T01:00:00.000Z")), {
    from: "2026-07-01",
    to: "2026-07-31"
  });
});

test("normal operations exclude Other without deleting raw rows", () => {
  const raw = [
    { date: "2026-07-17", platform: "抖音", netSales: 80 },
    { date: "2026-07-17", platform: "其它", netSales: 20 },
    { date: "2026-07-17", platform: "未知平台", netSales: 10 }
  ];
  assert.deepEqual(filterOperationalSales(raw).map(row => row.platform), ["抖音"]);
  assert.equal(raw.length, 3);
});

test("sales summary exposes totals coverage and contribution", () => {
  const summary = summarizeDataCenterSales([
    { code: "6977173969783", date: "2026-07-16", platform: "抖音", qty: 2, sales: 100, netSales: 90, grossProfit: 40, refund: 10, cost: 50 },
    { code: "6977173969783", date: "2026-07-17", platform: "抖音", qty: 1, sales: 50, netSales: 45, grossProfit: 20, refund: 5, cost: 25 },
    { code: "6978705011352", date: "2026-07-17", platform: "天猫", qty: 3, sales: 120, netSales: 110, grossProfit: 55, refund: 10, cost: 55 },
    { code: "6900000000000", date: "2026-07-17", platform: "其它", qty: 9, sales: 900, netSales: 900, grossProfit: 1, refund: 0, cost: 0 }
  ], { from: "2026-07-16", to: "2026-07-17" });
  assert.equal(summary.totals.netSales, 245);
  assert.equal(summary.totals.qty, 6);
  assert.equal(summary.totals.refund, 25);
  assert.equal(summary.byDay.length, 2);
  assert.deepEqual(summary.byPlatform.map(row => row.platform), ["抖音", "天猫"]);
  assert.equal(summary.excludedRows, 1);
});

test("source records reject credential-like fields", () => {
  const normalized = normalizeDataCenterState({
    sources: [{ id: "km", name: "快麦", pageUrl: "https://erp.example", password: "secret", cookie: "sid=1" }]
  });
  assert.equal(normalized.sources[0].password, undefined);
  assert.equal(normalized.sources[0].cookie, undefined);
  assert.equal(normalized.sources[0].pageUrl, "https://erp.example");
});

test("source changes are audited", () => {
  const next = reduceDataCenterState(createDefaultDataCenterState(), {
    type: "upsert_source",
    actor: "数据管理员",
    record: { id: "kuaimai-sales", platform: "快麦", name: "快麦销售", pageUrl: "https://erp.superboss.cc/index.html#/index/", status: "disabled" }
  });
  assert.equal(next.sources[0].name, "快麦销售");
  assert.equal(next.auditLogs[0].actor, "数据管理员");
  assert.equal(next.auditLogs[0].action, "upsert_source");
});
```

- [ ] **Step 2: Run the domain test and verify the module is missing**

Run: `node --test react-tests/data-center.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/dataCenter.js`.

- [ ] **Step 3: Implement the domain contract**

Create `src/domain/dataCenter.js` with these exact public rules:

```js
export const DATA_CENTER_COLLECTIONS = [
  "sources", "runners", "syncRuns", "sourceFiles", "mappings",
  "metricDefinitions", "qualityIssues", "subscriptions", "auditLogs"
];

export const DATA_CENTER_STATUS = [
  "healthy", "running", "stale", "login_required", "schema_changed", "failed", "disabled"
];

const BLOCKED_SOURCE_KEYS = new Set([
  "password", "passwd", "cookie", "cookies", "token", "accessToken",
  "refreshToken", "verificationCode", "smsCode", "session"
]);
const EXCLUDED_PLATFORMS = new Set(["", "其它", "其他", "未知", "未知平台"]);

function shanghaiDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(value instanceof Date ? value : new Date(value));
}

function previousDay(day) {
  const timestamp = Date.parse(`${day}T00:00:00+08:00`) - 86400000;
  return shanghaiDate(new Date(timestamp));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * scale) / scale;
}

function safeRecord(record = {}) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !BLOCKED_SOURCE_KEYS.has(key)));
}

export function defaultDataCenterRange(today = new Date()) {
  const to = previousDay(shanghaiDate(today));
  return { from: `${to.slice(0, 7)}-01`, to };
}

export function isOperationalPlatform(value) {
  return !EXCLUDED_PLATFORMS.has(String(value || "").trim());
}

export function filterOperationalSales(rows = []) {
  return rows.filter(row => isOperationalPlatform(row?.platform));
}

export function createDefaultDataCenterState() {
  return {
    version: "data-center-v1",
    updatedAt: "",
    sources: [], runners: [], syncRuns: [], sourceFiles: [], mappings: [],
    metricDefinitions: [
      { id: "net-sales", metricCode: "sales.net_sales", name: "净销售额", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true, version: 1 },
      { id: "gross-profit", metricCode: "sales.gross_profit", name: "毛利", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true, version: 1 }
    ],
    qualityIssues: [],
    subscriptions: [
      { id: "product-flow-sales", appId: "product-flow", dataset: "sales_daily", apiVersion: "v1", freshnessHours: 32, enabled: true }
    ],
    auditLogs: [],
    settings: { timezone: "Asia/Shanghai", cutoff: "07:30", rawRetentionDays: 365, staleAfterHours: 32 }
  };
}

export function normalizeDataCenterState(input = {}) {
  const base = createDefaultDataCenterState();
  const state = { ...base, ...input, settings: { ...base.settings, ...(input.settings || {}) } };
  for (const key of DATA_CENTER_COLLECTIONS) state[key] = Array.isArray(input[key]) ? input[key].map(safeRecord) : base[key].map(safeRecord);
  state.sources = state.sources.map(source => ({ captureMethod: "export", status: "disabled", enabled: false, ...source }));
  return state;
}

export function reduceDataCenterState(state, action = {}) {
  const current = normalizeDataCenterState(state);
  const timestamp = action.timestamp || new Date().toISOString();
  if (action.type === "upsert_source") {
    const record = { ...safeRecord(action.record), updatedAt: timestamp };
    const exists = current.sources.some(item => item.id === record.id);
    const sources = exists ? current.sources.map(item => item.id === record.id ? { ...item, ...record } : item) : [record, ...current.sources];
    return normalizeDataCenterState({
      ...current,
      sources,
      updatedAt: timestamp,
      auditLogs: [{ id: `audit-${Date.now()}`, actor: action.actor || "系统", action: "upsert_source", entityId: record.id, createdAt: timestamp }, ...current.auditLogs]
    });
  }
  if (action.type === "settings") return normalizeDataCenterState({ ...current, settings: { ...current.settings, ...safeRecord(action.settings) }, updatedAt: timestamp });
  return current;
}

export function summarizeDataCenterSales(rows = [], options = {}) {
  const filtered = filterOperationalSales(rows).filter(row => (!options.from || row.date >= options.from) && (!options.to || row.date <= options.to));
  const totals = filtered.reduce((sum, row) => ({
    qty: sum.qty + number(row.qty), sales: sum.sales + number(row.sales), netSales: sum.netSales + number(row.netSales),
    grossProfit: sum.grossProfit + number(row.grossProfit), refund: sum.refund + number(row.refund), cost: sum.cost + number(row.cost)
  }), { qty: 0, sales: 0, netSales: 0, grossProfit: 0, refund: 0, cost: 0 });
  const group = key => [...filtered.reduce((map, row) => {
    const value = String(row[key] || "");
    const item = map.get(value) || { [key]: value, qty: 0, sales: 0, netSales: 0, grossProfit: 0, refund: 0, cost: 0 };
    for (const metric of ["qty", "sales", "netSales", "grossProfit", "refund", "cost"]) item[metric] += number(row[metric]);
    map.set(value, item);
    return map;
  }, new Map()).values()];
  return {
    totals: { ...totals, refundRate: totals.sales ? round(totals.refund / totals.sales * 100) : 0, grossMarginRate: totals.netSales ? round(totals.grossProfit / totals.netSales * 100) : 0 },
    byDay: group("date").sort((a, b) => a.date.localeCompare(b.date)),
    byPlatform: group("platform").sort((a, b) => b.netSales - a.netSales),
    byProduct: group("code").sort((a, b) => b.netSales - a.netSales),
    excludedRows: rows.length - filtered.length,
    rowCount: filtered.length
  };
}

export function buildDataQualitySummary({ state, salesMeta, salesRows } = {}) {
  const normalized = normalizeDataCenterState(state);
  return {
    openIssues: normalized.qualityIssues.filter(item => item.status !== "resolved").length,
    unmappedProducts: normalized.mappings.filter(item => item.dimensionType === "product" && item.status !== "confirmed").length,
    excludedRows: (salesRows || []).filter(row => !isOperationalPlatform(row.platform)).length,
    lastSuccessfulSyncAt: salesMeta?.lastSuccessfulSyncAt || salesMeta?.imports?.[0]?.importedAt || ""
  };
}
```

- [ ] **Step 4: Run the domain test and verify it passes**

Run: `node --test react-tests/data-center.test.mjs`

Expected: 5 tests PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/domain/dataCenter.js react-tests/data-center.test.mjs
git commit -m "feat(data): add data center domain"
```

---

### Task 2: D1 metadata and sales-query APIs

**Files:**
- Create: `functions/api/data-center.js`
- Create: `functions/api/data-center/sales.js`
- Create: `functions/api/data-center/_shared/storage.js`
- Create: `tests/data-center-api.test.mjs`
- Modify: `functions/api/sales.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `normalizeDataCenterState`, `filterOperationalSales`, and existing `product_sales_daily` rows.
- Produces: `GET/POST /api/data-center`, `GET /api/data-center/sales?from=YYYY-MM-DD&to=YYYY-MM-DD`, `ensureDataCenterTables(db)`, `readDataCenterState(db)`, and `writeDataCenterState(db, state, actor)`.

- [ ] **Step 1: Write failing API tests**

In `tests/data-center-api.test.mjs`, create a D1 mock with per-table record maps, `meta`, and `salesRows`, then assert these exact behaviors:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as metadataRequest } from "../functions/api/data-center.js";
import { onRequest as salesRequest } from "../functions/api/data-center/sales.js";

const executive = { name: "周总", department: "总经办" };

test("data-center metadata requires D1 and authorized departments", async () => {
  const missing = await metadataRequest({ request: new Request("https://flow.example/api/data-center"), env: {}, data: { session: executive } });
  assert.equal(missing.status, 501);
  const forbidden = await metadataRequest({ request: new Request("https://flow.example/api/data-center"), env: { PRODUCT_FLOW_DB: createDataCenterD1Mock() }, data: { session: { name: "设计同事", department: "设计部" } } });
  assert.equal(forbidden.status, 403);
});

test("data-center metadata round-trips safe source records", async () => {
  const db = createDataCenterD1Mock();
  const state = { sources: [{ id: "km", name: "快麦", pageUrl: "https://erp.superboss.cc/", password: "never-store" }] };
  const post = await metadataRequest({ request: new Request("https://flow.example/api/data-center", { method: "POST", body: JSON.stringify({ state }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  assert.equal(post.status, 200);
  const get = await metadataRequest({ request: new Request("https://flow.example/api/data-center"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  const payload = await get.json();
  assert.equal(payload.state.sources[0].name, "快麦");
  assert.equal(payload.state.sources[0].password, undefined);
});

test("data-center sales uses creation-time contract and excludes Other", async () => {
  const db = createDataCenterD1Mock({ salesRows: [
    { code: "6977173969783", date: "2026-07-17", platform: "抖音", qty: 2, sales: 100, net_sales: 90, gross_profit: 40, refund: 10, cost: 50, pre_ship_refund: 6, post_ship_refund: 4 },
    { code: "6977173969783", date: "2026-07-17", platform: "其它", qty: 9, sales: 900, net_sales: 900, gross_profit: 1, refund: 0, cost: 0, pre_ship_refund: 0, post_ship_refund: 0 }
  ] });
  const response = await salesRequest({ request: new Request("https://flow.example/api/data-center/sales?from=2026-07-01&to=2026-07-17"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].platform, "抖音");
  assert.equal(payload.timeBasis, "create_time");
  assert.equal(payload.timezone, "Asia/Shanghai");
  assert.equal(payload.range.to, "2026-07-17");
});

test("readonly sessions cannot mutate data-center metadata", async () => {
  const response = await metadataRequest({ request: new Request("https://flow.example/api/data-center", { method: "POST", body: JSON.stringify({ state: {} }) }), env: { PRODUCT_FLOW_DB: createDataCenterD1Mock() }, data: { session: { name: "访客", department: "总经办", role: "readonly" } } });
  assert.equal(response.status, 403);
});
```

The mock must recognize the whitelisted tables below, `data_center_meta`, and the range query against `product_sales_daily`; its `all()` filters `date >= from`, `date <= to`, and returns seeded sales rows.

- [ ] **Step 2: Run the API test and verify the routes are missing**

Run: `node --test tests/data-center-api.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `functions/api/data-center.js`.

- [ ] **Step 3: Implement safe metadata storage**

Create `functions/api/data-center/_shared/storage.js` using a record-per-entity pattern across the spec-named tables. Only the constant map may interpolate a table name into SQL:

```js
export function dataCenterDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export const DATA_CENTER_TABLES = {
  sources: "data_sources",
  runners: "data_runners",
  syncRuns: "data_sync_runs",
  sourceFiles: "data_source_files",
  mappings: "data_dimension_mappings",
  metricDefinitions: "data_metric_definitions",
  qualityIssues: "data_quality_issues",
  subscriptions: "data_app_subscriptions",
  auditLogs: "data_audit_logs"
};

export async function ensureDataCenterTables(db) {
  for (const table of Object.values(DATA_CENTER_TABLES)) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`).run();
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_center_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`).run();
}
```

`writeDataCenterState` must normalize first, delete and replace only keys present in `DATA_CENTER_TABLES`, batch statements, and save `version`, `updatedAt`, `updatedBy`, and `settings`. `readDataCenterState` must query only `DATA_CENTER_TABLES`, isolate malformed JSON records, and merge saved settings over defaults. This keeps facts out of metadata JSON while preserving the core table names defined by the design.

- [ ] **Step 4: Implement metadata authorization and GET/POST**

Create `functions/api/data-center.js` with:

```js
const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"]);
const EDIT_DEPARTMENTS = new Set(["总经办", "运营部"]);

function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

export async function onRequest({ request, env, data }) {
  if (request.method === "OPTIONS") return optionsResponse();
  const session = data?.session || {};
  if (!VIEW_DEPARTMENTS.has(department(session))) return jsonResponse({ message: "无权访问数据中心。" }, 403);
  const db = dataCenterDatabase(env);
  if (!db) return jsonResponse({ synced: false, message: "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。" }, 501);
  if (request.method === "GET") return jsonResponse({ synced: true, ...(await readDataCenterState(db)) });
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  if (session.role === "readonly" || !EDIT_DEPARTMENTS.has(department(session))) return jsonResponse({ message: "无权修改数据中心。" }, 403);
  const body = await request.json().catch(() => ({}));
  const result = await writeDataCenterState(db, body.state, session.name || "系统");
  return jsonResponse({ synced: true, ...result });
}
```

Import `jsonResponse` and `optionsResponse` from the existing DingTalk response helper and storage functions from `_shared/storage.js`.

- [ ] **Step 5: Export the existing sales table helpers and implement the query route**

Change existing declarations in `functions/api/sales.js` to named exports without changing their bodies:

```js
export function salesDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureSalesTables(db) {
```

Create `functions/api/data-center/sales.js`. Validate `/^\d{4}-\d{2}-\d{2}$/`, require `from <= to`, cap ranges at 370 days, call `ensureSalesTables`, and query ordered rows between the two dates. Convert snake_case fields to the existing camelCase sales-row shape, pass rows through `filterOperationalSales`, and return:

```js
return jsonResponse({
  synced: true,
  rows: filterOperationalSales(rows),
  range: { from, to },
  timeBasis: "create_time",
  timezone: "Asia/Shanghai",
  lastSuccessfulSyncAt: meta.imports?.[0]?.importedAt || "",
  lastDataDate: rows.at(-1)?.date || "",
  coverage: rows.length ? "available" : "empty",
  metricVersion: "sales-v1",
  warnings: []
});
```

Allow the same view departments as metadata GET. Reject mutation methods with 405.

- [ ] **Step 6: Add the API test to the project script and run it**

Append `tests/data-center-api.test.mjs` to `test:api` in `package.json`.

Run: `node --test tests/data-center-api.test.mjs`

Expected: 4 tests PASS.

- [ ] **Step 7: Run existing sales and supply API regressions**

Run: `node --test react-tests/sales-data.test.mjs tests/supply-chain-api.test.mjs tests/data-center-api.test.mjs`

Expected: all tests PASS and existing `/api/sales` behavior remains unchanged.

- [ ] **Step 8: Commit the API boundary**

```bash
git add functions/api/data-center.js functions/api/data-center/sales.js functions/api/data-center/_shared/storage.js functions/api/sales.js tests/data-center-api.test.mjs package.json
git commit -m "feat(data): add data center APIs"
```

---

### Task 3: Data Center provider and clients

**Files:**
- Create: `src/state/dataCenterApi.js`
- Create: `src/state/DataCenterProvider.jsx`
- Modify: `react-tests/data-center.test.mjs`

**Interfaces:**
- Consumes: `GET/POST /api/data-center`, `GET /api/data-center/sales`, `normalizeDataCenterState`, `reduceDataCenterState`, `defaultDataCenterRange`, and authenticated user.
- Produces: `useDataCenter()` returning `{ state, sales, range, loading, refreshing, error, dispatch, setRange, refreshSales }`.

- [ ] **Step 1: Add failing source checks for the provider contract**

Append to `react-tests/data-center.test.mjs`:

```js
import { readFileSync } from "node:fs";

test("data center provider isolates API access and local cache", () => {
  const provider = readFileSync(new URL("../src/state/DataCenterProvider.jsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/state/dataCenterApi.js", import.meta.url), "utf8");
  assert.match(provider, /useDataCenter/);
  assert.match(provider, /dataCenterState/);
  assert.match(provider, /refreshSales/);
  assert.match(api, /\/api\/data-center\/sales/);
  assert.match(api, /encodeURIComponent\(range\.from\)/);
  assert.match(api, /encodeURIComponent\(range\.to\)/);
});
```

- [ ] **Step 2: Run the provider test and verify it fails**

Run: `node --test react-tests/data-center.test.mjs`

Expected: FAIL with `ENOENT` for `src/state/DataCenterProvider.jsx`.

- [ ] **Step 3: Implement API clients**

Create `src/state/dataCenterApi.js` with three exported functions:

```js
export async function fetchDataCenterState() {
  const response = await fetch("/api/data-center");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "数据中心加载失败。");
  return payload.state;
}

export async function saveDataCenterState(state) {
  const response = await fetch("/api/data-center", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false) throw new Error(payload.message || "数据中心保存失败。");
  return payload;
}

export async function fetchDataCenterSales(range) {
  const query = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const response = await fetch(`/api/data-center/sales?${query}`);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 501) return { unavailable: true, rows: [], range };
  if (!response.ok) throw new Error(payload.message || "销售数据读取失败。");
  return payload;
}
```

- [ ] **Step 4: Implement the provider**

`DataCenterProvider` is mounted inside `ProductFlowProvider`; use `useProductFlow()` to derive all registered 69 codes. It must:

- load cached `dataCenterState` synchronously;
- normalize all cached/server data;
- load metadata and sales in parallel when enabled;
- when `fetchDataCenterSales` returns `unavailable: true`, call existing `fetchSalesForCodes(codes)`, filter those browser IndexedDB rows by the requested date range and operational platform, and construct the same `rows/range/timeBasis/timezone/lastDataDate/coverage/metricVersion/warnings` shape;
- retain cached data on server errors;
- debounce metadata writes by 600 ms only after `dispatch` marks state dirty;
- never persist sales rows to localStorage;
- expose `setRange` and `refreshSales`;
- suppress network errors only for localhost preview while still exposing empty data states.

Mount value with:

```js
const value = useMemo(() => ({
  state, sales, range, loading, refreshing, error, dispatch, setRange, refreshSales
}), [dispatch, error, loading, range, refreshSales, refreshing, sales, state]);
```

- [ ] **Step 5: Run the provider contract test**

Run: `node --test react-tests/data-center.test.mjs`

Expected: all Data Center tests PASS.

- [ ] **Step 6: Commit provider and clients**

```bash
git add src/state/dataCenterApi.js src/state/DataCenterProvider.jsx react-tests/data-center.test.mjs
git commit -m "feat(data): add data center provider"
```

---

### Task 4: Third-App registration, permissions, and navigation order

**Files:**
- Create: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/main.jsx`
- Modify: `src/domain/permissions.js`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/features/platform/AppCenterPage.jsx`
- Modify: `react-tests/data-center.test.mjs`

**Interfaces:**
- Consumes: `DataCenterProvider`, `DataCenterAppPage`, existing supply-chain route mapping, `canViewNavigation`, and `buildAppHealth`.
- Produces: eight `data-*` screens mapped to permission key `data-center`, plus business-App registry entry `{ id: "data-center", route: "data-overview" }`.

- [ ] **Step 1: Add failing shell, position, registry, and permission tests**

Append:

```js
test("data center is the third App and follows Product Lifecycle in the sidebar", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const strategy = readFileSync(new URL("../src/domain/strategyExecution.js", import.meta.url), "utf8");
  const permissions = readFileSync(new URL("../src/domain/permissions.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  for (const label of ["数据总览", "数据分析", "数据接入", "指标中心", "数据质量", "同步记录", "数据服务", "设置"]) assert.match(app, new RegExp(label));
  assert.ok(app.indexOf('"产品档案"') < app.indexOf('"数据总览"'));
  assert.ok(app.indexOf('"数据总览"') < app.lastIndexOf('"问题反馈"'));
  assert.match(app, /return DATA_CENTER_SCREEN_TO_SECTION\.has\(screen\) \? "data-center"/);
  assert.match(strategy, /id: "data-center"[\s\S]*route: "data-overview"/);
  assert.match(permissions, /canAccessDataCenter/);
  assert.match(main, /DataCenterProvider enabled=\{hasDataCenterAccess\}/);
});
```

- [ ] **Step 2: Run the shell test and verify it fails**

Run: `node --test react-tests/data-center.test.mjs`

Expected: FAIL because the Data Center navigation is absent.

- [ ] **Step 3: Add permission scope**

In `src/domain/permissions.js`:

- add `{ key: "data-center", label: "数据中心" }` after the product navigation items and before Platform items;
- add feature `{ key: "dataCenter", label: "数据中心", description: "查看经营、销售、投放、数据质量和同步状态。" }`;
- default view departments: `总经办`, `运营部`, `财务部`, `产品部`, `供应链部`, `供应链`, `供应链团队`, `采购部`;
- default edit departments: `总经办`, `运营部`;
- export `canAccessDataCenter(user)` using the default feature view scope.

- [ ] **Step 4: Register the third business App**

Add to `DEFAULT_APP_REGISTRY` after Supply Chain:

```js
{
  id: "data-center",
  name: "数据中心",
  description: "统一经营数据接入、口径、质量、分析与跨 App 服务。",
  route: "data-overview",
  enabled: true,
  status: "connected"
}
```

Update `AppCenterPage` standard-capability copy to mention all three connected Apps without claiming that browser automation is active.

- [ ] **Step 5: Add navigation after Product Lifecycle**

In `src/App.jsx`, create:

```js
const DATA_CENTER_NAV = [
  ["data-overview", "数据总览", LayoutDashboard, "数据中心", "overview"],
  ["data-analysis", "数据分析", ChartNoAxesCombined, "数据中心", "analysis"],
  ["data-sources", "数据接入", PlugZap, "数据中心", "sources"],
  ["data-metrics", "指标中心", Ruler, "数据中心", "metrics"],
  ["data-quality", "数据质量", ShieldAlert, "数据中心", "quality"],
  ["data-records", "同步记录", FileClock, "数据中心", "records"],
  ["data-services", "数据服务", Network, "数据中心", "services"],
  ["data-settings", "设置", Settings, "数据中心", "settings"]
];
const DATA_CENTER_SCREEN_TO_SECTION = new Map(DATA_CENTER_NAV.map(([screen, , , , section]) => [screen, section]));
```

Spread `DATA_CENTER_NAV` immediately after the Product Lifecycle entries and before Platform entries in `COMPANY_NAV`. For `PRODUCT_NAV`, append it after the Product Lifecycle entries and before `issues/settings`. Extend route resolution so legacy `data-center` resolves to `data-overview`; map all `data-*` screens to the single `data-center` permission key. Render `<DataCenterAppPage section={dataCenterSection} />` before the normal page map.

Create a buildable first version of `DataCenterAppPage.jsx` in this task so the shell commit never contains a missing import:

```jsx
import { PageHeader } from "../../ui/PageHeader.jsx";

const SECTION_LABELS = {
  overview: "数据总览",
  analysis: "数据分析",
  sources: "数据接入",
  metrics: "指标中心",
  quality: "数据质量",
  records: "同步记录",
  services: "数据服务",
  settings: "设置"
};

export function DataCenterAppPage({ section = "overview" }) {
  return (
    <section className="page data-center-app">
      <PageHeader title="数据中心" description="统一经营数据接入、口径、质量、分析与跨 App 服务。" />
      <section className="section-panel">
        <h2>{SECTION_LABELS[section] || SECTION_LABELS.overview}</h2>
        <p>数据中心基础能力正在初始化。</p>
      </section>
    </section>
  );
}
```

- [ ] **Step 6: Mount the provider only for authorized sessions**

In `src/main.jsx`, compute `hasDataCenterAccess = canAccessDataCenter(user)` and nest:

```jsx
<DataCenterProvider enabled={hasDataCenterAccess}>
  <PlatformProvider enabled={hasCompanyAccess}>
    {hasCompanyAccess ? <ProductFlowPlatformBridge /> : null}
    <App />
  </PlatformProvider>
</DataCenterProvider>
```

Keep `ProductFlowProvider` and `SupplyChainProvider` ordering unchanged.

- [ ] **Step 7: Run shell and permission tests**

Run: `node --test react-tests/data-center.test.mjs react-tests/supply-chain-ui.test.mjs react-tests/platform-ui.test.mjs react-tests/company-access-gate.test.mjs`

Expected: all tests PASS; Supply Chain remains before Product Lifecycle and Data Center remains after Product Lifecycle.

- [ ] **Step 8: Commit the shell integration**

```bash
git add src/App.jsx src/main.jsx src/domain/permissions.js src/domain/strategyExecution.js src/features/platform/AppCenterPage.jsx src/features/data-center/DataCenterAppPage.jsx react-tests/data-center.test.mjs
git commit -m "feat(data): register data center app"
```

---

### Task 5: Executive overview and operational analysis

**Files:**
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Create: `src/features/data-center/DataOverview.jsx`
- Create: `src/features/data-center/DataAnalysis.jsx`
- Modify: `react-tests/data-center.test.mjs`

**Interfaces:**
- Consumes: `useDataCenter()`, `summarizeDataCenterSales`, existing `PageHeader`, `DataTable`, `Button`, Recharts, and Product Flow product/SKU data.
- Produces: `DataCenterAppPage({ section })`, `DataOverview({ summary, sales, products, meta })`, and `DataAnalysis({ sales, range, onRangeChange, products })`.

- [ ] **Step 1: Add failing UI content and state tests**

Append source assertions that require:

```js
test("overview and analysis expose source truth and operating drilldowns", () => {
  const page = readFileSync(new URL("../src/features/data-center/DataCenterAppPage.jsx", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../src/features/data-center/DataOverview.jsx", import.meta.url), "utf8");
  const analysis = readFileSync(new URL("../src/features/data-center/DataAnalysis.jsx", import.meta.url), "utf8");
  for (const text of ["订单创建时间", "数据截止", "覆盖率", "净销售额", "退款率", "毛利率", "广告消耗", "整体 ROI"]) assert.match(overview, new RegExp(text));
  for (const text of ["时间范围", "平台", "产品", "SKU", "按日", "按平台", "按产品"]) assert.match(analysis, new RegExp(text));
  assert.match(page, /loading/);
  assert.match(page, /error/);
  assert.match(page, /refreshSales/);
});
```

- [ ] **Step 2: Run the UI test and verify files are missing**

Run: `node --test react-tests/data-center.test.mjs`

Expected: FAIL with `ENOENT` for the first Data Center feature file.

- [ ] **Step 3: Implement the App page**

`DataCenterAppPage` reads provider and product context, builds the summary with `useMemo`, maps SKU codes to product names, and selects the workspace by `section`. Its visible shell is:

```jsx
<section className="page data-center-app">
  <PageHeader
    title="数据中心"
    description="统一经营数据接入、口径、质量、分析与跨 App 服务。"
    actions={<Button onClick={refreshSales} disabled={refreshing}>{refreshing ? "正在刷新" : "刷新数据"}</Button>}
  />
  {error ? <p className="data-center-message error" role="alert">{error}</p> : null}
  {loading ? <div className="data-center-loading" aria-label="正在加载数据中心"><span /><span /><span /></div> : content[section]}
</section>
```

Do not render nested navigation because the primary sidebar owns all eight routes.

- [ ] **Step 4: Implement executive overview**

Render six sales metric cards and two unavailable ad cards. Ad cards show `—` and `巨量数据尚未接入`, never zero. Every card includes `数据截止：{lastDataDate || "暂无数据"}`. Add:

- Recharts `ComposedChart` with `netSales` bars and `grossProfit` line by day;
- platform contribution table sorted by net sales;
- product contribution table showing mapped product name or `待映射 · {code}`;
- warning strip for no data, stale data, excluded rows, unmapped products, and incomplete coverage;
- basis note: `销售口径：订单创建时间 · Asia/Shanghai · 默认不含其它`.

- [ ] **Step 5: Implement analysis filters and drilldown**

Use controlled filters for `from`, `to`, `platform`, `productId`, `code`, and grouping. Date Apply calls `onRangeChange({ from, to })`. Derived rows must always start from operational sales and then apply selected filters. Provide three table column sets:

```js
const GROUPS = [
  { key: "day", label: "按日" },
  { key: "platform", label: "按平台" },
  { key: "product", label: "按产品" }
];
```

Columns include net sales, quantity, refunds, refund rate, gross profit, and gross margin rate. Empty state copy is `当前范围没有可分析的正常经营数据。`.

- [ ] **Step 6: Run Data Center UI and domain tests**

Run: `node --test react-tests/data-center.test.mjs`

Expected: all tests PASS.

- [ ] **Step 7: Commit overview and analysis**

```bash
git add src/features/data-center/DataCenterAppPage.jsx src/features/data-center/DataOverview.jsx src/features/data-center/DataAnalysis.jsx react-tests/data-center.test.mjs
git commit -m "feat(data): add sales overview and analysis"
```

---

### Task 6: Source, metric, quality, records, service, and settings workspaces

**Files:**
- Create: `src/features/data-center/DataSourceWorkspace.jsx`
- Create: `src/features/data-center/MetricCenterWorkspace.jsx`
- Create: `src/features/data-center/DataQualityWorkspace.jsx`
- Create: `src/features/data-center/SyncRecordsWorkspace.jsx`
- Create: `src/features/data-center/DataServiceWorkspace.jsx`
- Create: `src/features/data-center/DataCenterSettingsWorkspace.jsx`
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `react-tests/data-center.test.mjs`

**Interfaces:**
- Consumes: normalized state, audit reducer actions, current user, quality summary, `DataTable`, `Button`, and common status badges.
- Produces: six working secondary workspaces; source and settings mutations dispatch `upsert_source` and `settings`.

- [ ] **Step 1: Add failing safe-form and workspace-state tests**

Assert every file exists and contains its required vocabulary. The source test must explicitly reject credential fields:

```js
test("source settings collect URLs and status without credentials", () => {
  const source = readFileSync(new URL("../src/features/data-center/DataSourceWorkspace.jsx", import.meta.url), "utf8");
  for (const text of ["平台", "店铺或账户名称", "后台地址", "采集方式", "计划时间", "登录后立即重试"]) assert.match(source, new RegExp(text));
  assert.doesNotMatch(source, /type="password"/);
  assert.doesNotMatch(source, /账号密码/);
  assert.match(source, /不保存密码、Cookie、验证码或浏览器会话/);
});
```

Also require status labels `正常`, `运行中`, `数据过期`, `需要登录`, `字段变化`, `失败`, `已停用`; metric copy `create_time` and `Asia/Shanghai`; quality labels `未映射产品`, `其它数据`, `数据过期`; service labels `产品全周期`, `sales_daily`, `新鲜度承诺`; settings labels `07:30`, `365`, `32`.

- [ ] **Step 2: Run tests and verify secondary files are missing**

Run: `node --test react-tests/data-center.test.mjs`

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Implement safe source registration**

The form state is limited to:

```js
const EMPTY_SOURCE = {
  platform: "快麦",
  name: "",
  accountLabel: "",
  pageUrl: "",
  captureMethod: "export",
  timeBasis: "create_time",
  timezone: "Asia/Shanghai",
  schedule: "07:30",
  status: "disabled",
  enabled: false
};
```

Validate `https:` URLs, require name/platform/page URL, create a stable `source-${Date.now()}` ID, and dispatch `upsert_source`. Existing cards display name, account label, URL hostname, status, last success, last data date, schedule, and capture method. `登录后立即重试` is disabled in Phase 1 with help text `本地浏览器采集器尚未连接`; it must not simulate success.

- [ ] **Step 4: Implement metric, quality, sync, service, and settings pages**

- Metric Center renders `metricCode`, name, formula/time basis, timezone, exclusion rule, version, and owner; Phase 1 definitions are read-only.
- Data Quality renders computed issue counts and `state.qualityIssues`; show a success empty state only when last data date reaches the selected range end and no open issues exist.
- Sync Records renders mode, source, range, status, rows read/written/rejected, start/end time, and explicit error. No rows means `还没有数据中心同步记录。`.
- Data Service renders subscriptions and explains consumers never calculate metric formulas or exclude Other themselves.
- Settings allows authorized users to change timezone (fixed option `Asia/Shanghai`), cutoff, raw retention days, and stale hours; dispatch `settings` only after validation.

- [ ] **Step 5: Wire all workspaces in `DataCenterAppPage`**

Use this complete section mapping:

```js
const content = {
  overview: <DataOverview summary={summary} sales={sales} products={products} meta={meta} />,
  analysis: <DataAnalysis sales={sales.rows} range={range} onRangeChange={setRange} products={products} />,
  sources: <DataSourceWorkspace state={state} canEdit={canEdit} dispatch={dispatch} />,
  metrics: <MetricCenterWorkspace definitions={state.metricDefinitions} />,
  quality: <DataQualityWorkspace state={state} sales={sales} range={range} />,
  records: <SyncRecordsWorkspace runs={state.syncRuns} sources={state.sources} />,
  services: <DataServiceWorkspace subscriptions={state.subscriptions} />,
  settings: <DataCenterSettingsWorkspace settings={state.settings} canEdit={canEdit} dispatch={dispatch} />
};
```

`canEdit` uses `canEditFeature(productState.settings?.permissions, currentUser, "dataCenter")` rather than a frontend department list.

- [ ] **Step 6: Run all Data Center tests**

Run: `node --test react-tests/data-center.test.mjs tests/data-center-api.test.mjs`

Expected: all tests PASS.

- [ ] **Step 7: Commit secondary workspaces**

```bash
git add src/features/data-center src/features/data-center/DataCenterAppPage.jsx react-tests/data-center.test.mjs
git commit -m "feat(data): add data governance workspaces"
```

---

### Task 7: Local development parity

**Files:**
- Modify: `server.mjs`
- Create: `tests/local-data-center-server.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: metadata normalization, existing local sales persistence, and the production API response contract.
- Produces: local `GET/POST /api/data-center` metadata behavior and an explicit 501 sales response that activates the Provider's existing IndexedDB fallback.

- [ ] **Step 1: Write failing local-route source test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("local server exposes data-center metadata and sales query contracts", () => {
  assert.match(server, /LOCAL_DATA_CENTER_STATE_PATH/);
  assert.match(server, /normalizeDataCenterState/);
  assert.match(server, /url\.pathname === "\/api\/data-center"/);
  assert.match(server, /url\.pathname === "\/api\/data-center\/sales"/);
  assert.match(server, /本地测试模式从浏览器销售仓库读取数据/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/local-data-center-server.test.mjs`

Expected: FAIL because local routes are absent.

- [ ] **Step 3: Implement local metadata and sales routes**

Add `LOCAL_DATA_CENTER_STATE_PATH = path.join(LOCAL_DATA_DIR, "data-center-state.json")`. GET returns normalized state or defaults; POST normalizes and atomically writes the JSON file using the existing local JSON helper. `GET /api/data-center/sales` returns status 501 with `{ unavailable: true, message: "本地测试模式从浏览器销售仓库读取数据。" }`; `DataCenterProvider` then uses `fetchSalesForCodes` against browser IndexedDB and constructs the production response shape.

- [ ] **Step 4: Include and run the local test**

Append `tests/local-data-center-server.test.mjs` to `test:api`.

Run: `node --test tests/local-data-center-server.test.mjs tests/local-supply-server.test.mjs`

Expected: both tests PASS.

- [ ] **Step 5: Commit local parity**

```bash
git add server.mjs tests/local-data-center-server.test.mjs package.json
git commit -m "feat(data): add local data center routes"
```

---

### Task 8: Visual system, responsive behavior, and final verification

**Files:**
- Modify: `src/styles.css`
- Modify: `react-tests/data-center.test.mjs`

**Interfaces:**
- Consumes: all Data Center class names from Tasks 5-6 and existing design tokens.
- Produces: desktop, 900 px, and 640 px layouts with reduced-motion behavior and no nested horizontal page overflow.

- [ ] **Step 1: Add failing structural CSS assertions**

```js
test("data center uses dense responsive operational layouts", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const selector of [".data-center-app", ".data-metric-strip", ".data-overview-grid", ".data-filter-bar", ".data-source-grid", ".data-status-badge", ".data-center-loading"]) assert.match(css, new RegExp(selector.replace(".", "\\.")));
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.data-overview-grid/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.data-metric-strip/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.data-center-loading/);
});
```

- [ ] **Step 2: Run and verify CSS assertions fail**

Run: `node --test react-tests/data-center.test.mjs`

Expected: FAIL on `.data-center-app`.

- [ ] **Step 3: Implement Data Center styles**

Use existing tokens only. Required layouts:

- `.data-center-app`: `gap: var(--space-3)`;
- `.data-metric-strip`: six minimum-160 px cards, horizontal overflow only inside the strip;
- `.data-overview-grid`: `minmax(0, 1.65fr) minmax(320px, .85fr)`;
- `.data-filter-bar`: grid controls with a stable Apply action;
- `.data-source-grid`: three columns desktop, two at 900 px, one at 640 px;
- `.data-status-badge`: success/warning/danger/neutral tokens matching existing status badges;
- `.data-center-loading`: three skeleton rows using one pulse animation disabled by reduced-motion;
- tables: numeric right alignment, tabular figures, minimum widths contained by existing `DataTable` scroller;
- 900 px: overview becomes one column and metric strip becomes two columns;
- 640 px: metric strip and filter controls become one column, page actions become full width.

- [ ] **Step 4: Run focused tests and build**

Run: `node --test react-tests/data-center.test.mjs react-tests/supply-chain-ui.test.mjs react-tests/platform-ui.test.mjs`

Expected: all tests PASS.

Run: `npm run build`

Expected: Vite production build completes with exit code 0.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: all React and API tests PASS.

- [ ] **Step 6: Browser acceptance**

Run: `npm run dev`

In the local authenticated preview, verify:

1. Sidebar order is Supply Chain, Product Lifecycle, Data Center, Platform.
2. Every Data Center route updates the selected primary-sidebar item.
3. Overview defaults to first day of the month containing yesterday through yesterday.
4. “其它” never appears in normal metrics or platform rankings.
5. Empty advertising cards show `—` and `巨量数据尚未接入`.
6. Source registration contains no password/Cookie/Token fields.
7. Loading, empty, stale, failed, disabled, and no-permission states are legible.
8. At desktop, 900 px, and 390 px widths, hierarchy, spacing, alignment, scrolling, focus, and controls remain usable.
9. Product Lifecycle and Supply Chain navigation and pages still behave as before.

- [ ] **Step 7: Commit visual completion**

```bash
git add src/styles.css react-tests/data-center.test.mjs
git commit -m "style(data): finish responsive data center UI"
```

---

## Phase 1 Completion Gate

Phase 1 is complete only when:

- all eight Data Center sidebar entries appear after Product Lifecycle;
- business Apps lists Product Lifecycle, Supply Chain, and Data Center;
- authorized users can read the overview and analysis through the Data Center API;
- source and settings edits persist through the dedicated metadata API;
- sales facts remain single-sourced in `product_sales_daily`;
- all formal sales responses declare `create_time`, `Asia/Shanghai`, and the selected date range;
- normal analysis excludes Other while raw facts remain untouched;
- no credential-like field exists in UI state, API payloads, D1, or localStorage;
- `npm test` and `npm run build` pass;
- desktop, 900 px, and mobile browser acceptance is recorded.
