# Unified Data Access Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate data-source and platform-connection navigation with one boss-friendly data access catalog organized as 电商平台、ERP、公司数据 while preserving all current security, API, and storage boundaries.

**Architecture:** `DataConnectionsWorkspace` becomes the single feature composition root. A pure domain catalog defines category membership; a state hook owns platform-connection orchestration; feature-local cards and tabs present connector instances, company platform connections, and vault item types without merging their server contracts. Kuaimai is one ERP catalog item whose detail composes the company connection form and sync-instance management.

**Tech Stack:** React 18, Vite, JavaScript ES modules, lucide-react, Node test runner, Cloudflare Pages Functions and D1 APIs (unchanged).

## Global Constraints

- The data center sidebar must show only “数据接入”; the default category is “电商平台”.
- The exact category order is “电商平台 / ERP / 公司数据”.
- DingTalk belongs to “公司数据”; Kuaimai appears exactly once under “ERP”.
- Platform credentials and connector/vault credentials remain separate persisted contracts and are never copied in the browser.
- Existing server authorization, read-only validation, version conflict, disable, audit, and no-secret-echo behavior must remain unchanged.
- Aliyun and NAS capabilities without a real adapter must remain “准备接入”; no fake save flow is allowed.
- No new environment variable, Cloudflare binding, D1 table, migration, or external provider write is part of this feature.
- Use local platform artwork only; cards must not load remote tracking assets.
- Breakpoints are three columns at `>=1180px`, two columns at `641–1179px`, and one column at `<=640px`.
- Complete `npm run lint`, governance, integration, environment-capability, test, and build gates before completion.

---

## File Map

**Create**

- `src/domain/dataAccessCatalog.js`: category constants and source-to-category mapping only.
- `src/state/usePlatformConnections.js`: platform connection loading, refresh, save, disable, and immutable list replacement.
- `src/features/data-center/connections/DataAccessTabs.jsx`: accessible three-category tab navigation.
- `src/features/data-center/connections/DataAccessCard.jsx`: business-specific shared catalog card shell.
- `src/features/data-center/connections/ErpAccessWorkspace.jsx`: one-card Kuaimai catalog and combined connection/sync detail.
- `src/features/data-center/connections/CompanyDataWorkspace.jsx`: DingTalk, Aliyun, and vault-type catalog/detail composition.
- `react-tests/data-access-hub.test.mjs`: navigation, taxonomy, composition, compatibility, and durable-document tests.

**Modify**

- `src/App.jsx`: remove the visible platform connection navigation item and resolve legacy links.
- `src/features/data-center/DataCenterAppPage.jsx`: pass the requested category and render only the unified source workspace.
- `src/features/data-center/DataGovernanceWorkspaces.jsx`: pass `initialCategory` through to the unified workspace.
- `src/features/data-center/connections/DataConnectionsWorkspace.jsx`: own the category and compose all three workspaces.
- `src/features/data-center/connections/ConnectorCatalog.jsx`: accept filtered definitions and shared card rendering.
- `src/features/data-center/connections/InternalVaultWorkspace.jsx`: accept a fixed visible type and return callback.
- `src/features/data-center/PlatformConnectionsWorkspace.jsx`: consume controlled state/actions and support a filtered detail-only mode.
- `src/features/handbook/EnvironmentReadinessPanel.jsx`: link blockers to `#/data-sources/company` and say “前往数据接入”.
- `src/styles.css`: category tabs, three-column catalog, card, focus, and responsive rules.
- `src/features/data-center/platform-connections.css`: embedded platform detail rules only; remove obsolete standalone catalog rules after consumers move.
- `react-tests/data-center-connections-ui.test.mjs`: replace old two-tab assertions with the three-category contract.
- `react-tests/platform-connections.test.mjs`: assert embedded/controlled platform behavior and legacy route compatibility.
- `PRODUCT.md`, `DESIGN.md`, `docs/features/data-center-app/{prd,design}.md`, `docs/features/platform-connections/{prd,design}.md`, `docs/platform/integrations.md`: durable rule writeback.

---

### Task 1: Lock the taxonomy and route contract with failing tests

**Files:**
- Create: `react-tests/data-access-hub.test.mjs`
- Create: `src/domain/dataAccessCatalog.js`
- Modify: `react-tests/data-center-connections-ui.test.mjs`

**Interfaces:**
- Produces: `DATA_ACCESS_CATEGORIES: ReadonlyArray<{id: "ecommerce"|"erp"|"company", label: string}>`
- Produces: `dataAccessCategoryFor(sourceKind: "connector"|"platform"|"vault", sourceId: string): string`
- Produces: `dataAccessSourceIds(categoryId: string, sourceKind: string): string[]`

- [ ] **Step 1: Write the failing taxonomy and composition test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  DATA_ACCESS_CATEGORIES,
  dataAccessCategoryFor,
  dataAccessSourceIds
} from "../src/domain/dataAccessCatalog.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("data access has the approved categories and stable membership", () => {
  assert.deepEqual(DATA_ACCESS_CATEGORIES.map(item => item.label), ["电商平台", "ERP", "公司数据"]);
  assert.equal(dataAccessCategoryFor("connector", "douyin-ecommerce"), "ecommerce");
  assert.equal(dataAccessCategoryFor("connector", "kuaimai-erp"), "erp");
  assert.equal(dataAccessCategoryFor("platform", "kuaimai"), "erp");
  assert.equal(dataAccessCategoryFor("platform", "dingtalk"), "company");
  assert.equal(dataAccessCategoryFor("platform", "aliyun"), "company");
  assert.equal(dataAccessCategoryFor("vault", "nas"), "company");
  assert.deepEqual(dataAccessSourceIds("ecommerce", "connector"), [
    "douyin-ecommerce", "oceanengine", "kuaishou", "taobao",
    "pinduoduo", "xiaohongshu", "jd-jingmai"
  ]);
});

test("the visible navigation has one data access entry and no platform connection entry", () => {
  const app = read("src/App.jsx");
  assert.match(app, /\["data-sources", "数据接入"/);
  assert.doesNotMatch(app, /\["data-connections", "平台连接"/);
  assert.match(app, /data-connections[\s\S]*data-sources[\s\S]*company/);
});

test("the workspace exposes the three approved categories and no old tabs", () => {
  const workspace = read("src/features/data-center/connections/DataConnectionsWorkspace.jsx");
  assert.match(workspace, /DataAccessTabs/);
  assert.match(workspace, /ErpAccessWorkspace/);
  assert.match(workspace, /CompanyDataWorkspace/);
  assert.doesNotMatch(workspace, /经营数据连接器|内部系统保险箱/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the catalog does not exist**

Run: `node --test react-tests/data-access-hub.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/dataAccessCatalog.js`.

- [ ] **Step 3: Implement the pure category catalog**

```js
const categories = [
  { id: "ecommerce", label: "电商平台" },
  { id: "erp", label: "ERP" },
  { id: "company", label: "公司数据" }
];

const membership = {
  connector: {
    "douyin-ecommerce": "ecommerce",
    oceanengine: "ecommerce",
    kuaishou: "ecommerce",
    taobao: "ecommerce",
    pinduoduo: "ecommerce",
    xiaohongshu: "ecommerce",
    "jd-jingmai": "ecommerce",
    "kuaimai-erp": "erp"
  },
  platform: { kuaimai: "erp", dingtalk: "company", aliyun: "company" },
  vault: { nas: "company", email: "company", finance: "company", "government-saas": "company", custom: "company" }
};

export const DATA_ACCESS_CATEGORIES = Object.freeze(categories.map(item => Object.freeze(item)));

export function dataAccessCategoryFor(sourceKind, sourceId) {
  return membership[sourceKind]?.[sourceId] || "";
}

export function dataAccessSourceIds(categoryId, sourceKind) {
  return Object.entries(membership[sourceKind] || {})
    .filter(([, category]) => category === categoryId)
    .map(([sourceId]) => sourceId);
}
```

- [ ] **Step 4: Run the taxonomy test and confirm only UI/navigation assertions remain red**

Run: `node --test react-tests/data-access-hub.test.mjs`

Expected: taxonomy test PASS; navigation/workspace tests FAIL.

- [ ] **Step 5: Commit the domain contract and red UI test**

```bash
git add src/domain/dataAccessCatalog.js react-tests/data-access-hub.test.mjs react-tests/data-center-connections-ui.test.mjs
git commit -m "test: define unified data access taxonomy"
```

---

### Task 2: Unify navigation and preserve old links

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `src/features/handbook/EnvironmentReadinessPanel.jsx`
- Test: `react-tests/data-access-hub.test.mjs`
- Test: `react-tests/platform-connections.test.mjs`

**Interfaces:**
- Consumes: category IDs from Task 1.
- Produces: `DataCenterAppPage({ section, dataAccessCategory })`.
- Produces: `DataSourcesWorkspace({ canEdit, canManage, initialCategory })`.
- Legacy route: `#/data-connections` resolves to screen `data-sources`, detail `company`.

- [ ] **Step 1: Add a failing route and blocker-link assertion**

```js
test("legacy and readiness links open company data inside data access", () => {
  const app = read("src/App.jsx");
  const readiness = read("src/features/handbook/EnvironmentReadinessPanel.jsx");
  assert.match(app, /route\.screen === "data-connections"/);
  assert.match(app, /screen: "data-sources"/);
  assert.match(app, /detail: "company"/);
  assert.match(readiness, /#\/data-sources\/company/);
  assert.match(readiness, /前往数据接入/);
  assert.doesNotMatch(readiness, /前往平台连接/);
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run: `node --test react-tests/data-access-hub.test.mjs`

Expected: FAIL on the legacy route and readiness href assertions.

- [ ] **Step 3: Remove the visible navigation item and normalize the legacy route**

Use this route normalization inside `routeFromHash`:

```js
function routeFromHash() {
  const route = parseAppHash(window.location.hash);
  if (route.screen === "data-connections") {
    return { screen: "data-sources", detail: "company" };
  }
  const screen = resolveScreen(route.screen);
  return {
    screen: VALID_SCREENS.has(screen) ? screen : "home",
    detail: route.detail
  };
}
```

Remove the `data-connections` tuple from `DATA_CENTER_NAV` and remove the unused `KeyRound` import only if no other screen uses it.

- [ ] **Step 4: Pass the route detail as the initial category**

```jsx
const dataSection = DATA_CENTER_SCREEN_TO_SECTION.get(activeScreen);
{dataSection ? (
  <DataCenterAppPage
    section={dataSection}
    dataAccessCategory={dataSection === "sources" ? routeDetail : ""}
  />
) : null}
```

In `DataCenterAppPage` and `DataGovernanceWorkspaces`:

```jsx
export function DataCenterAppPage({ section = "overview", dataAccessCategory = "" }) {
  const content = {
    sources: <DataSourcesWorkspace canEdit={canEdit} canManage={canManage} initialCategory={dataAccessCategory} />
  };
  return content[section];
}

export function DataSourcesWorkspace({ canEdit, canManage, initialCategory }) {
  return <DataConnectionsWorkspace canEdit={canEdit} canManage={canManage} initialCategory={initialCategory} />;
}
```

- [ ] **Step 5: Replace the environment blocker link**

```jsx
<a className="btn compact" href="#/data-sources/company">前往数据接入</a>
```

- [ ] **Step 6: Run route, app, and platform tests**

Run: `node --test react-tests/data-access-hub.test.mjs react-tests/data-center-app.test.mjs react-tests/platform-connections.test.mjs`

Expected: route assertions PASS; remaining workspace/category assertions may still FAIL until Task 4.

- [ ] **Step 7: Commit navigation compatibility**

```bash
git add src/App.jsx src/features/data-center/DataCenterAppPage.jsx src/features/data-center/DataGovernanceWorkspaces.jsx src/features/handbook/EnvironmentReadinessPanel.jsx react-tests/data-access-hub.test.mjs react-tests/platform-connections.test.mjs
git commit -m "feat: route platform connections into data access"
```

---

### Task 3: Add controlled platform state and feature-local catalog primitives

**Files:**
- Create: `src/state/usePlatformConnections.js`
- Create: `src/features/data-center/connections/DataAccessTabs.jsx`
- Create: `src/features/data-center/connections/DataAccessCard.jsx`
- Modify: `src/features/data-center/PlatformConnectionsWorkspace.jsx`
- Test: `react-tests/platform-connections.test.mjs`
- Test: `react-tests/data-access-hub.test.mjs`

**Interfaces:**
- Produces: `usePlatformConnections(): {connections, loading, error, refresh, save, disable}`.
- Produces: `DataAccessTabs({ value, onChange })`.
- Produces: `DataAccessCard({ mark, title, description, status, statusTone, meta, disabled, disabledReason, onOpen, actionLabel, children })`.
- Produces: `PlatformConnectionsWorkspace({ canManage, platformIds, initialPlatformId, embedded, controller, onBack })`.

- [ ] **Step 1: Add failing structural tests for controlled state, tabs, and card semantics**

```js
test("platform orchestration lives in state and the catalog primitives are accessible", () => {
  const hook = read("src/state/usePlatformConnections.js");
  const tabs = read("src/features/data-center/connections/DataAccessTabs.jsx");
  const card = read("src/features/data-center/connections/DataAccessCard.jsx");
  assert.match(hook, /loadPlatformConnections/);
  assert.match(hook, /savePlatformConnection/);
  assert.match(hook, /disablePlatformConnection/);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-selected/);
  assert.match(tabs, /ArrowRight|ArrowLeft/);
  assert.match(card, /article/);
  assert.match(card, /disabledReason/);
  assert.match(card, /aria-label/);
});
```

- [ ] **Step 2: Run the tests and verify missing modules fail**

Run: `node --test react-tests/data-access-hub.test.mjs react-tests/platform-connections.test.mjs`

Expected: FAIL because the hook, tab, and card files do not exist.

- [ ] **Step 3: Extract platform orchestration into a state hook**

```js
import { useCallback, useEffect, useState } from "react";
import {
  disablePlatformConnection,
  loadPlatformConnections,
  savePlatformConnection
} from "./platformConnectionsApi.js";

export function usePlatformConnections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const replace = useCallback(next => {
    setConnections(current => [...current.filter(item => item.platformId !== next.platformId), next]);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadPlatformConnections();
      setConnections(result.connections || result || []);
      return result;
    } catch (nextError) {
      setError(nextError?.message || "平台连接暂时无法读取。");
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const save = useCallback(async input => replace(await savePlatformConnection(input)), [replace]);
  const disable = useCallback(async input => replace(await disablePlatformConnection(input)), [replace]);

  return { connections, loading, error, refresh, save, disable };
}
```

- [ ] **Step 4: Implement keyboard-safe tabs**

```jsx
import { useRef } from "react";
import { DATA_ACCESS_CATEGORIES } from "../../../domain/dataAccessCatalog.js";

export function DataAccessTabs({ value, onChange }) {
  const refs = useRef(new Map());
  const move = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + offset + DATA_ACCESS_CATEGORIES.length) % DATA_ACCESS_CATEGORIES.length;
    const category = DATA_ACCESS_CATEGORIES[next];
    onChange(category.id);
    refs.current.get(category.id)?.focus();
  };
  return (
    <div className="data-access-tabs" role="tablist" aria-label="数据接入分类">
      {DATA_ACCESS_CATEGORIES.map((category, index) => (
        <button
          key={category.id}
          ref={node => node && refs.current.set(category.id, node)}
          type="button"
          role="tab"
          aria-selected={value === category.id}
          tabIndex={value === category.id ? 0 : -1}
          onKeyDown={event => move(event, index)}
          onClick={() => onChange(category.id)}
        >{category.label}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implement the feature-local card shell**

```jsx
export function DataAccessCard({
  mark, title, description, status, statusTone = "neutral", meta = [],
  disabled = false, disabledReason = "", onOpen, actionLabel = "查看详情", children
}) {
  return (
    <article className="data-access-card">
      <header><span className="data-access-mark" aria-hidden="true">{mark}</span><span><strong>{title}</strong><small>{description}</small></span><em className={`status-badge ${statusTone}`}>{status}</em></header>
      <div className="data-access-card-meta">{meta.map(item => <span key={item}>{item}</span>)}</div>
      {children}
      <button type="button" disabled={disabled} title={disabled ? disabledReason : undefined} aria-label={`${actionLabel}${title}`} onClick={onOpen}>{disabled ? disabledReason : actionLabel}</button>
    </article>
  );
}
```

- [ ] **Step 6: Make the platform workspace controlled and filterable**

Remove direct API imports from `PlatformConnectionsWorkspace.jsx`. Filter definitions and use the passed controller:

```jsx
export function PlatformConnectionsWorkspace({
  canManage = false,
  platformIds = PLATFORM_CONNECTION_DEFINITIONS.map(item => item.id),
  initialPlatformId = "",
  embedded = false,
  controller,
  onBack
}) {
  const [selectedPlatform, setSelectedPlatform] = useState(initialPlatformId);
  const definitions = PLATFORM_CONNECTION_DEFINITIONS.filter(item => platformIds.includes(item.id));
  const { connections, loading, error, refresh, save, disable } = controller;
  if (loading) return <LoadingState />;
  if (error) return <PlatformConnectionsError message={error} onRetry={refresh} />;
  const connection = connections.find(item => item.platformId === selectedPlatform);
  const definition = definitions.find(item => item.id === selectedPlatform);
  if (definition) return (
    <PlatformConnectionForm
      definition={definition}
      connection={connection}
      canManage={canManage}
      onBack={() => embedded ? onBack?.() : setSelectedPlatform("")}
      onConflict={refresh}
      onSave={save}
      onDisable={disable}
    />
  );
  return <PlatformConnectionList definitions={definitions} connections={connections} onSelect={setSelectedPlatform} buttonRefs={platformButtonRefs} />;
}
```

Change `PlatformConnectionForm` to call its `onSave` and `onDisable` props rather than API imports, preserving the same request payload and error handling.

- [ ] **Step 7: Run focused platform and data-access tests**

Run: `node --test react-tests/platform-connections.test.mjs react-tests/data-access-hub.test.mjs`

Expected: hook/tab/card/control tests PASS; category composition tests remain red.

- [ ] **Step 8: Commit state and primitives**

```bash
git add src/state/usePlatformConnections.js src/features/data-center/connections/DataAccessTabs.jsx src/features/data-center/connections/DataAccessCard.jsx src/features/data-center/PlatformConnectionsWorkspace.jsx react-tests/platform-connections.test.mjs react-tests/data-access-hub.test.mjs
git commit -m "refactor: share platform connection orchestration"
```

---

### Task 4: Compose ecommerce, ERP, and company data without duplicate cards

**Files:**
- Create: `src/features/data-center/connections/ErpAccessWorkspace.jsx`
- Create: `src/features/data-center/connections/CompanyDataWorkspace.jsx`
- Modify: `src/features/data-center/connections/DataConnectionsWorkspace.jsx`
- Modify: `src/features/data-center/connections/ConnectorCatalog.jsx`
- Modify: `src/features/data-center/connections/InternalVaultWorkspace.jsx`
- Test: `react-tests/data-access-hub.test.mjs`
- Test: `react-tests/data-center-connections-ui.test.mjs`

**Interfaces:**
- Consumes: Task 1 taxonomy, Task 3 card/tab/hook.
- Produces: `ConnectorCatalog({ definitions, instances, canEdit, onAdd, onManage, cardComponent })`.
- Produces: `InternalVaultWorkspace({ items, vaultEntries, canManage, onSave, onReveal, initialType, visibleTypes, onBack })`.
- Produces: `ErpAccessWorkspace({ connectorInstances, platformController, canEdit, canManage, onAdd, onManage })`.
- Produces: `CompanyDataWorkspace({ vaultItems, vaultEntries, platformController, canManage, onSaveVault, onReveal })`.

- [ ] **Step 1: Add failing assertions for one Kuaimai card and approved company membership**

```js
test("Kuaimai is one ERP card and company data owns DingTalk Aliyun and NAS", () => {
  const connectorCatalog = read("src/features/data-center/connections/ConnectorCatalog.jsx");
  const erp = read("src/features/data-center/connections/ErpAccessWorkspace.jsx");
  const company = read("src/features/data-center/connections/CompanyDataWorkspace.jsx");
  assert.match(connectorCatalog, /definitions = DATA_CONNECTOR_DEFINITIONS/);
  assert.match(erp, /kuaimai-erp/);
  assert.match(erp, /platformIds=\{\["kuaimai"\]\}/);
  assert.match(erp, /同步设置/);
  assert.match(company, /dingtalk/);
  assert.match(company, /aliyun/);
  assert.match(company, /nas/);
  assert.doesNotMatch(company, /KUAIMAI_APP_KEY|DINGTALK_APP_SECRET/);
});
```

- [ ] **Step 2: Run the focused UI tests and verify missing components fail**

Run: `node --test react-tests/data-access-hub.test.mjs react-tests/data-center-connections-ui.test.mjs`

Expected: FAIL because ERP and company workspace files do not exist.

- [ ] **Step 3: Make the connector catalog accept filtered definitions**

```jsx
export function ConnectorCatalog({
  definitions = DATA_CONNECTOR_DEFINITIONS,
  instances = [], canEdit = false, onAdd, onManage
}) {
  return (
    <div className="data-access-grid">
      {definitions.map(definition => {
        const configured = instances.filter(item => item.connectorId === definition.id);
        const status = summaryStatus(configured);
        return (
          <article className={`data-access-card status-${status}`} key={definition.id}>
            <div className="connector-card-head">
              <img src={LOGOS[definition.logo]} alt="" aria-hidden="true" />
              <div><strong>{definition.name}</strong><span>{definition.description}</span></div>
              <em>{STATUS_LABELS[status]}</em>
            </div>
            <div className="connector-methods" aria-label={`${definition.name}支持的接入方式`}>
              {definition.methods.map(method => <span key={method}>{METHOD_LABELS[method]}</span>)}
            </div>
            <div className="connector-instance-list">
              {configured.slice(0, 3).map(instance => (
                <button type="button" key={instance.id} onClick={() => onManage(definition, instance)}>
                  <span><b>{instance.name}</b><small>{STATUS_LABELS[instance.status] || instance.status}</small></span>
                  <Settings2 size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="connector-add-action" type="button" disabled={!canEdit} onClick={() => onAdd(definition)}>
              <Plus size={15} aria-hidden="true" />添加连接
            </button>
          </article>
        );
      })}
    </div>
  );
}
```

Keep all current status priority and local logo behavior. Do not filter the global definition array inside `ConnectorCatalog`; the parent owns category membership.

- [ ] **Step 4: Make the vault workspace open one approved type**

```jsx
export function InternalVaultWorkspace({
  items = [], vaultEntries = [], canManage = false, onSave, onReveal,
  initialType = "nas", visibleTypes = INTERNAL_VAULT_TYPES.map(item => item.id), onBack
}) {
  const allowedTypes = INTERNAL_VAULT_TYPES.filter(type => visibleTypes.includes(type.id));
  const [selectedType, setSelectedType] = useState(
    allowedTypes.some(type => type.id === initialType) ? initialType : allowedTypes[0]?.id || "nas"
  );
  const typeNavigation = allowedTypes.length > 1 ? (
    <div className="internal-vault-types" role="tablist" aria-label="公司数据类型">
      {allowedTypes.map(type => (
        <button key={type.id} type="button" role="tab" aria-selected={selectedType === type.id} onClick={() => setSelectedType(type.id)}>
          <Server size={17} aria-hidden="true" />
          <span>{VAULT_TYPE_LABELS[type.id]}<small>{type.description}</small></span>
        </button>
      ))}
    </div>
  ) : null;
  const backAction = onBack ? <button type="button" className="platform-connection-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />返回公司数据</button> : null;
}
```

- [ ] **Step 5: Implement the single-card ERP catalog and detail**

`ErpAccessWorkspace` must render one `DataAccessCard` in catalog state. On open, render one Kuaimai platform connection detail followed by sync instances, without rendering a second top-level Kuaimai card:

```jsx
const KUAIMAI_CONNECTOR = DATA_CONNECTOR_DEFINITIONS.find(item => item.id === "kuaimai-erp");

export function ErpAccessWorkspace({ connectorInstances, platformController, canEdit, canManage, onAdd, onManage }) {
  const [detail, setDetail] = useState(false);
  const instances = connectorInstances.filter(item => item.connectorId === "kuaimai-erp");
  const connection = platformController.connections.find(item => item.platformId === "kuaimai");
  if (!detail) return (
    <div className="data-access-grid">
      <DataAccessCard
        mark="快"
        title="快麦 ERP"
        description="订单、商品、库存与销售数据"
        status={connection?.status === "connected" ? "已接通" : "需配置"}
        statusTone={connection?.status === "connected" ? "success" : "warning"}
        meta={[`${instances.length} 个同步连接`, connection?.lastValidatedAt ? "平台连接已验证" : "平台连接未验证"]}
        onOpen={() => setDetail(true)}
        actionLabel="管理"
      />
    </div>
  );
  return (
    <div className="data-access-detail">
      <PlatformConnectionsWorkspace canManage={canManage} platformIds={["kuaimai"]} initialPlatformId="kuaimai" embedded controller={platformController} onBack={() => setDetail(false)} />
      <section className="data-access-sync-section">
        <header><div><h3>数据同步</h3><p>分别管理订单、商品、库存和销售同步。</p></div><button type="button" disabled={!canEdit} onClick={() => onAdd(KUAIMAI_CONNECTOR)}>添加同步</button></header>
        {instances.length ? (
          <div className="data-access-instance-list">
            {instances.map(instance => (
              <button type="button" key={instance.id} onClick={() => onManage(KUAIMAI_CONNECTOR, instance)}>
                <span><strong>{instance.name}</strong><small>{instance.status || "pending_validation"}</small></span>
                <span>管理同步</span>
              </button>
            ))}
          </div>
        ) : <div className="empty-state compact-empty">还没有快麦同步连接。</div>}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Implement the company data catalog and fixed-type detail**

`CompanyDataWorkspace` renders DingTalk, Aliyun, and the five vault types in one grid. Platform selection uses the controlled platform detail; vault selection uses `InternalVaultWorkspace` with one visible type.

```jsx
const COMPANY_PLATFORM_IDS = ["dingtalk", "aliyun"];

export function CompanyDataWorkspace({
  vaultItems, vaultEntries, platformController, canManage, onSaveVault, onReveal
}) {
  const [selection, setSelection] = useState(null);
  if (selection?.kind === "platform") return (
    <PlatformConnectionsWorkspace canManage={canManage} platformIds={[selection.id]} initialPlatformId={selection.id} embedded controller={platformController} onBack={() => setSelection(null)} />
  );
  if (selection?.kind === "vault") return (
    <InternalVaultWorkspace items={vaultItems} vaultEntries={vaultEntries} canManage={canManage} onSave={onSaveVault} onReveal={onReveal} initialType={selection.id} visibleTypes={[selection.id]} onBack={() => setSelection(null)} />
  );
  return (
    <div className="data-access-grid">
      {PLATFORM_CONNECTION_DEFINITIONS.filter(item => COMPANY_PLATFORM_IDS.includes(item.id)).map(definition => {
        const connection = platformController.connections.find(item => item.platformId === definition.id);
        const unavailable = !definition.available;
        return (
          <DataAccessCard
            key={definition.id}
            mark={definition.mark}
            title={definition.name}
            description={definition.description}
            status={unavailable ? "准备接入" : connection?.status === "connected" ? "已接通" : "尚未连接"}
            statusTone={connection?.status === "connected" ? "success" : "neutral"}
            disabled={unavailable}
            disabledReason={unavailable ? "准备接入" : ""}
            onOpen={() => setSelection({ kind: "platform", id: definition.id })}
            actionLabel="管理"
          />
        );
      })}
      {INTERNAL_VAULT_TYPES.map(type => (
        <DataAccessCard
          key={type.id}
          mark={type.id === "nas" ? "盘" : "企"}
          title={type.name}
          description={type.description}
          status={`${vaultItems.filter(item => item.itemType === type.id).length} 个条目`}
          onOpen={() => setSelection({ kind: "vault", id: type.id })}
          actionLabel="查看详情"
        />
      ))}
    </div>
  );
}
```

Aliyun’s card passes `disabled={true}` and `disabledReason="准备接入"`; it must not open a form. NAS and the other vault types show the count of matching non-sensitive items.

- [ ] **Step 7: Replace the old two-tab workspace with the approved three-category composition**

```jsx
export function DataConnectionsWorkspace({ canEdit = false, canManage = false, initialCategory = "" }) {
  const {
    connections,
    vaultItems,
    vaultEntries,
    connectionsLoading,
    connectionsError,
    refreshConnections,
    saveConnection,
    saveVaultItem,
    revealConnectionCredential
  } = useDataCenter();
  const [category, setCategory] = useState(
    DATA_ACCESS_CATEGORIES.some(item => item.id === initialCategory) ? initialCategory : "ecommerce"
  );
  const [selection, setSelection] = useState(null);
  const platformController = usePlatformConnections();
  const ecommerceDefinitions = DATA_CONNECTOR_DEFINITIONS.filter(
    item => dataAccessCategoryFor("connector", item.id) === "ecommerce"
  );
  return (
    <div className="data-connections-workspace">
      <section className="connection-summary">
        <div><Database size={21} aria-hidden="true" /><span><strong>数据接入</strong><small>统一管理外部平台、ERP 与公司数据。</small></span></div>
        <div><LockKeyhole size={17} aria-hidden="true" /><span>敏感信息加密保存</span><Button onClick={() => Promise.allSettled([refreshConnections(), platformController.refresh()])}><RefreshCw size={15} aria-hidden="true" />刷新</Button></div>
      </section>
      <DataAccessTabs value={category} onChange={setCategory} />
      {connectionsError ? <div className="connector-form-error" role="alert"><span>{connectionsError}</span><button type="button" onClick={refreshConnections}>重试</button></div> : null}
      {connectionsLoading ? <div className="connection-loading" aria-label="正在加载数据接入"><span /><span /><span /></div> : null}
      {!connectionsLoading && category === "ecommerce" ? <ConnectorCatalog definitions={ecommerceDefinitions} instances={connections} canEdit={canEdit} onAdd={definition => setSelection({ definition, instance: null })} onManage={(definition, instance) => setSelection({ definition, instance })} /> : null}
      {!connectionsLoading && category === "erp" ? <ErpAccessWorkspace connectorInstances={connections} platformController={platformController} canEdit={canEdit} canManage={canManage} onAdd={definition => setSelection({ definition, instance: null })} onManage={(definition, instance) => setSelection({ definition, instance })} /> : null}
      {!connectionsLoading && category === "company" ? <CompanyDataWorkspace vaultItems={vaultItems} vaultEntries={vaultEntries} platformController={platformController} canManage={canManage} onSaveVault={saveVaultItem} onReveal={revealConnectionCredential} /> : null}
      {selection ? <ConnectorConfigDialog definition={selection.definition} instance={selection.instance} credentialMetadata={selection.instance?.credentialEntryId ? vaultEntries.find(entry => entry.id === selection.instance.credentialEntryId) : null} onSave={saveConnection} onClose={() => setSelection(null)} /> : null}
    </div>
  );
}
```

The refresh button calls both `refreshConnections()` and `platformController.refresh()` with `Promise.allSettled`, so one failed source does not erase the other source’s visible state.

- [ ] **Step 8: Run all connector and platform tests**

Run: `node --test react-tests/data-access-hub.test.mjs react-tests/data-center-connections-ui.test.mjs react-tests/platform-connections.test.mjs react-tests/data-center-connectors.test.mjs`

Expected: PASS with Kuaimai appearing once in the catalog composition and DingTalk mapped to company data.

- [ ] **Step 9: Commit the unified composition**

```bash
git add src/features/data-center/connections src/features/data-center/PlatformConnectionsWorkspace.jsx react-tests/data-access-hub.test.mjs react-tests/data-center-connections-ui.test.mjs
git commit -m "feat: unify data access catalogs"
```

---

### Task 5: Apply the approved marketplace-inspired visual system and interaction states

**Files:**
- Modify: `src/styles.css`
- Modify: `src/features/data-center/platform-connections.css`
- Test: `react-tests/data-access-hub.test.mjs`
- Test: `react-tests/data-center-connections-ui.test.mjs`

**Interfaces:**
- Consumes: `.data-access-tabs`, `.data-access-grid`, `.data-access-card`, `.data-access-detail`, `.data-access-sync-section`.
- Produces: stable 3/2/1-column layout, keyboard focus, reduced motion, disabled reasons, and WebView-safe detail layout.

- [ ] **Step 1: Add failing structural style assertions**

```js
test("data access catalog uses the approved responsive grid and visible focus", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.data-access-grid[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.data-access-tabs button:focus-visible/);
  assert.match(css, /@media \(max-width: 1179px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.data-access-grid[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
```

- [ ] **Step 2: Run the UI tests and verify style assertions fail**

Run: `node --test react-tests/data-access-hub.test.mjs react-tests/data-center-connections-ui.test.mjs`

Expected: FAIL on missing `.data-access-*` selectors.

- [ ] **Step 3: Add restrained catalog and tab styles**

```css
.data-access-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 2px; }
.data-access-tabs button { min-height: 38px; padding: 0 16px; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); font: inherit; font-weight: 700; white-space: nowrap; }
.data-access-tabs button[aria-selected="true"] { background: var(--accent-soft); color: var(--accent); }
.data-access-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.data-access-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.data-access-card { min-width: 0; min-height: 220px; padding: var(--space-4); display: grid; grid-template-rows: auto auto 1fr auto; gap: var(--space-3); border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.data-access-card header { min-width: 0; display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: start; gap: var(--space-3); }
.data-access-mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 11px; background: var(--text-primary); color: white; font-weight: 800; }
.data-access-card > button { min-height: 38px; justify-self: end; }
.data-access-card > button:disabled { cursor: not-allowed; }

@media (max-width: 1179px) { .data-access-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .data-access-grid { grid-template-columns: 1fr; }
  .data-access-card { min-height: 0; }
  .data-access-card > button { width: 100%; min-height: 44px; }
}
```

Use existing design tokens; do not add gradients, marketing ratings, thick shadows, or remote brand artwork.

- [ ] **Step 4: Add detail, loading, error, and reduced-motion rules**

Keep the detail content in normal document flow. At `<=760px`, platform form and facts become one column. At `<=390px`, inputs use `min-width:0;width:100%`, actions stack, and no fixed-height inner scroll area is introduced. Disable skeleton animation under `prefers-reduced-motion`.

```css
.data-access-detail { min-width: 0; display: grid; gap: var(--space-4); }
.data-access-sync-section { min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); }
.data-access-sync-section > header { padding: var(--space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-bottom: 1px solid var(--border); }
@media (max-width: 640px) { .data-access-sync-section > header { align-items: stretch; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .connection-loading span, .platform-connections-loading span { animation: none; } }
```

- [ ] **Step 5: Run focused tests and build**

Run: `node --test react-tests/data-access-hub.test.mjs react-tests/data-center-connections-ui.test.mjs react-tests/platform-connections.test.mjs && npm run build`

Expected: all focused tests PASS and Vite build exits 0.

- [ ] **Step 6: Commit the visual implementation**

```bash
git add src/styles.css src/features/data-center/platform-connections.css react-tests/data-access-hub.test.mjs react-tests/data-center-connections-ui.test.mjs
git commit -m "style: polish unified data access catalog"
```

---

### Task 6: Write back durable rules and complete verification

**Files:**
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`
- Modify: `docs/features/data-center-app/prd.md`
- Modify: `docs/features/data-center-app/design.md`
- Modify: `docs/features/platform-connections/prd.md`
- Modify: `docs/features/platform-connections/design.md`
- Modify: `docs/platform/integrations.md`
- Modify: `docs/features/data-access-hub/tasks.md`
- Test: `react-tests/data-access-hub.test.mjs`

**Interfaces:**
- Durable rule: one visible data-access entry, three categories, DingTalk in company data, Kuaimai one-card/two-contract boundary.
- PR metadata: non-`none` `Integration-Impact` and `Rule-Writeback` declarations naming the affected platforms and files.

- [ ] **Step 1: Add a failing durable-document assertion**

```js
test("durable product and platform rules describe the unified catalog boundary", () => {
  assert.match(read("PRODUCT.md"), /电商平台、ERP、公司数据/);
  assert.match(read("DESIGN.md"), /钉钉[\s\S]*公司数据/);
  assert.match(read("docs/platform/integrations.md"), /同一平台只显示一个目录入口/);
  assert.match(read("docs/platform/integrations.md"), /公司级连接[\s\S]*同步实例[\s\S]*不可混存/);
});
```

- [ ] **Step 2: Run the document test and verify it fails**

Run: `node --test react-tests/data-access-hub.test.mjs`

Expected: FAIL on durable rule copy.

- [ ] **Step 3: Update durable product and design copy**

Add this rule to `PRODUCT.md`:

```md
数据中心只保留一个“数据接入”入口，并按“电商平台、ERP、公司数据”组织目录。钉钉归入公司数据；快麦只在 ERP 中出现一次。公司级平台连接与业务同步实例可以在同一详情中管理，但继续使用各自的权限、验证和加密存储契约。
```

Add this rule to `DESIGN.md`:

```md
数据接入使用横向分类和三列应用卡片。卡片显示平台用途、脱敏状态和就近操作；品牌色只用于标识。尚未适配的平台显示“准备接入”且不可保存，读取失败不能伪装成未连接。
```

Replace obsolete “独立平台连接侧边栏” language in the existing data-center and platform-connection PRD/design files with pointers to `docs/features/data-access-hub/`.

- [ ] **Step 4: Write the integration boundary back to platform documentation**

Add this paragraph to `docs/platform/integrations.md`:

```md
数据中心对同一平台只显示一个目录入口。公司级连接负责运行时 App 凭据、只读验证和版本切换；连接器同步实例负责主体、数据集、计划和采集状态。两者可以在一个平台详情中组合展示，但凭据、权限、API 和持久化记录不可在客户端混存或互相复制。
```

No `environment-capabilities.json` change is expected. If any implementation introduces an environment variable, binding, table, or provider readiness rule, stop and use the environment parity workflow before continuing.

- [ ] **Step 5: Mark completed feature tasks and run all required gates**

Run:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: every command exits 0; the baseline is 397 Node tests plus the new data-access tests.

- [ ] **Step 6: Perform visual and behavior verification**

Start the full governed local runtime:

```bash
npm start
```

Verify without executing external write actions:

- `#/data-sources`: defaults to 电商平台 and shows seven platform cards.
- ERP: one 快麦 card; detail exposes connection and sync sections.
- 公司数据: 钉钉、阿里云、NAS and other internal types appear; Aliyun is disabled honestly.
- `#/data-connections`: resolves to 数据接入 → 公司数据.
- 1440px: three columns; 900px: two; 640px and 390px: one.
- Keyboard: tabs, cards, back focus, modal focus, disabled reasons.
- Permission: employee read-only and executive manage states.
- DingTalk WebView: no horizontal scroll and actions remain reachable with the keyboard open.

- [ ] **Step 7: Inspect scope and commit durable rules**

```bash
git status --short
git diff --check
git add PRODUCT.md DESIGN.md docs/features/data-center-app docs/features/platform-connections docs/features/data-access-hub docs/platform/integrations.md react-tests/data-access-hub.test.mjs
git commit -m "docs: govern unified data access"
```

- [ ] **Step 8: Prepare truthful PR metadata**

Use:

```text
Integration-Impact: dingtalk, kuaimai, aliyun, erp-file-import, ugreen-nas, cloudflare-d1, cloudflare-pages, oceanengine-qianchuan
Integration-Impact-Reason: Unifies the data-center catalog and routes existing provider configuration into three product categories without changing provider APIs, credentials, environment capabilities, or persisted contracts.
Rule-Writeback: PRODUCT.md, DESIGN.md, docs/features/data-access-hub/prd.md, docs/features/data-access-hub/design.md, docs/platform/integrations.md
Rule-Writeback-Reason: Records the one-entry taxonomy and the rule that company platform credentials and sync-instance records may share a detail page but must not share storage or client-side secrets.
```

Before merge, update the branch from current `origin/main`, rerun `npm run check:branch-base`, and rerun the complete gate if the merge changes any source file.
