# 供应链管理应用实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an embedded supply-chain business App that manages suppliers, synchronizes linked DingTalk purchase/payment approvals, calculates inventory funds, reconciles stocktakes with ERP snapshots, and closes imported quality issues.

**Architecture:** Add a focused supply-chain domain module and provider to the existing React application. Persist supply-chain collections as separate D1 records through a dedicated API, reuse existing product and sales sources by product ID and SKU, and isolate DingTalk approval parsing behind server-side adapter functions.

**Tech Stack:** React 19, Vite 7, Node test runner, Cloudflare Pages Functions, Cloudflare D1, existing `xlsxLite` spreadsheet reader, DingTalk OpenAPI.

## Global Constraints

- The App is embedded in the existing business Apps center and reuses the current login, organization, product, SKU, sales-cost, and shared-data capabilities.
- A purchase approval can have multiple payment approvals; DingTalk's related-approval value is the only source of that relationship.
- Raw inventory funds equal approved actual payments minus consumed sales cost.
- Stocktake reconciliation creates audited adjustments and never overwrites source approvals, sales rows, stocktake rows, or ERP snapshots.
- Quality reviews are imported from `.xlsx` or `.csv` in phase one; direct store-platform review APIs remain out of scope.
- Backend authorization must mirror UI authorization.
- No real DingTalk approval mutation, production deploy, or historical backfill is part of local acceptance.

---

### Task 1: Supply-chain domain model and calculations

**Files:**
- Create: `src/domain/supplyChain.js`
- Test: `react-tests/supply-chain.test.mjs`

**Interfaces:**
- Produces: `createDefaultSupplyChainState()`, `normalizeSupplyChainState(input)`, `reduceSupplyChainState(state, action)`, `buildSupplyChainSummary({ supplyState, products, salesRows })`, `parseInventoryImportRows(rows, context)`, `parseQualityImportRows(rows, context)`.
- State collections: `suppliers`, `productSupplierLinks`, `purchaseApprovals`, `purchaseLines`, `paymentApprovals`, `inventoryBatches`, `inventorySnapshots`, `inventoryAdjustments`, `qualityImportBatches`, `qualityIssues`, `syncRuns`, `settings`.

- [ ] **Step 1: Write failing domain tests**

```js
test("approved payments aggregate one purchase without counting rejected payments", () => {
  const state = normalizeSupplyChainState({
    purchaseApprovals: [{ processInstanceId: "purchase-1", productIds: ["p1"], supplierId: "s1", approvedAmount: 100 }],
    paymentApprovals: [
      { processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 30 },
      { processInstanceId: "pay-2", purchaseProcessInstanceId: "purchase-1", status: "RUNNING", amount: 70 }
    ]
  });
  const summary = buildSupplyChainSummary({ supplyState: state, products: [{ id: "p1", skuCodes: ["6977173969783"] }], salesRows: [] });
  assert.equal(summary.actualPaid, 30);
});

test("inventory funds subtract sales cost and include confirmed adjustment", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState({
      purchaseApprovals: [{ processInstanceId: "purchase-1", productIds: ["p1"], supplierId: "s1" }],
      paymentApprovals: [{ processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 100 }],
      inventoryAdjustments: [{ id: "adjust-1", productId: "p1", adjustmentAmount: -5, status: "confirmed" }]
    }),
    products: [{ id: "p1", skuCodes: ["6977173969783"] }],
    salesRows: [{ code: "6977173969783", cost: 40, qty: 2 }]
  });
  assert.equal(summary.rawInventoryFunds, 60);
  assert.equal(summary.adjustedInventoryFunds, 55);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test react-tests/supply-chain.test.mjs`
Expected: FAIL because `src/domain/supplyChain.js` does not exist.

- [ ] **Step 3: Implement the minimal normalized model, reducer, import validators, and calculations**

```js
export const SUPPLY_COLLECTIONS = ["suppliers", "productSupplierLinks", "purchaseApprovals", "purchaseLines", "paymentApprovals", "inventoryBatches", "inventorySnapshots", "inventoryAdjustments", "qualityImportBatches", "qualityIssues", "syncRuns"];

export function normalizeSupplyChainState(input = {}) {
  const state = { version: "supply-chain-v1", updatedAt: "", ...input };
  SUPPLY_COLLECTIONS.forEach(key => { state[key] = Array.isArray(state[key]) ? state[key].map(item => ({ ...item })) : []; });
  state.settings = { purchaseProcessCode: "", paymentProcessCode: "", supplierCategories: ["包材", "里料", "原料", "加工"], ...(state.settings || {}) };
  return state;
}
```

- [ ] **Step 4: Run the focused domain tests and verify GREEN**

Run: `node --test react-tests/supply-chain.test.mjs`
Expected: all supply-chain domain tests pass.

- [ ] **Step 5: Commit the domain model**

```bash
git add src/domain/supplyChain.js react-tests/supply-chain.test.mjs
git commit -m "feat(supply): add supply chain domain model"
```

---

### Task 2: D1 persistence and authorization API

**Files:**
- Create: `functions/api/supply-chain/_shared/storage.js`
- Create: `functions/api/supply-chain.js`
- Create: `tests/supply-chain-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `ensureSupplyTables(db): Promise<void>` creates `supply_chain_records` and `supply_chain_meta`.
- `readSupplyState(db): Promise<SupplyChainState>` returns normalized collection arrays.
- `writeSupplyState(db, state, actor): Promise<{ updatedAt: string }>` replaces each collection atomically through `db.batch`.
- `onRequest({ request, env, data })` supports authenticated `GET` and authorized `POST` at `/api/supply-chain`.

- [ ] **Step 1: Write failing API tests**

```js
test("supply-chain API rejects unrelated departments", async () => {
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { department: "品牌部", role: "member" } }
  });
  assert.equal(response.status, 403);
});

test("supply-chain API round-trips suppliers as separate records", async () => {
  const db = createD1Mock();
  const state = normalizeSupplyChainState({ suppliers: [{ id: "s1", name: "杭州鲜宠食品" }] });
  const post = await onRequest({ request: new Request("https://flow.example.com/api/supply-chain", { method: "POST", body: JSON.stringify({ state }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: { name: "周总", department: "总经办" } } });
  assert.equal(post.status, 200);
  const get = await onRequest({ request: new Request("https://flow.example.com/api/supply-chain"), env: { PRODUCT_FLOW_DB: db }, data: { session: { name: "周总", department: "总经办" } } });
  assert.equal((await get.json()).state.suppliers[0].name, "杭州鲜宠食品");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/supply-chain-api.test.mjs`
Expected: FAIL because the supply-chain API files do not exist.

- [ ] **Step 3: Implement separate-record persistence and department access checks**

```js
const VIEW_DEPARTMENTS = new Set(["总经办", "供应链", "供应链部", "财务部", "质量管理部", "产品部", "运营部"]);
const EDIT_DEPARTMENTS = new Set(["总经办", "供应链", "供应链部", "财务部", "质量管理部"]);
```

`GET` requires `VIEW_DEPARTMENTS`; `POST` requires `EDIT_DEPARTMENTS` and rejects `readonly`. The D1 record key is `(entity_type, id)` and each collection is replaced through a single `db.batch` call.

- [ ] **Step 4: Add the API test file to `test:api` and run focused tests**

Run: `node --test tests/supply-chain-api.test.mjs`
Expected: all supply-chain API tests pass.

- [ ] **Step 5: Commit persistence**

```bash
git add functions/api/supply-chain/_shared/storage.js functions/api/supply-chain.js tests/supply-chain-api.test.mjs package.json
git commit -m "feat(supply): persist supply chain records"
```

---

### Task 3: DingTalk purchase and payment approval synchronization

**Files:**
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Create: `functions/api/supply-chain/approvals/sync.js`
- Create: `tests/dingtalk-approval-sync.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `listDingApprovalInstanceIds(accessToken, input, fetchImpl)` returns `{ processInstanceIds, nextCursor }`.
- `getDingApprovalInstance(accessToken, processInstanceId, fetchImpl)` returns the raw approval instance.
- `normalizeDingSupplyApproval(instance, mapping)` returns `{ kind, record, lines }` where payment records include `purchaseProcessInstanceId` extracted only from DingTalk's related-approval value.
- `POST /api/supply-chain/approvals/sync` accepts `{ startTime, endTime }`, reads configured process codes, upserts by `processInstanceId`, and records a sync run.

- [ ] **Step 1: Write failing adapter and route tests**

```js
test("payment normalization keeps DingTalk related purchase instance id", () => {
  const normalized = normalizeDingSupplyApproval({
    processInstanceId: "pay-1",
    result: "agree",
    formComponentValues: [
      { id: "amount", value: "30000" },
      { id: "related", value: JSON.stringify([{ processInstanceId: "purchase-1" }]) }
    ]
  }, { kind: "payment", amountFieldId: "amount", relatedPurchaseFieldId: "related" });
  assert.equal(normalized.record.purchaseProcessInstanceId, "purchase-1");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/dingtalk-approval-sync.test.mjs`
Expected: FAIL because approval adapter exports are missing.

- [ ] **Step 3: Implement read-only DingTalk pagination, detail calls, normalization, and idempotent sync**

The adapter must preserve `rawPayload`, map `agree` to `COMPLETED`, and return an unmapped record when a configured product or supplier value cannot resolve. It must never create, approve, reject, or update an approval instance.

- [ ] **Step 4: Run DingTalk approval tests and the existing DingTalk suite**

Run: `node --test tests/dingtalk-approval-sync.test.mjs tests/dingtalk-api.test.mjs tests/dingtalk-sync.test.mjs`
Expected: all selected tests pass.

- [ ] **Step 5: Commit approval sync**

```bash
git add functions/api/dingtalk/_shared/dingtalk.js functions/api/supply-chain/approvals/sync.js tests/dingtalk-approval-sync.test.mjs package.json
git commit -m "feat(supply): sync DingTalk purchase payments"
```

---

### Task 4: Supply-chain provider, App registration, routing, and permissions

**Files:**
- Create: `src/state/supplyChainApi.js`
- Create: `src/state/SupplyChainProvider.jsx`
- Modify: `src/main.jsx`
- Modify: `src/App.jsx`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/domain/permissions.js`
- Modify: `react-tests/platform-ui.test.mjs`
- Modify: `react-tests/react-app.test.mjs`

**Interfaces:**
- `SupplyChainProvider` loads `/api/supply-chain`, keeps local preview cache under `supplyChainState`, and exposes `{ state, loading, error, dispatch, syncApprovals }`.
- The App center registers `{ id: "supply-chain", name: "供应链管理", route: "supply-chain" }`.
- `#supply-chain` opens the embedded App. Authorization derives from the existing session user and supply-chain feature scopes.

- [ ] **Step 1: Add failing shell and permission assertions**

```js
test("business App center exposes the embedded supply chain App", () => {
  const strategy = read("src/domain/strategyExecution.js");
  const app = read("src/App.jsx");
  assert.match(strategy, /供应链管理/);
  assert.match(app, /SupplyChainAppPage/);
  assert.match(app, /"supply-chain"/);
});
```

- [ ] **Step 2: Run UI structure tests and verify RED**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/react-app.test.mjs`
Expected: FAIL on missing supply-chain App registration and route.

- [ ] **Step 3: Implement provider wiring, App registration, route, and normalized permission defaults**

`main.jsx` places `SupplyChainProvider` inside `ProductFlowProvider` so supply-chain calculations can reference current products without duplicating product state.

- [ ] **Step 4: Run the focused UI tests and verify GREEN**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/react-app.test.mjs`
Expected: all selected tests pass.

- [ ] **Step 5: Commit App integration**

```bash
git add src/state/supplyChainApi.js src/state/SupplyChainProvider.jsx src/main.jsx src/App.jsx src/domain/strategyExecution.js src/domain/permissions.js react-tests/platform-ui.test.mjs react-tests/react-app.test.mjs
git commit -m "feat(supply): embed supply chain App"
```

---

### Task 5: Operational UI for suppliers, approvals, products, inventory, and quality

**Files:**
- Create: `src/features/supply-chain/SupplyChainAppPage.jsx`
- Create: `src/features/supply-chain/SupplyChainOverview.jsx`
- Create: `src/features/supply-chain/SupplierWorkspace.jsx`
- Create: `src/features/supply-chain/ApprovalWorkspace.jsx`
- Create: `src/features/supply-chain/ProductSupplyWorkspace.jsx`
- Create: `src/features/supply-chain/InventoryWorkspace.jsx`
- Create: `src/features/supply-chain/QualityWorkspace.jsx`
- Create: `src/features/supply-chain/SupplyChainRecordModal.jsx`
- Test: `react-tests/supply-chain-ui.test.mjs`

**Interfaces:**
- `SupplyChainAppPage({ onNavigate })` owns internal section navigation.
- Workspaces consume `useSupplyChain()` and `useProductFlow()` and dispatch reducer actions.
- Inventory and quality imports use `streamSpreadsheetRows(file, onRow)` and domain import parsers before dispatching an atomic batch action.

- [ ] **Step 1: Write failing UI contract tests**

```js
test("supply chain App exposes all confirmed workspaces", () => {
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  for (const label of ["供应链总览", "供应商管理", "采购与付款", "产品供应链", "库存盘点", "质量管理", "同步记录", "设置"]) assert.match(page, new RegExp(label));
});

test("inventory and quality imports preview before saving", () => {
  assert.match(read("src/features/supply-chain/InventoryWorkspace.jsx"), /确认导入/);
  assert.match(read("src/features/supply-chain/QualityWorkspace.jsx"), /确认导入/);
});
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `node --test react-tests/supply-chain-ui.test.mjs`
Expected: FAIL because supply-chain feature files do not exist.

- [ ] **Step 3: Implement the App shell and focused workspaces**

The overview prioritizes exceptions. Supplier and product workspaces provide create/edit modals. Approval rows show DingTalk status, related payment progress, and unmapped warnings. Inventory and quality imports parse `.xlsx/.csv`, preview counts/errors, and require confirmation before dispatch.

- [ ] **Step 4: Run UI tests and build**

Run: `node --test react-tests/supply-chain-ui.test.mjs && npm run build`
Expected: tests pass and Vite build exits 0.

- [ ] **Step 5: Commit UI**

```bash
git add src/features/supply-chain react-tests/supply-chain-ui.test.mjs
git commit -m "feat(supply): add operational workspaces"
```

---

### Task 6: Visual system, responsive behavior, and full verification

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/design-system.test.mjs`
- Modify: `react-tests/supply-chain-ui.test.mjs`

**Interfaces:**
- `.supply-chain-app`, `.supply-chain-nav`, `.supply-metric-strip`, `.supply-work-grid`, `.supply-alert-list`, `.supply-import-preview` implement the approved embedded workbench.

- [ ] **Step 1: Add failing design assertions**

```js
test("supply chain workbench has stable responsive structure", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.supply-chain-app/);
  assert.match(css, /\.supply-chain-nav/);
  assert.match(css, /@media[\s\S]*\.supply-chain-app/);
});
```

- [ ] **Step 2: Run the design tests and verify RED**

Run: `node --test tests/design-system.test.mjs react-tests/supply-chain-ui.test.mjs`
Expected: FAIL on missing supply-chain styles.

- [ ] **Step 3: Implement approved hierarchy, spacing, tables, status states, and responsive rules**

Use the existing system font, 4 px spacing rhythm, neutral panels, blue primary actions, table overflow, WCAG AA contrast, focus-visible states, and a single-column layout below 900 px.

- [ ] **Step 4: Run complete verification**

Run: `npm test && npm run build`
Expected: all React/API tests pass and Vite build exits 0.

- [ ] **Step 5: Perform browser acceptance at `127.0.0.1:8132`**

Verify App-center entry, every internal workspace, supplier editing, approval sync error state, inventory import preview, quality closure, 1440 px desktop, 1024 px laptop, and 390 px mobile viewport.

- [ ] **Step 6: Commit final polish**

```bash
git add src/styles.css tests/design-system.test.mjs react-tests/supply-chain-ui.test.mjs
git commit -m "style(supply): polish supply chain workbench"
```
