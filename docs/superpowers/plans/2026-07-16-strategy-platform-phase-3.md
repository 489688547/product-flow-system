# Strategy Platform Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Product Lifecycle facts and DingTalk actions to strategy projects without coupling the cockpit to product internals.

**Architecture:** A pure adapter translates product state into idempotent platform events. A bridge submits those events to PlatformProvider, which updates linked project health and data freshness. Action notifications reuse the existing DingTalk todo endpoint.

**Tech Stack:** React hooks, existing product domain, DingTalk API Functions, Node test runner.

## Global Constraints

- Product Lifecycle remains independently usable.
- Events include App ID, entity type, entity ID, occurred time, sync time, and idempotency key.
- Duplicate events produce no duplicate risks or decisions.
- Product or DingTalk failures cannot block the company cockpit.

---

### Task 1: Product Lifecycle event adapter

**Files:**
- Create: `src/domain/productPlatformAdapter.js`
- Create: `react-tests/product-platform-adapter.test.mjs`

**Interfaces:**
- Produces: `buildProductPlatformEvents(productState, today)` and `productAppLink(product)`.

- [ ] **Step 1: Write failing adapter tests**

```js
const events = buildProductPlatformEvents(state, "2026-07-16");
assert.ok(events.some(event => event.kind === "progress_changed"));
assert.ok(events.every(event => event.idempotencyKey));
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/product-platform-adapter.test.mjs`
Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement progress, milestone, delay, risk, and owner events**

Use `calculateProductTaskProgress`, task due dates, product stages, and plans. Event IDs must be stable for identical source state.

- [ ] **Step 4: Run focused tests**

Run: `node --test react-tests/product-platform-adapter.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/domain/productPlatformAdapter.js react-tests/product-platform-adapter.test.mjs
git commit -m "feat(platform): adapt product events"
```

### Task 2: Idempotent App bridge and project linkage

**Files:**
- Create: `src/features/platform/ProductFlowPlatformBridge.jsx`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/main.jsx`
- Modify: `src/features/platform/AppCenterPage.jsx`
- Test: `react-tests/strategy-execution.test.mjs`

**Interfaces:**
- Consumes: `buildProductPlatformEvents` and `dispatch({ type: "ingest_app_events", events })`.
- Produces: linked project source health, last sync time, and App deep links.

- [ ] **Step 1: Write a failing idempotency test**

```js
const once = reducePlatformState(state, { type: "ingest_app_events", events: [event] });
const twice = reducePlatformState(once, { type: "ingest_app_events", events: [event] });
assert.equal(twice.appEvents.length, once.appEvents.length);
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/strategy-execution.test.mjs`
Expected: FAIL until event ingestion exists.

- [ ] **Step 3: Implement bridge and linked project status**

The bridge runs after both providers are mounted. It dispatches only when the event signature changes and never blocks product rendering on failure.

- [ ] **Step 4: Run tests and build**

Run: `npm run test:react && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit App linkage**

```bash
git add src/features/platform/ProductFlowPlatformBridge.jsx src/domain/strategyExecution.js src/main.jsx src/features/platform/AppCenterPage.jsx react-tests/strategy-execution.test.mjs
git commit -m "feat(platform): link product lifecycle"
```

### Task 3: DingTalk action notifications

**Files:**
- Create: `src/domain/platformNotifications.js`
- Modify: `src/state/PlatformProvider.jsx`
- Modify: `src/features/projects/ProjectDetailModal.jsx`
- Create: `react-tests/platform-notifications.test.mjs`

**Interfaces:**
- Produces: `buildDecisionTodoPayload(decision, project, users)` and `syncDecisionTodo(id)`.

- [ ] **Step 1: Write failing payload tests**

```js
const payload = buildDecisionTodoPayload(decision, project, users);
assert.match(payload.subject, /待决策/);
assert.ok(payload.detailUrl.includes("#projects"));
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/platform-notifications.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement explicit “同步钉钉待办” action**

Reuse `POST /api/dingtalk/todo/sync`. Save `dingTodo`, `syncedAt`, and `lastError` on the decision without failing the local decision save.

- [ ] **Step 4: Run tests**

Run: `node --test react-tests/platform-notifications.test.mjs && npm run test:api`
Expected: PASS.

- [ ] **Step 5: Commit notifications**

```bash
git add src/domain/platformNotifications.js src/state/PlatformProvider.jsx src/features/projects/ProjectDetailModal.jsx react-tests/platform-notifications.test.mjs
git commit -m "feat(dingtalk): sync decision actions"
```
