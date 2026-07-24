# Development Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a D1-backed “研发待办” platform page where all employees can view, developers can safely claim and advance work, executives control intake and acceptance, and AI assistant discussions create only confirmed structured drafts.

**Architecture:** Add a control-plane schema in `PRODUCT_FLOW_DB`, pure domain rules for normalization/transitions/conflicts, authenticated `/api/platform/v1/development-backlog` routes, a small browser API client, and a lazy-loaded React feature page. Register the AI drafting capability behind `invokeAiFeature`; browser code never calls the Provider or stores the full discussion.

**Tech Stack:** React 18, JavaScript ESM, Cloudflare Pages Functions, Cloudflare D1/SQLite migrations, Node test runner, Lucide icons, shared platform AI boundary.

## Global Constraints

- All authenticated employees can read; only 总经办 can create, edit intake fields, reprioritize, accept, complete, cancel, or reopen.
- Any non-readonly authenticated employee can claim available work; only the current assignee or 总经办 can update development state.
- Statuses are `clarification`, `ready`, `in_progress`, `review`, `completed`, `blocked`, and `cancelled`.
- The control database is `PRODUCT_FLOW_DB`; the tables do not follow the selected business-data environment.
- Display-data catalog policy for `development_backlog_items` and `development_backlog_events` is `skip`.
- Scope paths are normalized repository-relative prefixes; absolute paths, `..`, control characters, regexes, and arbitrary globs are rejected.
- Active overlapping work blocks claim; v1 has no force-ignore action.
- Every write carries `expectedVersion`; stale writes return `409 BACKLOG_VERSION_CONFLICT`.
- AI uses server-owned `appId: company-platform` and `featureId: development-backlog-draft` through `invokeAiFeature`.
- AI drafts never write D1 until an authorized executive confirms through the normal create API.
- Full AI chat, Prompt, Provider response, credentials, Cookie, absolute paths, and sensitive customer information are never persisted or returned.
- Selecting filters does not request data; only “查询” and “刷新” execute the list request.
- Production delivery is GitOps-only after review, merge to `main`, Cloudflare Git deployment, and production verification.

---

## File Structure

### New files

- `migrations/0014_development_backlog.sql`: control-plane item/event schema and indexes.
- `src/domain/developmentBacklog.js`: enums, normalization, transitions, permissions, conflicts, and display mappers.
- `functions/api/platform/v1/development-backlog/_shared/http.js`: safe responses and backlog error mapping.
- `functions/api/platform/v1/development-backlog/_shared/storage.js`: D1 reads and atomic writes.
- `functions/api/platform/v1/development-backlog/index.js`: list and create route.
- `functions/api/platform/v1/development-backlog/[id].js`: detail and executive content update route.
- `functions/api/platform/v1/development-backlog/[id]/actions.js`: claim and status-action route.
- `functions/api/platform/v1/development-backlog/ai-draft.js`: governed AI drafting route.
- `src/state/developmentBacklogApi.js`: browser-safe API client and safe messages.
- `src/features/development-backlog/DevelopmentBacklogPage.jsx`: page state and composition.
- `src/features/development-backlog/DevelopmentBacklogTable.jsx`: compact desktop/mobile result list.
- `src/features/development-backlog/DevelopmentBacklogDetail.jsx`: accessible detail drawer and actions.
- `src/features/development-backlog/DevelopmentBacklogEditor.jsx`: manual/AI draft confirmation form.
- `src/features/development-backlog/development-backlog.css`: page-specific responsive styles.
- `tests/development-backlog-domain.test.mjs`: domain state, path, conflict, and permission tests.
- `tests/development-backlog-migration.test.mjs`: migration, environment manifest, and display policy tests.
- `tests/development-backlog-api.test.mjs`: authenticated list/create/detail/action route tests.
- `tests/development-backlog-ai.test.mjs`: feature registration, safe AI draft, and readiness failure tests.
- `react-tests/development-backlog-api.test.mjs`: browser client URL, action, and safe error tests.
- `react-tests/development-backlog-ui.test.mjs`: navigation, permissions, AI routing, and UI-state contract tests.
- `docs/features/development-backlog/prd.md`: durable product intent and acceptance.
- `docs/features/development-backlog/design.md`: durable interaction states and permissions.
- `docs/features/development-backlog/plan.md`: durable architecture, migration, rollback, and verification.
- `docs/features/development-backlog/tasks.md`: implementation checklist.
- `docs/platform/apis/development-backlog-v1.md`: authenticated API contract.

### Modified files

- `src/App.jsx`: lazy page, platform navigation item, render route, and AI settings navigation.
- `src/domain/permissions.js`: all-employee navigation permission.
- `src/main.jsx`: feature stylesheet import.
- `functions/api/platform/v1/ai/_shared/feature-registry.js`: registered AI draft feature.
- `functions/api/platform/_shared/demoDataCatalog.js`: explicit control-table `skip` entries.
- `docs/platform/environment-capabilities.json`: control D1 capability and tables.
- `docs/platform/integration-registry.json`: Pages, D1, and AI gateway routes/code paths/evidence.
- `functions/api/platform/_generated/environmentCapabilities.js`: generated manifest.
- `functions/api/platform/_generated/integrationRegistry.js`: generated registry.
- `docs/platform/api-catalog.md`: new internal platform API and AI feature.
- `docs/platform/error-codes.md`: stable backlog error family.
- `docs/platform/integrations.md`: AI and D1 relationship.
- `AGENTS.md`: development tasks query and claim the shared backlog before coding.
- `react-tests/sidebar-navigation.test.mjs`: new platform navigation order.
- `react-tests/permissions.test.mjs`: all-employee visibility.
- `tests/environment-capabilities.test.mjs`: capability contract.
- `tests/ai-feature-invocation.test.mjs`: registered zero-use AI feature count and lookup.

---

### Task 1: Durable feature documents and executable environment contract

**Files:**
- Create: `docs/features/development-backlog/prd.md`
- Create: `docs/features/development-backlog/design.md`
- Create: `docs/features/development-backlog/plan.md`
- Create: `docs/features/development-backlog/tasks.md`
- Create: `tests/development-backlog-migration.test.mjs`
- Create: `migrations/0014_development_backlog.sql`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `functions/api/platform/_shared/demoDataCatalog.js`
- Modify: `docs/platform/integration-registry.json`
- Modify: `tests/environment-capabilities.test.mjs`
- Generate: `functions/api/platform/_generated/environmentCapabilities.js`
- Generate: `functions/api/platform/_generated/integrationRegistry.js`

**Interfaces:**
- Consumes: approved spec `docs/superpowers/specs/2026-07-24-development-backlog-design.md`.
- Produces: D1 tables `development_backlog_items`, `development_backlog_events`; capability ID `development-backlog`; explicit display policy `skip`.

- [ ] **Step 1: Write the failing migration and governance test**

```js
test("development backlog declares control-plane D1 tables skipped from display data", () => {
  const sql = readFileSync(resolve("migrations/0014_development_backlog.sql"), "utf8");
  const manifest = JSON.parse(readFileSync(resolve("docs/platform/environment-capabilities.json"), "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "development-backlog");
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, ["development_backlog_items", "development_backlog_events"]);
  for (const table of capability.tables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.equal(getDemoDataCatalogEntry(table).policy, "skip");
  }
  assert.doesNotMatch(sql, /prompt|cookie|credential|provider_response/i);
});
```

- [ ] **Step 2: Run the test and verify it fails because the migration and capability do not exist**

Run: `node --test tests/development-backlog-migration.test.mjs`

Expected: FAIL with missing `migrations/0014_development_backlog.sql` or missing `development-backlog` capability.

- [ ] **Step 3: Add the schema, manifest entry, explicit skip catalog, and feature documents**

The migration creates:

```sql
CREATE TABLE IF NOT EXISTS development_backlog_items (
  sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  display_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  background TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  status TEXT NOT NULL CHECK (status IN ('clarification', 'ready', 'in_progress', 'review', 'completed', 'blocked', 'cancelled')),
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  scope_paths_json TEXT NOT NULL DEFAULT '[]',
  dependency_ids_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL CHECK (source_type IN ('ai_assistant', 'codex', 'manual')),
  owner_user_id TEXT,
  owner_name_snapshot TEXT,
  claimed_branch TEXT,
  pull_request_url TEXT,
  acceptance_evidence TEXT,
  blocked_reason TEXT,
  resume_condition TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS development_backlog_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  changed_fields_json TEXT NOT NULL DEFAULT '[]',
  actor_user_id TEXT NOT NULL,
  actor_name_snapshot TEXT NOT NULL DEFAULT '',
  branch_snapshot TEXT,
  evidence_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES development_backlog_items(id)
);
```

The environment capability is blocking in preview and production, uses only `PRODUCT_FLOW_DB`, and introduces no environment variable or Provider action. Register the API code paths and routes under Cloudflare Pages/D1 and the AI draft route under the AI gateway. Run `npm run generate:platform-manifests`.

- [ ] **Step 4: Run focused governance tests**

Run: `node --test tests/development-backlog-migration.test.mjs tests/environment-capabilities.test.mjs`

Expected: PASS with the new control tables, generated modules, and explicit skip policies aligned.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/features/development-backlog docs/platform migrations/0014_development_backlog.sql functions/api/platform/_generated functions/api/platform/_shared/demoDataCatalog.js tests/development-backlog-migration.test.mjs tests/environment-capabilities.test.mjs
git commit -m "docs: register development backlog platform"
```

---

### Task 2: Pure backlog domain rules

**Files:**
- Create: `src/domain/developmentBacklog.js`
- Create: `tests/development-backlog-domain.test.mjs`

**Interfaces:**
- Consumes: status, role, scope, and conflict rules from the approved spec.
- Produces:
  - `BACKLOG_STATUSES`, `BACKLOG_PRIORITIES`, `BACKLOG_MODULES`
  - `backlogActor(session)`
  - `normalizeBacklogDraft(input)`
  - `normalizeScopePath(value)`
  - `findBacklogConflicts(candidate, items)`
  - `assertBacklogTransition(item, action, actor, input)`
  - `formatBacklogDisplayId(sequenceNo)`

- [ ] **Step 1: Write failing domain tests**

```js
test("scope paths reject unsafe paths and detect parent-child overlap", () => {
  assert.throws(() => normalizeScopePath("/Users/roger/project/src"), error => error.code === "BACKLOG_SCOPE_INVALID");
  assert.throws(() => normalizeScopePath("../src"), error => error.code === "BACKLOG_SCOPE_INVALID");
  assert.equal(normalizeScopePath("./src//features/data-center/"), "src/features/data-center/");
  const conflicts = findBacklogConflicts(
    { id: "new", moduleId: "data-center", scopePaths: ["src/features/data-center/"] },
    [{ id: "old", displayId: "DEV-000001", status: "in_progress", moduleId: "data-center", scopePaths: ["src/features/data-center/DataOverview.jsx"] }]
  );
  assert.equal(conflicts[0].displayId, "DEV-000001");
});

test("executives control intake while assignees control development actions", () => {
  const executive = backlogActor({ userId: "e1", department: "总经办", role: "executive" });
  const developer = backlogActor({ userId: "d1", department: "产品部", role: "employee" });
  assert.equal(assertBacklogTransition({ status: "ready", version: 1 }, "claim", developer, { branch: "codex/backlog" }).toStatus, "in_progress");
  assert.throws(() => assertBacklogTransition({ status: "review", ownerUserId: "d1" }, "complete", developer, {}), error => error.code === "BACKLOG_FORBIDDEN");
  assert.equal(assertBacklogTransition({ status: "review" }, "complete", executive, {}).toStatus, "completed");
});
```

- [ ] **Step 2: Run and verify missing-module failure**

Run: `node --test tests/development-backlog-domain.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/developmentBacklog.js`.

- [ ] **Step 3: Implement minimal pure rules**

Implement strict string/array limits, registered module IDs, normalized trailing-slash directory prefixes, active-status conflict selection, action transition maps, executive checks, assignee checks, branch validation, PR URL validation, evidence requirements, and safe display mappers. Throw errors shaped as:

```js
throw Object.assign(new Error("受影响路径必须是仓库相对路径。"), {
  code: "BACKLOG_SCOPE_INVALID",
  status: 400,
  retryable: false
});
```

- [ ] **Step 4: Run domain tests**

Run: `node --test tests/development-backlog-domain.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/developmentBacklog.js tests/development-backlog-domain.test.mjs
git commit -m "feat: add development backlog rules"
```

---

### Task 3: D1 storage and authenticated CRUD/action API

**Files:**
- Create: `functions/api/platform/v1/development-backlog/_shared/http.js`
- Create: `functions/api/platform/v1/development-backlog/_shared/storage.js`
- Create: `functions/api/platform/v1/development-backlog/index.js`
- Create: `functions/api/platform/v1/development-backlog/[id].js`
- Create: `functions/api/platform/v1/development-backlog/[id]/actions.js`
- Create: `tests/development-backlog-api.test.mjs`

**Interfaces:**
- Consumes: domain exports from Task 2 and `data.controlDb || env.PRODUCT_FLOW_DB`.
- Produces:
  - `GET/POST /api/platform/v1/development-backlog`
  - `GET/PATCH /api/platform/v1/development-backlog/:id`
  - `POST /api/platform/v1/development-backlog/:id/actions`
  - safe JSON `{ synced, item/items, summary, pagination }`

- [ ] **Step 1: Write failing API tests**

```js
test("all sessions read but only executives create backlog items", async () => {
  const employeeList = await onIndex(context({ method: "GET", session: employee, db }));
  assert.equal(employeeList.status, 200);
  const denied = await onIndex(context({ method: "POST", session: employee, db, body: validDraft }));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "BACKLOG_FORBIDDEN");
  const created = await onIndex(context({ method: "POST", session: executive, db, body: validDraft }));
  assert.equal(created.status, 201);
  assert.match((await created.json()).item.displayId, /^DEV-\d{6}$/);
});

test("claim rechecks version and active conflicts before an atomic write", async () => {
  const conflict = await onActions(context({
    id: candidate.id,
    method: "POST",
    session: employee,
    db,
    body: { action: "claim", expectedVersion: 1, branch: "codex/backlog" }
  }));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "BACKLOG_ACTIVE_CONFLICT");
});
```

- [ ] **Step 2: Run and verify route-module failure**

Run: `node --test tests/development-backlog-api.test.mjs`

Expected: FAIL because the backlog Pages Functions do not exist.

- [ ] **Step 3: Implement storage and routes**

Storage functions:

```js
export function backlogDatabase(env = {}, data = {}) {
  return data.controlDb || env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function listBacklogItems(db, query) {}
export async function readBacklogItem(db, id) {}
export async function createBacklogItem(db, item, actor, now) {}
export async function updateBacklogItem(db, current, patch, event, expectedVersion) {}
```

`createBacklogItem` uses one `INSERT ... SELECT COALESCE(MAX(sequence_no), 0) + 1` statement with a unique constraint retry and formats `display_id` from the same sequence. All mutating SQL includes `WHERE id = ? AND version = ?`; `changes === 0` becomes `BACKLOG_VERSION_CONFLICT`. Action routes read active candidates, call `findBacklogConflicts`, then update the item and append the event through `db.batch`.

Responses set `cache-control: private, no-store`. Unknown storage failures return `BACKLOG_QUERY_FAILED` or `BACKLOG_WRITE_FAILED` without SQL details.

- [ ] **Step 4: Run API and domain tests**

Run: `node --test tests/development-backlog-domain.test.mjs tests/development-backlog-api.test.mjs`

Expected: PASS for session, executive, assignee, conflict, pagination, safe error, version, and event cases.

- [ ] **Step 5: Commit**

```bash
git add functions/api/platform/v1/development-backlog tests/development-backlog-api.test.mjs
git commit -m "feat: add development backlog API"
```

---

### Task 4: Governed AI draft endpoint

**Files:**
- Modify: `functions/api/platform/v1/ai/_shared/feature-registry.js`
- Create: `functions/api/platform/v1/development-backlog/ai-draft.js`
- Create: `tests/development-backlog-ai.test.mjs`
- Modify: `tests/ai-feature-invocation.test.mjs`

**Interfaces:**
- Consumes: `invokeAiFeature`, registered module list, and `normalizeBacklogDraft`.
- Produces: `POST /api/platform/v1/development-backlog/ai-draft` returning `{ draft, mode: "model" }` without persistence.

- [ ] **Step 1: Write failing AI feature and route tests**

```js
test("development backlog draft is a registered non-fallback AI feature", async () => {
  const feature = getAiFeatureDefinition("company-platform", "development-backlog-draft");
  assert.equal(feature.fallbackMode, "none");
  assert.equal(feature.supportsSkills, false);
});

test("AI draft returns normalized JSON and never writes backlog tables", async () => {
  const response = await onAiDraft(context({
    session: employee,
    providerText: JSON.stringify({
      title: "修复扩展重载",
      background: "扩展重载后恢复任务领取",
      moduleId: "data-acquisition",
      priority: "p1",
      acceptanceCriteria: ["重载后自动领取任务"],
      scopePaths: ["chrome-extension/company-data-collector/"],
      dependencyIds: []
    })
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).draft.sourceType, "ai_assistant");
  assert.equal(db.backlogWrites, 0);
});
```

- [ ] **Step 2: Run and verify unregistered-feature failure**

Run: `node --test tests/development-backlog-ai.test.mjs tests/ai-feature-invocation.test.mjs`

Expected: FAIL with `AI_FEATURE_NOT_REGISTERED` or missing route.

- [ ] **Step 3: Register and invoke the feature**

Register:

```js
{
  appId: "company-platform",
  appName: "公司平台",
  featureId: "development-backlog-draft",
  featureName: "研发待办草稿",
  supportsSkills: false,
  fallbackMode: "none",
  historyNote: ""
}
```

The route accepts only `{ description }` between 2 and 8,000 characters, calls `invokeAiFeature`, extracts exactly one JSON object, normalizes its approved fields, forces `sourceType: "ai_assistant"`, and returns it. Map `AI_DISABLED`, `AI_PROVIDER_NOT_READY`, and `AI_PROVIDER_SECRET_MISSING` to a non-retryable configuration response; preserve timeout/rate-limit/provider-unavailable as retryable.

- [ ] **Step 4: Run AI tests**

Run: `node --test tests/development-backlog-ai.test.mjs tests/ai-feature-invocation.test.mjs tests/ai-provider-boundary.test.mjs`

Expected: PASS, including boundary checks that business routes do not import the low-level Responses adapter.

- [ ] **Step 5: Commit**

```bash
git add functions/api/platform/v1/ai/_shared/feature-registry.js functions/api/platform/v1/development-backlog/ai-draft.js tests/development-backlog-ai.test.mjs tests/ai-feature-invocation.test.mjs
git commit -m "feat: add AI backlog drafting"
```

---

### Task 5: Browser API client

**Files:**
- Create: `src/state/developmentBacklogApi.js`
- Create: `react-tests/development-backlog-api.test.mjs`

**Interfaces:**
- Consumes: API routes from Tasks 3 and 4.
- Produces:
  - `loadDevelopmentBacklog(filters, fetchImpl, signal)`
  - `loadDevelopmentBacklogItem(id, fetchImpl, signal)`
  - `createDevelopmentBacklogItem(draft, fetchImpl)`
  - `updateDevelopmentBacklogItem(id, expectedVersion, patch, fetchImpl)`
  - `runDevelopmentBacklogAction(id, action, expectedVersion, input, fetchImpl)`
  - `draftDevelopmentBacklog(description, fetchImpl, signal)`
  - `isAiConfigurationError(error)`

- [ ] **Step 1: Write failing client tests**

```js
test("filters are sent only when load is explicitly called", async () => {
  const calls = [];
  await loadDevelopmentBacklog({ status: "ready", priority: "p1", page: 2 }, async url => {
    calls.push(url);
    return jsonResponse({ items: [], summary: {}, pagination: {} });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /status=ready/);
  assert.match(calls[0], /page=2/);
});

test("AI configuration errors are distinguishable from retryable failures", () => {
  assert.equal(isAiConfigurationError({ code: "AI_PROVIDER_NOT_READY", retryable: false }), true);
  assert.equal(isAiConfigurationError({ code: "AI_PROVIDER_TIMEOUT", retryable: true }), false);
});
```

- [ ] **Step 2: Run and verify missing-client failure**

Run: `node --test react-tests/development-backlog-api.test.mjs`

Expected: FAIL with missing `src/state/developmentBacklogApi.js`.

- [ ] **Step 3: Implement the safe API client**

Use `credentials: "include"`, `accept: application/json`, JSON bodies for writes, and map only stable error codes to user-facing Chinese messages. Preserve `status`, `code`, `requestId`, `retryable`, and safe conflict `details`; never expose a raw response body or server exception.

- [ ] **Step 4: Run client tests**

Run: `node --test react-tests/development-backlog-api.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/developmentBacklogApi.js react-tests/development-backlog-api.test.mjs
git commit -m "feat: add backlog browser client"
```

---

### Task 6: Navigation, permissions, and page shell

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/domain/permissions.js`
- Modify: `src/main.jsx`
- Create: `src/features/development-backlog/DevelopmentBacklogPage.jsx`
- Create: `src/features/development-backlog/DevelopmentBacklogTable.jsx`
- Create: `src/features/development-backlog/development-backlog.css`
- Create: `react-tests/development-backlog-ui.test.mjs`
- Modify: `react-tests/sidebar-navigation.test.mjs`
- Modify: `react-tests/permissions.test.mjs`

**Interfaces:**
- Consumes: Task 5 API client and current `sessionUser/currentUser`.
- Produces: `#development-backlog` route and all-employee platform navigation item after `handbook`.

- [ ] **Step 1: Write failing navigation and page-state tests**

```js
test("development backlog appears after handbook and before issues for both navigation modes", () => {
  for (const block of [companyNavigation, productNavigation]) {
    assert.match(block, /\["handbook", "说明书"[\s\S]*\["development-backlog", "研发待办"[\s\S]*\["issues", "问题反馈"/);
  }
});

test("backlog page keeps draft filters separate from applied filters", () => {
  const source = readFileSync(resolve("src/features/development-backlog/DevelopmentBacklogPage.jsx"), "utf8");
  assert.match(source, /filterDraft/);
  assert.match(source, /appliedFilters/);
  assert.match(source, /查询/);
  assert.match(source, /刷新/);
});
```

- [ ] **Step 2: Run and verify missing navigation/page failure**

Run: `node --test react-tests/development-backlog-ui.test.mjs react-tests/sidebar-navigation.test.mjs react-tests/permissions.test.mjs`

Expected: FAIL because the route and navigation permission do not exist.

- [ ] **Step 3: Implement navigation and read-only page states**

Add Lucide `ListTodo`, lazy load `DevelopmentBacklogPage`, render it with `sessionUser` and `onNavigate={showScreen}`, and add `development-backlog` to `NAV_PERMISSION_ITEMS` plus default `departments: ["*"]`. The page owns separate `filterDraft` and `appliedFilters`, loads on first mount, and only reloads on explicit query/refresh/page actions.

Render summary counts, accessible filter controls, compact table, loading skeleton, empty state, retryable error, conflict badges, and pagination. Do not add a second local data cache as a source of truth.

- [ ] **Step 4: Run focused UI tests and build**

Run: `node --test react-tests/development-backlog-ui.test.mjs react-tests/sidebar-navigation.test.mjs react-tests/permissions.test.mjs && npm run build`

Expected: PASS and Vite build success.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/domain/permissions.js src/main.jsx src/features/development-backlog react-tests/development-backlog-ui.test.mjs react-tests/sidebar-navigation.test.mjs react-tests/permissions.test.mjs
git commit -m "feat: add development backlog page"
```

---

### Task 7: Detail, actions, manual intake, and AI configuration recovery

**Files:**
- Create: `src/features/development-backlog/DevelopmentBacklogDetail.jsx`
- Create: `src/features/development-backlog/DevelopmentBacklogEditor.jsx`
- Modify: `src/features/development-backlog/DevelopmentBacklogPage.jsx`
- Modify: `src/features/development-backlog/development-backlog.css`
- Modify: `react-tests/development-backlog-ui.test.mjs`

**Interfaces:**
- Consumes: Task 5 write and AI functions; `onNavigate("data-services", "development-backlog")`.
- Produces: claim/release/review/block/resume/complete/cancel/reopen interactions, executive editor, AI draft confirmation, and safe configuration return state.

- [ ] **Step 1: Add failing interaction-contract tests**

```js
test("AI intake routes configuration errors but keeps retryable failures in place", () => {
  const source = readFileSync(resolve("src/features/development-backlog/DevelopmentBacklogPage.jsx"), "utf8");
  assert.match(source, /isAiConfigurationError/);
  assert.match(source, /sessionStorage\\.setItem\\(BACKLOG_DRAFT_KEY/);
  assert.match(source, /onNavigate\\("data-services", "development-backlog"\\)/);
  assert.match(source, /重新生成/);
  assert.match(source, /手工新增/);
});

test("detail actions collect branch blockers evidence and expected version", () => {
  const detail = readFileSync(resolve("src/features/development-backlog/DevelopmentBacklogDetail.jsx"), "utf8");
  assert.match(detail, /expectedVersion/);
  assert.match(detail, /claimedBranch/);
  assert.match(detail, /acceptanceEvidence/);
  assert.match(detail, /resumeCondition/);
});
```

- [ ] **Step 2: Run and verify interaction test failures**

Run: `node --test react-tests/development-backlog-ui.test.mjs`

Expected: FAIL because detail/editor/AI recovery interactions are absent.

- [ ] **Step 3: Implement details, actions, editor, and AI recovery**

Use an accessible modal sheet for manual/AI-confirmed intake and a right-side desktop detail panel that becomes a bottom sheet on narrow screens. Executive controls come from `sessionUser.role` plus 总经办 department and are still enforced server-side.

Store only the raw unsent demand description in `sessionStorage` key `development-backlog:unsent-description:v1`. On a non-retryable AI configuration error:

```js
sessionStorage.setItem(BACKLOG_DRAFT_KEY, description);
onNavigate("data-services", "development-backlog");
```

On timeout/rate limit/provider unavailable, keep the editor open, show “重新生成”, and leave “手工新增” available to executives. Confirming an AI draft calls `createDevelopmentBacklogItem`; it never writes during generation.

- [ ] **Step 4: Run UI/client/API tests**

Run: `node --test react-tests/development-backlog-ui.test.mjs react-tests/development-backlog-api.test.mjs tests/development-backlog-api.test.mjs tests/development-backlog-ai.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/development-backlog react-tests/development-backlog-ui.test.mjs
git commit -m "feat: complete backlog collaboration flow"
```

---

### Task 8: Durable API/rule writeback and full verification

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/platform/apis/development-backlog-v1.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `docs/platform/integrations.md`
- Modify: `docs/features/development-backlog/tasks.md`

**Interfaces:**
- Consumes: implemented behavior from Tasks 1–7.
- Produces: durable workflow, API, errors, integration impact, migration/rollback, and verification record.

- [ ] **Step 1: Write the documentation assertions into existing governance tests**

```js
test("development backlog API and agent claim rule are durable", () => {
  const agents = readFileSync(resolve("AGENTS.md"), "utf8");
  const catalog = readFileSync(resolve("docs/platform/api-catalog.md"), "utf8");
  const errors = readFileSync(resolve("docs/platform/error-codes.md"), "utf8");
  assert.match(agents, /研发待办.*查询.*认领/s);
  assert.match(catalog, /\\/api\\/platform\\/v1\\/development-backlog/);
  assert.match(errors, /BACKLOG_ACTIVE_CONFLICT/);
});
```

- [ ] **Step 2: Run the governance test and verify documentation failure**

Run: `node --test tests/development-backlog-migration.test.mjs`

Expected: FAIL until the durable API and claim rule are present.

- [ ] **Step 3: Complete durable documentation**

Document:

- authentication and authorization matrix;
- list/detail/create/update/action/AI-draft requests and responses;
- stable errors, version conflict, retryability, and no-store headers;
- D1 capacity, indexes, migration, rollback, and display `skip`;
- AI registration, content-free audit, unavailable-versus-transient UI behavior;
- development tasks must query and claim a confirmed item before editing overlapping scope;
- PR metadata:
  - `Integration-Impact: cloudflare-pages, cloudflare-d1, lingsuan-ai-gateway`
  - `Integration-Impact-Reason: 新增研发待办控制库/API，并通过共享 AI 网关生成未落库草稿。`
  - `Rule-Writeback: AGENTS.md, docs/platform/apis/development-backlog-v1.md, docs/platform/api-catalog.md, docs/platform/error-codes.md, docs/platform/integrations.md`
  - `Rule-Writeback-Reason: 新增共享控制面、API、D1 表、错误族和开发认领流程。`

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npm run generate:platform-manifests
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: every command exits 0 with no new warning.

- [ ] **Step 5: Inspect scope and commit**

Run:

```bash
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

Expected: only development-backlog feature, platform registry/generated files, durable docs, and direct tests are changed.

```bash
git add AGENTS.md docs/platform docs/features/development-backlog
git commit -m "docs: govern development backlog workflow"
```

After review, update the branch from latest `origin/main`, rerun all gates, merge through GitHub, let Cloudflare Git deploy production, then verify authenticated read/create/claim/conflict/AI-unavailable behavior in production. Do not use direct Wrangler deployment as delivery.
