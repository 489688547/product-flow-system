# Company AI Read-only Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix company AI chat scrolling and Enter-to-send behavior, then let the assistant invoke permission-scoped, read-only Skills across the company Apps and show auditable activity in the UI.

**Architecture:** Add one server-side Skill registry owned by the AI platform and keep each App's read projection and authorization inside its existing server boundary. Extend the LingSuan Responses adapter with a bounded Function Calling loop; only the server executes tools, validates arguments and emits safe SSE activity metadata. Keep `/api/platform/v1/ai/chat` compatible with existing text and source events.

**Tech Stack:** React 18, JavaScript modules, Cloudflare Pages Functions, D1, OpenAI-compatible Responses SSE, Node test runner, CSS Grid.

## Global Constraints

- Skills are read-only; no business POST/PUT/PATCH/DELETE, synchronization, export, DingTalk action or external-provider action.
- Current DingTalk session, App permissions and Provider transfer policy must all allow a Skill before it is shown or executed.
- Finance transfer stays blocked for LingSuan.
- One answer may use at most two tool rounds and six calls; repeated `skillId + arguments` executes once.
- Each call has an 8-second timeout plus per-Skill row and character limits.
- Browser requests contain only conversation messages and `appHint`; they never contain Skill IDs, authority or business state.
- Skill audit stores identifiers, safe argument summaries, counts, duration and result code, never prompt, answer or raw result.
- `Enter` sends, `Shift + Enter` inserts a newline and IME composition never sends.
- The message region owns vertical scrolling in ready and not-ready layouts; manual upward scrolling disables auto-follow until “回到最新” or a new user message.

---

### Task 1: Fix composer keyboard behavior and conversation scrolling

**Files:**
- Modify: `src/features/ai-assistant/AiComposer.jsx`
- Modify: `src/features/ai-assistant/AiConversation.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/ai-assistant-ui.test.mjs`

**Interfaces:**
- Consumes: `AiComposer({ sending, disabled, onSend, onStop, autoFocus, idSuffix })`.
- Produces: `Enter` send behavior and an `AiConversation` scroll container with `data-following-latest` state.

- [x] **Step 1: Write failing keyboard and layout tests**

Add assertions that the composer rejects composition, sends plain Enter, preserves Shift+Enter, and that panel children use explicit rows:

```js
assert.match(composer, /event\.isComposing/);
assert.match(composer, /event\.key === "Enter" && !event\.shiftKey/);
assert.match(styles, /\.ai-assistant-panel > \.ai-assistant-conversation\s*\{[^}]*grid-row:\s*3/s);
assert.match(styles, /\.ai-assistant-panel > \.ai-assistant-composer\s*\{[^}]*grid-row:\s*4/s);
assert.match(conversation, /回到最新/);
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --test react-tests/ai-assistant-ui.test.mjs`

Expected: FAIL because plain Enter, IME protection, explicit grid rows and latest-message control are absent.

- [x] **Step 3: Implement the keyboard contract**

Use this event condition in `AiComposer` and update the hint to `Enter 发送 · Shift + Enter 换行`:

```js
onKeyDown={event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.nativeEvent?.isComposing) return;
  event.preventDefault();
  submit();
}}
```

- [x] **Step 4: Implement bounded auto-follow**

Give `AiConversation` a scroll ref and boolean state. Treat a distance of 80px or less as following; stream updates scroll only when following. A new user message resets following, and the “回到最新” button calls `scrollTo({ top: scrollHeight, behavior: "smooth" })`.

```js
const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
setFollowingLatest(distance <= 80);
```

Assign panel rows explicitly and keep the status row collapsible:

```css
.ai-assistant-panel > .ai-assistant-not-ready { grid-row: 2; }
.ai-assistant-panel > .ai-assistant-conversation { grid-row: 3; min-height: 0; }
.ai-assistant-panel > .ai-assistant-composer { grid-row: 4; }
```

- [x] **Step 5: Run focused tests and commit**

Run: `node --test react-tests/ai-assistant-ui.test.mjs react-tests/ai-assistant-api.test.mjs`

Expected: all tests PASS.

Commit: `fix(ai): repair chat input and scrolling`

---

### Task 2: Add the governed Skill registry and core App executors

**Files:**
- Create: `functions/api/platform/v1/ai/_shared/skill-registry.js`
- Create: `functions/api/platform/v1/ai/_shared/skill-executors/core.js`
- Test: `tests/ai-skills.test.mjs`
- Modify: `tests/helpers/ai-d1-mock.mjs`

**Interfaces:**
- Produces: `listAvailableSkills({ db, session, access })`, `executeSkill({ db, session, access, skillId, argumentsText, signal })`.
- Skill result: `{ skillId, appId, displayName, records, recordCount, updatedAt, source, safeArguments }`.

- [x] **Step 1: Write failing registry tests**

Cover executive visibility, ordinary-user removal, unknown IDs, extra JSON fields, date limits, finance removal and result truncation:

```js
const skills = listAvailableSkills({ db, session: executive, access });
assert.ok(skills.some(item => item.name === "data_center_query_sales"));
await assert.rejects(
  executeSkill({ db, session: employee, access, skillId: "supply_chain_query_status", argumentsText: "{}" }),
  error => error.code === "AI_SKILL_DENIED"
);
```

- [x] **Step 2: Run tests and confirm RED**

Run: `node --test tests/ai-skills.test.mjs`

Expected: FAIL because the registry module does not exist.

- [x] **Step 3: Define fixed Skill metadata**

Register these core Skills with strict schemas and limits:

```js
const SKILLS = Object.freeze([
  skill("strategy_query_company", "strategy", ["strategy", "projects", "commitments", "operating_reviews"], queryStrategy),
  skill("product_flow_query_lifecycle", "product-flow", ["product_lifecycle"], queryProductLifecycle),
  skill("supply_chain_query_status", "supply-chain", ["supply_chain"], querySupplyChain),
  skill("data_center_query_sales", "data-center", ["sales_operations"], querySales),
  skill("data_center_query_quality", "data-center", ["data_quality"], queryDataQuality)
]);
```

The public Provider shape must be `{ type: "function", name, description, parameters, strict: true }`. Reject unknown fields with `additionalProperties: false`.

- [x] **Step 4: Implement validation and execution guards**

Parse JSON once, allow only schema properties, race execution against an 8-second abort, redact private keys and truncate rows/chars after the existing App reader returns. Recheck that every `domainId` is present in `access.allowed` immediately before execution.

- [x] **Step 5: Run tests and commit**

Run: `node --test tests/ai-skills.test.mjs tests/ai-context-policy.test.mjs`

Expected: all tests PASS.

Commit: `feat(ai): register governed read skills`

---

### Task 3: Add store-operations, brand-content and performance Skills

**Files:**
- Create: `functions/api/brand-content/_shared/storage.js`
- Modify: `functions/api/brand-content.js`
- Create: `functions/api/platform/v1/ai/_shared/skill-executors/business-apps.js`
- Modify: `functions/api/platform/v1/ai/_shared/skill-registry.js`
- Test: `tests/ai-skills-business-apps.test.mjs`

**Interfaces:**
- Produces: `readBrandContentState(db)` and three additional Skill IDs: `ecommerce_operations_query`, `brand_content_query`, `performance_management_query`.
- Reuses: `readOperationsState`, `filterOperationsStateForSession`, `readPerformanceState`, `filterPerformanceState`.

- [x] **Step 1: Write failing projection tests**

Create fixtures containing both allowed and hidden records, plus salary/bonus/cost-like fields. Assert ordinary employees receive only their existing App projection and no restricted keys; total-office sessions receive wider records but still no finance-transfer fields.

```js
assert.equal(result.records.auditLogs, undefined);
assert.doesNotMatch(JSON.stringify(result.records), /salary|bonus|cost|profit/i);
```

- [x] **Step 2: Run tests and confirm RED**

Run: `node --test tests/ai-skills-business-apps.test.mjs`

Expected: FAIL because the business-App executors and shared brand reader do not exist.

- [x] **Step 3: Extract brand read storage without changing route behavior**

Move `ensureTable`, `parseStoredState` and `readStoredState` into `functions/api/brand-content/_shared/storage.js` as `ensureBrandContentTable`, `parseBrandContentState` and `readBrandContentState`. Keep the route response and write path contract unchanged.

- [x] **Step 4: Implement three read projections**

Call existing storage and access functions directly. Select only approved fields and cap each collection before returning. Never import React state or call the App's HTTP route from the Skill executor.

- [x] **Step 5: Run compatibility tests and commit**

Run: `node --test tests/ai-skills-business-apps.test.mjs tests/brand-content-api.test.mjs tests/ecommerce-operations-api.test.mjs tests/performance-management-api.test.mjs`

Expected: all tests PASS; existing App API behavior is unchanged.

Commit: `feat(ai): expose business app read skills`

---

### Task 4: Extend the Responses adapter with Function Calling turns

**Files:**
- Modify: `functions/api/platform/v1/ai/_shared/responses-adapter.js`
- Modify: `functions/api/platform/v1/ai/_shared/provider-config.js`
- Modify: `src/domain/aiAssistant.js`
- Test: `tests/ai-provider.test.mjs`

**Interfaces:**
- Produces: `streamProviderTurn({ config, input, tools, fetchImpl, signal })` events `text_delta`, `function_call`, `output_item`, `usage`.
- Produces: `testProviderSkillConnection()` returning `{ supported, checkedAt, latencyMs, error? }` using only a synthetic `lookup_status` tool.

- [x] **Step 1: Write failing adapter tests**

Assert request JSON contains strict tools and `store:false`, parse `response.output_item.done` function calls, preserve output items for the next turn, and map malformed arguments or upstream errors to safe `AI_PROVIDER_*` codes.

```js
assert.deepEqual(body.tools[0], {
  type: "function",
  name: "lookup_status",
  description: "读取合成状态",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  strict: true
});
```

- [x] **Step 2: Run tests and confirm RED**

Run: `node --test tests/ai-provider.test.mjs`

Expected: FAIL because adapter requests and parser do not handle Function Calling.

- [x] **Step 3: Add optional tools to provider requests**

Keep the current request unchanged when tools are empty. When present, add `tools` and `tool_choice: "auto"`; parse completed function-call items into `{ callId, name, arguments, item }` while retaining text streaming and usage.

- [x] **Step 4: Add synthetic capability test**

Send no company data. The only valid call is `lookup_status({})`; return a synthetic function output and require a final response containing `ok`. Persist only `skillsSupported`, `lastSkillCheckedAt` and safe status metadata in the existing Provider record.

- [x] **Step 5: Run tests and commit**

Run: `node --test tests/ai-provider.test.mjs react-tests/ai-assistant-domain.test.mjs`

Expected: all tests PASS and existing text-only adapter tests remain compatible.

Commit: `feat(ai): support responses function calls`

---

### Task 5: Execute bounded Skill loops and audit calls

**Files:**
- Create: `migrations/0004_company_ai_skills.sql`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify: `functions/api/platform/v1/ai/_shared/audit.js`
- Create: `functions/api/platform/v1/ai/_shared/skill-loop.js`
- Modify: `functions/api/platform/v1/ai/chat.js`
- Modify: `tests/helpers/ai-d1-mock.mjs`
- Test: `tests/ai-api.test.mjs`
- Test: `tests/ai-skill-loop.test.mjs`

**Interfaces:**
- Produces: `runSkillLoop({ config, input, tools, execute, fetchImpl, signal, onEvent })`.
- Adds SSE events: `skill_started`, `skill_completed`, `skill_failed`.
- Adds D1 table `ai_skill_audit(request_id, call_id, skill_id, app_id, argument_summary, result_count, latency_ms, result_code, created_at)`.

- [x] **Step 1: Write failing loop, permission and audit tests**

Cover successful two-turn answer, six-call cap, two-round cap, duplicate fingerprint, denied Skill, one-call timeout, partial failure, cancellation and content-free audit.

```js
assert.equal(db.skillAudits[0].skillId, "data_center_query_sales");
assert.doesNotMatch(JSON.stringify(db.skillAudits), /销售原始值|用户问题|最终回答/);
```

- [x] **Step 2: Run tests and confirm RED**

Run: `node --test tests/ai-skill-loop.test.mjs tests/ai-api.test.mjs`

Expected: FAIL because the loop and audit table do not exist.

- [x] **Step 3: Implement the bounded loop**

Start with only Skills returned by `listAvailableSkills`. For each Provider call, collect function calls, reject unknown names, deduplicate `name + canonical JSON arguments`, execute at most six, and append the Provider output item plus `{ type: "function_call_output", call_id, output: JSON.stringify(safeResult) }` to the next input. Stop after two tool rounds and require a final text turn.

- [x] **Step 4: Emit safe activity and persist audit**

Send only `{ callId, skillId, appId, displayName, status, recordCount, updatedAt, errorCode }`. Store safe argument key names and bounded scalar filters, never the records. Update environment capabilities and regenerate platform manifests.

- [x] **Step 5: Run tests and commit**

Run: `node --test tests/ai-skill-loop.test.mjs tests/ai-api.test.mjs tests/ai-skills.test.mjs tests/ai-skills-business-apps.test.mjs`

Run: `npm run generate:platform-manifests && npm run check:environment-capabilities && npm run check:integrations`

Expected: all tests and platform checks PASS.

Commit: `feat(ai): run and audit read skills`

---

### Task 6: Render Skill activity in the assistant UI

**Files:**
- Modify: `src/state/aiAssistantApi.js`
- Modify: `src/state/AiAssistantProvider.jsx`
- Create: `src/features/ai-assistant/AiSkillActivity.jsx`
- Modify: `src/features/ai-assistant/AiConversation.jsx`
- Modify: `src/features/ai-assistant/AiAssistantWorkspace.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/ai-assistant-api.test.mjs`
- Test: `react-tests/ai-assistant-ui.test.mjs`

**Interfaces:**
- SSE activity item: `{ callId, skillId, appId, displayName, status, recordCount, updatedAt, errorCode }`.
- Assistant message adds `skillActivity: []`; current-session storage keeps only this safe metadata.

- [ ] **Step 1: Write failing parser and UI tests**

Assert new events parse, Provider reduces events by `callId`, and the UI includes accessible querying, success and failure labels without rendering raw result values.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test react-tests/ai-assistant-api.test.mjs react-tests/ai-assistant-ui.test.mjs`

Expected: FAIL because the browser ignores Skill events and no activity component exists.

- [ ] **Step 3: Extend the SSE client and state reducer**

Add the three event names to `KNOWN_EVENTS`. Upsert activity by `callId` with functional state updates; keep stable array order and cap at six.

- [ ] **Step 4: Add restrained activity UI**

During execution show one compact status line. After completion use a native `<details>` summary such as `已查询 3 个公司能力` and rows with App, Skill, status, count and date. Reuse existing success/warning/danger tokens, visible focus and no decorative animation.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test react-tests/ai-assistant-api.test.mjs react-tests/ai-assistant-ui.test.mjs`

Run: `npm run lint && npm run build`

Expected: tests, lint and build PASS.

Commit: `feat(ai): show skill query activity`

---

### Task 7: Update durable contracts, verify and deploy

**Files:**
- Modify: `docs/features/company-ai-assistant/plan.md`
- Modify: `docs/features/company-ai-assistant/tasks.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/environment-capabilities.json`

**Interfaces:**
- Documents the compatible SSE additions, Skill registry contract, D1 migration, errors, audit and rollback.

- [ ] **Step 1: Record finished contracts and task evidence**

Document `skill_started`, `skill_completed`, `skill_failed`, the seven Skill groups, `ai_skill_audit`, limits, compatibility and rollback. Mark each implementation task complete only after its focused command passes.

- [ ] **Step 2: Run the full repository gate**

Run:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
```

Expected: every command exits 0; test counts are recorded from fresh output.

- [ ] **Step 3: Run browser acceptance**

At 1440, 900, 640 and 390px verify ready/not-ready, long response scroll, manual upward scroll, “回到最新”, Enter, Shift+Enter, IME, Skill success, partial failure, stop/retry, keyboard focus, no horizontal overflow and zero console errors. Review the production build separately in DingTalk WebView dimensions.

- [ ] **Step 4: Apply production migration and deploy**

After explicit deployment authority already granted for this feature, apply `0004_company_ai_skills.sql`, deploy the built Pages artifact from the feature commit, and verify anonymous AI endpoints remain 401. Do not change Provider Secrets.

- [ ] **Step 5: Verify production runtime**

Use the authenticated production UI to run a question that requires at least two App Skills. Confirm activity, sources, answer and content-free D1 audit. Run:

```bash
npm run verify:production -- --require-platform cloudflare-pages --require-platform cloudflare-d1 --require-platform lingsuan-ai-gateway
```

If `PRODUCTION_DATA_ACCESS_TOKEN` is unavailable or any affected capability warns, report production verification as blocked rather than claiming full readiness.

- [ ] **Step 6: Commit delivery evidence**

Commit: `docs(ai): record readonly skill verification`
