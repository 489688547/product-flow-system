# 数据连接器配置简化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic connector metadata inputs with a platform-specific shop/account name, automatic audit identity, and automatic capture-method inference.

**Architecture:** Keep the existing D1 schema and API routes. Add pure display-label and method-inference rules to the connector domain, enforce inference again at the state API boundary, simplify the React dialog, and retain server-side `createdBy`/`updatedBy` auditing from the authenticated session.

**Tech Stack:** React 19, JavaScript modules, Node test runner, Cloudflare Pages Functions, Cloudflare D1.

## Global Constraints

- The user never enters a generic connection name, company subject, owner, or capture method.
- The visible identity is the real shop/account name stored in the existing `name` column.
- API credentials imply `api`; otherwise browser credentials imply `browser`; otherwise use `export` when supported.
- Existing connectors retain their saved method when credentials are left unchanged.
- Saving configuration never marks a connector healthy; new connectors remain `pending_validation`.
- `createdBy` and `updatedBy` come only from the authenticated server session.
- No D1 migration, new environment variable, provider call, deployment, or production write is part of this work.
- Existing encrypted-secret, OTP, time-basis, timezone, and “exclude other” rules remain unchanged.

---

## File Map

- `src/domain/dataCenterConnectors.js`: platform identity labels, sensitive-field method metadata, capture-method inference, and connector normalization.
- `src/state/dataCenterConnectionsApi.js`: derive the persisted method from the current secret draft before saving connector metadata.
- `src/features/data-center/connections/ConnectorConfigDialog.jsx`: simplified form and read-only automatic-method indicator.
- `src/styles.css`: restrained grouping and method-indicator styles.
- `react-tests/data-center-connectors.test.mjs`: domain behavior tests.
- `react-tests/data-center-connections-api.test.mjs`: state-boundary inference tests.
- `react-tests/data-center-connections-ui.test.mjs`: removed fields and new labels/indicator contract.
- `tests/data-center-connectors-api.test.mjs`: authenticated audit identity and compatibility coverage.
- `docs/features/data-center-app/prd.md`: durable business rules and acceptance criteria.
- `docs/features/data-center-app/design.md`: durable interaction and data-flow rules.
- `docs/features/data-center-app/tasks.md`: completed task and evidence.

---

### Task 1: Domain identity labels and automatic method inference

**Files:**
- Modify: `src/domain/dataCenterConnectors.js`
- Test: `react-tests/data-center-connectors.test.mjs`

**Interfaces:**
- Consumes: existing connector definitions with `methods` and field-level `methods` metadata.
- Produces: `definition.identityLabel: string` and `inferConnectorCaptureMethod(definitionInput, options): "api" | "browser" | "export"`.

- [ ] **Step 1: Write the failing domain tests**

Add tests that require all definitions to provide a platform identity label, require a non-empty real shop/account name, and exercise API/browser/export inference:

```js
import { inferConnectorCaptureMethod } from "../src/domain/dataCenterConnectors.js";

test("connector definitions use platform shop or account names", () => {
  assert.equal(connectorDefinition("douyin-ecommerce").identityLabel, "店铺名称");
  assert.equal(connectorDefinition("oceanengine").identityLabel, "广告账户名称");
  assert.equal(connectorDefinition("kuaimai-erp").identityLabel, "ERP 账号名称");
  assert.throws(() => normalizeConnectorInstance({ connectorId: "douyin-ecommerce", name: "" }), /店铺名称不能为空/);
});

test("capture method is inferred from configured credentials", () => {
  assert.equal(inferConnectorCaptureMethod("oceanengine", { secretPayload: { appSecret: "secret" } }), "api");
  assert.equal(inferConnectorCaptureMethod("oceanengine", { secretPayload: { password: "secret" } }), "browser");
  assert.equal(inferConnectorCaptureMethod("oceanengine", { secretPayload: { appSecret: "api", password: "web" } }), "api");
  assert.equal(inferConnectorCaptureMethod("douyin-ecommerce", { secretPayload: {} }), "export");
  assert.equal(inferConnectorCaptureMethod("douyin-ecommerce", { secretPayload: {}, existingMethod: "browser" }), "browser");
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `node --test react-tests/data-center-connectors.test.mjs`

Expected: FAIL because `identityLabel` and `inferConnectorCaptureMethod` do not exist and empty names currently fall back to the platform name.

- [ ] **Step 3: Add labels and inference to the pure domain**

Add `identityLabel` to every connector definition. Use these values:

```js
"douyin-ecommerce": "店铺名称"
"oceanengine": "广告账户名称"
"kuaishou": "店铺 / 广告账户名称"
"taobao": "店铺名称"
"pinduoduo": "店铺名称"
"xiaohongshu": "店铺 / 乘风账户名称"
"jd-jingmai": "店铺名称"
"kuaimai-erp": "ERP 账号名称"
```

Export this pure helper:

```js
export function inferConnectorCaptureMethod(definitionInput, { secretPayload = {}, existingMethod = "" } = {}) {
  const resolved = typeof definitionInput === "string" ? connectorDefinition(definitionInput) : definitionInput;
  const filled = key => String(secretPayload[key] || "").trim().length > 0;
  const hasMethodValue = method => resolved.fields.some(item => item.methods?.includes(method) && filled(item.key));
  if (hasMethodValue("api")) return "api";
  if (hasMethodValue("browser")) return "browser";
  if (resolved.methods.includes(existingMethod)) return existingMethod;
  if (resolved.methods.includes("export")) return "export";
  return resolved.methods[0];
}
```

In `normalizeConnectorInstance`, require the trimmed `name` using the definition label and keep accepting a server-derived `captureMethod`:

```js
const name = cleanString(input.name, definition.identityLabel, 120);
if (!name) throw inputError(`${definition.identityLabel}不能为空。`);
```

- [ ] **Step 4: Run the domain test and verify GREEN**

Run: `node --test react-tests/data-center-connectors.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the domain task**

```bash
git add src/domain/dataCenterConnectors.js react-tests/data-center-connectors.test.mjs
git commit -m "feat(data-center): infer connector method"
```

---

### Task 2: Enforce method inference at the state boundary

**Files:**
- Modify: `src/state/dataCenterConnectionsApi.js`
- Test: `react-tests/data-center-connections-api.test.mjs`

**Interfaces:**
- Consumes: `inferConnectorCaptureMethod(connectorId, { secretPayload, existingMethod })` from Task 1.
- Produces: `persistConnectorConnection(...)` always sends an inferred `captureMethod` and never sends secret values to the connector API.

- [ ] **Step 1: Write failing state-client tests**

Add focused cases around `persistConnectorConnection`:

```js
test("connector persistence infers API browser and existing methods", async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push({ url, body });
    if (url === "/api/platform/v1/credential-vault") return jsonResponse({ synced: true, entry: { id: "cred-1", version: 1 } });
    return jsonResponse({ synced: true, instance: { ...body.instance, id: "connector-1", version: 1 } });
  };
  await persistConnectorConnection({
    instance: { connectorId: "oceanengine", name: "千川一号", version: 0 },
    secretPayload: { appSecret: "api-secret" },
    vaultEntries: []
  }, fetchImpl);
  assert.equal(bodies.find(item => item.body.instance)?.body.instance.captureMethod, "api");
  assert.equal(JSON.stringify(bodies.find(item => item.body.instance)?.body).includes("api-secret"), false);
});
```

Add a second case with an existing connector, empty `secretPayload`, and `captureMethod: "browser"`; require the saved method to remain `browser`.

```js
test("connector persistence keeps the saved method when credentials are unchanged", async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    return jsonResponse({ synced: true, instance: { ...body.instance, version: 3 } });
  };
  await persistConnectorConnection({
    instance: { id: "connector-1", connectorId: "douyin-ecommerce", name: "抖音官旗", captureMethod: "browser", version: 2 },
    secretPayload: {},
    vaultEntries: []
  }, fetchImpl);
  assert.equal(bodies[0].instance.captureMethod, "browser");
});
```

- [ ] **Step 2: Run the state-client test and verify RED**

Run: `node --test react-tests/data-center-connections-api.test.mjs`

Expected: FAIL because persistence currently forwards the draft method without inference.

- [ ] **Step 3: Derive the method before the first connector write**

Import the domain helper and prepare one metadata-only instance:

```js
const preparedInstance = {
  ...instance,
  captureMethod: inferConnectorCaptureMethod(instance.connectorId, {
    secretPayload: sensitive,
    existingMethod: instance.captureMethod
  })
};
```

Use `preparedInstance` for both connector writes. Continue placing `sensitive` only in credential-vault requests and deleting its keys in `finally`.

- [ ] **Step 4: Run the state-client test and verify GREEN**

Run: `node --test react-tests/data-center-connections-api.test.mjs`

Expected: all tests PASS and no connector request contains credential values.

- [ ] **Step 5: Commit the state-boundary task**

```bash
git add src/state/dataCenterConnectionsApi.js react-tests/data-center-connections-api.test.mjs
git commit -m "feat(data-center): derive connection method"
```

---

### Task 3: Simplify the platform connector dialog

**Files:**
- Modify: `src/features/data-center/connections/ConnectorConfigDialog.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/data-center-connections-ui.test.mjs`

**Interfaces:**
- Consumes: `definition.identityLabel` and `inferConnectorCaptureMethod(...)` from Task 1.
- Produces: a connector draft containing `name`, `accountType`, `consoleUrl`, `datasets`, version metadata, and optional encrypted secret fields; it contains no user-entered `companySubject`, `owner`, or method selection.

- [ ] **Step 1: Write the failing UI contract test**

Require the component to use the platform identity label and automatic indicator while rejecting the four generic fields:

```js
test("connector dialog asks only for real account identity and infers access", () => {
  const dialog = read("src/features/data-center/connections/ConnectorConfigDialog.jsx");
  assert.match(dialog, /definition\.identityLabel/);
  assert.match(dialog, /系统识别/);
  assert.match(dialog, /inferConnectorCaptureMethod/);
  assert.doesNotMatch(dialog, />连接名称</);
  assert.doesNotMatch(dialog, />公司主体</);
  assert.doesNotMatch(dialog, />负责人</);
  assert.doesNotMatch(dialog, />接入方式</);
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --test react-tests/data-center-connections-ui.test.mjs`

Expected: FAIL because the generic inputs and method select still exist.

- [ ] **Step 3: Remove generic draft fields and render platform fields**

Change `initialDraft` to omit `companySubject`, `owner`, and the user-selected method. Render:

```jsx
<label>
  {definition.identityLabel}
  <input
    required
    maxLength={120}
    value={draft.name}
    onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
  />
</label>
```

Show all definition fields instead of filtering them by a selected method. Build groups with exact method membership:

```js
const generalFields = definition.fields.filter(field => !field.methods?.length);
const browserFields = definition.fields.filter(field => field.methods?.includes("browser"));
const apiFields = definition.fields.filter(field => field.methods?.includes("api"));
```

Render `generalFields` in the primary grid. Render non-empty method groups with the same input behavior through one local `renderField(field)` helper:

```jsx
{browserFields.length ? <section className="connector-credential-group">
  <div><strong>网页登录</strong><span>账号信息会加密保存，验证码由人工完成。</span></div>
  <div className="connector-form-grid">{browserFields.map(renderField)}</div>
</section> : null}
{apiFields.length ? <section className="connector-credential-group">
  <div><strong>API 授权</strong><span>填写后系统优先使用 API。</span></div>
  <div className="connector-form-grid">{apiFields.map(renderField)}</div>
</section> : null}
```

Compute the read-only indicator from current secret input and the saved method:

```js
const inferredMethod = inferConnectorCaptureMethod(definition, {
  secretPayload: secretValues,
  existingMethod: instance?.captureMethod || ""
});
```

Render `系统识别：${METHOD_LABELS[inferredMethod]}` as informative text, not a form control.

- [ ] **Step 4: Add focused presentation styles**

Add business-neutral styles for `.connector-method-indicator` and `.connector-credential-group`. Reuse existing borders, radii, spacing, text colors, and responsive grid; do not add brand-colored backgrounds or animation.

- [ ] **Step 5: Run UI and state regressions**

Run: `node --test react-tests/data-center-connections-ui.test.mjs react-tests/data-center-connections-api.test.mjs react-tests/data-center-connectors.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the UI task**

```bash
git add src/features/data-center/connections/ConnectorConfigDialog.jsx src/styles.css react-tests/data-center-connections-ui.test.mjs
git commit -m "feat(data-center): simplify connector form"
```

---

### Task 4: Lock server audit ownership and update durable product rules

**Files:**
- Modify: `tests/data-center-connectors-api.test.mjs`
- Modify: `docs/features/data-center-app/prd.md`
- Modify: `docs/features/data-center-app/design.md`
- Modify: `docs/features/data-center-app/tasks.md`

**Interfaces:**
- Consumes: existing `upsertConnectorRecord(db, input, { actor })` and current session-derived actor in the route.
- Produces: durable evidence that clients cannot supply audit identity and that the simplified form is the product contract.

- [ ] **Step 1: Add server contract assertions**

Extend the existing create/update test to send `createdBy: "伪造人员"` and require `DATA_CONNECTOR_INVALID`. Then assert a normal save returns:

```js
const spoofed = await onRequest({
  request: request("PUT", { expectedVersion: 0, instance: { ...instance, createdBy: "伪造人员" } }),
  env: { PRODUCT_FLOW_DB: createD1Mock() },
  data: { session: operator }
});
assert.equal(spoofed.status, 400);
assert.equal((await spoofed.json()).error.code, "DATA_CONNECTOR_INVALID");

assert.equal(savedPayload.instance.createdBy, operator.name);
assert.equal(savedPayload.instance.updatedBy, operator.name);
```

This test documents existing server behavior; if it passes immediately, no server production change is needed.

- [ ] **Step 2: Run the API test**

Run: `node --test tests/data-center-connectors-api.test.mjs`

Expected: all tests PASS; any failure must be fixed at the route/storage boundary without accepting client audit fields.

- [ ] **Step 3: Update durable PRD and design rules**

In `prd.md`, replace generic connection-name/company/owner/method-selection requirements with the confirmed shop/account identity and automatic inference rules. In `design.md`, document the read-only method indicator, server-derived audit identity, dual API/browser credential groups, and backward compatibility. Do not change platform lifecycle statuses.

- [ ] **Step 4: Record implementation evidence in tasks**

Add one completed checklist item containing the actual focused test commands, browser widths, and commit hashes produced by Tasks 1–3. Do not claim production deployment, provider validation, or production writes.

- [ ] **Step 5: Commit the contract and documentation task**

```bash
git add tests/data-center-connectors-api.test.mjs docs/features/data-center-app/prd.md docs/features/data-center-app/design.md docs/features/data-center-app/tasks.md
git commit -m "docs(data-center): simplify connector rules"
```

---

### Task 5: Verify the complete change

**Files:**
- No planned production-file changes.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a clean branch and a reproducible evidence report.

- [ ] **Step 1: Run focused automated tests**

```bash
node --test react-tests/data-center-connectors.test.mjs react-tests/data-center-connections-api.test.mjs react-tests/data-center-connections-ui.test.mjs tests/data-center-connectors-api.test.mjs
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 2: Run the repository Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: every command exits 0; production JavaScript chunks remain below 500 KB.

- [ ] **Step 3: Verify the local Pages/D1 preview**

Run the built app with the existing read-only Pages Functions preview and inspect `#data-sources` at 1280px and 390px. Verify:

- the four generic inputs are absent;
- the platform identity label is present;
- entering an API credential changes the indicator to API without a select;
- entering a browser credential changes the indicator to webpage login;
- keyboard focus, Esc close, error state, and save-disabled state work;
- no horizontal overflow or console error appears.

Do not submit real credentials or write production D1 during this check.

- [ ] **Step 4: Recheck repository scope**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only task-related files are present.
