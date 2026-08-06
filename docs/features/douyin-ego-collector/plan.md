# Douyin Ego-Only Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route registered Douyin collection jobs through the already-authenticated Ego task space, classify browser states truthfully, and preserve local evidence until the Aliyun ECS/SQLite transaction confirms success.

**Architecture:** The collector invokes the supported `ego-browser nodejs` CLI through a bounded local process protocol. A provider-specific Ego module owns task-space navigation, stable store identification, page classification, and download initiation; the existing collector continues to own leases, checkpoints, parsing, archives, uploads, and completion. Formal Ego service mode is blocked unless the configured service base URL is the approved Aliyun runtime; before cutover, a local one-job probe may stop at `pending_upload` without writing D1.

**Tech Stack:** Node.js ESM, Node test runner, Ego browser CLI and task spaces, existing web-collection runner, macOS LaunchAgent, existing Douyin parsers and commerce-facts ingest API.

## Global Constraints

- Douyin tasks use Ego only and never fall back to Google Chrome or the MV3 extension.
- Kuaimai continues to use the existing Chrome MV3 extension.
- Browser inputs contain no remote URL, selector, script, credential, Cookie, token, database ID, or binding.
- A stable `storeId` from the registered Douyin shop-management page is required before collection.
- `DOUYIN_PAGE_SCHEMA_CHANGED` is legal only after expected origin, authenticated identity, complete document, stable page, and missing registered resource sentinels are all proven.
- Login and human verification do not auto-retry; network and file waits use the existing bounded retry policy.
- Cloudflare D1 receives no collection writes from the Ego path; non-Aliyun formal configuration fails closed.
- The first real validation is one store and one `video_daily` task.
- Do not stage or modify the user's `.DS_Store` in the primary checkout.

---

## File Structure

- `scripts/browser-runtime/ego-cli.mjs`: validates the Ego executable and runs one bounded Ego Node process with a strict JSON result.
- `scripts/web-data-collector/browser/providers/douyinEgoState.mjs`: pure task validation, stable store parsing, and page-state classification.
- `scripts/web-data-collector/browser/providers/douyinEgoTask.mjs`: Ego task-space workflow using injected Ego helpers.
- `scripts/web-data-collector/browser/ego-runtime.mjs`: assigned-store runtime that invokes Ego and submits existing collector result shapes.
- `scripts/web-data-collector/ego-probe.mjs`: one-job local probe that stops at a local checkpoint and never completes a remote task.
- `scripts/web-data-collector/index.mjs`: adds explicit `ego` mode and `probe-ego` command.
- `scripts/web-data-collector/automation.mjs`: persists the absolute Ego CLI path and `ego` mode in the LaunchAgent.
- `scripts/switch-collector-to-ego.sh`: guarded operator switch that refuses Cloudflare production as a formal write target.
- `src/domain/collectionFailureExplainer.js`: human-readable Ego and page-load errors.
- `docs/platform/data-acquisition.md`, `docs/platform/apis/web-collection-v1.md`, `docs/platform/integration-registry.json`, `docs/platform/environment-capabilities.json`: durable Ego-only and Aliyun target rules.
- `tests/ego-cli-runtime.test.mjs`, `tests/douyin-ego-browser.test.mjs`: new focused tests.
- Existing runtime, automation, failure-explainer, environment, and integration tests: regression coverage.

### Task 1: Safe Ego CLI Process Boundary

**Files:**
- Create: `scripts/browser-runtime/ego-cli.mjs`
- Create: `tests/ego-cli-runtime.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateEgoExecutable(value: string): string`.
- Produces: `buildEgoBootstrap(moduleUrl: string): string`.
- Produces: `createEgoCliRunner(options).run({ moduleUrl, input }): Promise<EgoResult>`.
- `EgoResult` is exactly one object with `kind`, optional `errorCode`, `safeSummary`, and registered result fields.

- [ ] **Step 1: Write executable and protocol rejection tests**

```js
test("Ego runner requires an absolute executable and one safe JSON result", async () => {
  assert.throws(() => validateEgoExecutable("ego-browser"), /绝对路径/);
  const runner = createEgoCliRunner({
    executable: "/Users/company/.local/bin/ego-browser",
    spawn: fakeEgoProcess({ stdout: "noise\n{}\n" })
  });
  await assert.rejects(
    runner.run({ moduleUrl: "file:///repo/douyinEgoTask.mjs", input: safeTask }),
    error => error.code === "EGO_PROTOCOL_INVALID"
  );
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/ego-cli-runtime.test.mjs`

Expected: FAIL because `scripts/browser-runtime/ego-cli.mjs` does not exist.

- [ ] **Step 3: Implement bounded spawn, output limit, timeout, and JSON validation**

```js
export function createEgoCliRunner({ executable, spawn = spawnNode, timeoutMs = 120_000, maxOutputBytes = 1_048_576 }) {
  const binary = validateEgoExecutable(executable);
  return Object.freeze({
    async run({ moduleUrl, input }) {
      const child = spawn(binary, ["nodejs"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: egoChildEnvironment(process.env, input)
      });
      child.stdin.end(buildEgoBootstrap(moduleUrl));
      return readSingleEgoResult(child, { timeoutMs, maxOutputBytes });
    }
  });
}
```

The child environment retains only the runtime values required by Ego plus a base64-encoded, validated task. The bootstrap imports the fixed local module URL, passes preloaded Ego helpers explicitly, calls `cliLog(JSON.stringify(result))`, and never evaluates task-supplied code.

- [ ] **Step 4: Add timeout, output overflow, non-zero exit, and sensitive-field tests**

Run: `node --test tests/ego-cli-runtime.test.mjs`

Expected: PASS with cases for `EGO_TIMEOUT`, `EGO_OUTPUT_LIMIT_EXCEEDED`, `EGO_PROCESS_FAILED`, `EGO_PROTOCOL_INVALID`, and a valid result.

- [ ] **Step 5: Register the test in `test:web-collector` and commit**

```bash
git add scripts/browser-runtime/ego-cli.mjs tests/ego-cli-runtime.test.mjs package.json
git commit -m "feat(collector): add bounded Ego CLI runtime"
```

### Task 2: Truthful Douyin Page State and Stable Store Identity

**Files:**
- Create: `scripts/web-data-collector/browser/providers/douyinEgoState.mjs`
- Create: `tests/douyin-ego-browser.test.mjs`
- Modify: `tests/douyin-dedicated-browser.test.mjs`

**Interfaces:**
- Produces: `validateDouyinEgoTask(value): DouyinTask`.
- Produces: `parseDouyinStoreIdentityText(value): { providerId, storeId, storeName } | null`.
- Produces: `classifyDouyinEgoSnapshot(snapshot, context): EgoPageClassification`.
- `context` contains `elapsedMs`, `loadTimeoutMs`, `expectedStoreId`, and `identityVerified`.

- [ ] **Step 1: Write the delayed-login regression test**

```js
test("empty report shell followed by login is not a schema change", () => {
  assert.deepEqual(classifyDouyinEgoSnapshot(emptyShell, {
    elapsedMs: 12_000, loadTimeoutMs: 45_000, expectedStoreId: "90862283", identityVerified: true
  }), { state: "loading" });
  assert.deepEqual(classifyDouyinEgoSnapshot(loginSnapshot, {
    elapsedMs: 15_000, loadTimeoutMs: 45_000, expectedStoreId: "90862283", identityVerified: true
  }), { state: "login_required", errorCode: "DOUYIN_LOGIN_REQUIRED" });
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `node --test tests/douyin-ego-browser.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the explicit classification order**

```js
export function classifyDouyinEgoSnapshot(snapshot, context) {
  if (isLogin(snapshot)) return result("login_required", "DOUYIN_LOGIN_REQUIRED");
  if (needsHuman(snapshot)) return result("human_verification", "DOUYIN_HUMAN_VERIFICATION_REQUIRED");
  if (!expectedOrigin(snapshot)) return result("unexpected_navigation", "DOUYIN_NAVIGATION_UNEXPECTED");
  if (!context.identityVerified) return result("store_identity_unavailable", "DOUYIN_STORE_IDENTITY_UNAVAILABLE");
  if (stillLoading(snapshot) && context.elapsedMs < context.loadTimeoutMs) return { state: "loading" };
  if (stillLoading(snapshot)) return result("load_timeout", "DOUYIN_PAGE_LOAD_TIMEOUT");
  if (!registeredResourceSentinels(snapshot)) return result("schema_changed", "DOUYIN_PAGE_SCHEMA_CHANGED");
  return { state: "ready", storeId: context.expectedStoreId };
}
```

- [ ] **Step 4: Add store-management fixtures and classification table tests**

Cover exact store ID, wrong store, missing ID, login, verification, blank timeout, unexpected origin, stable missing sentinel, and ready page.

Run: `node --test tests/douyin-ego-browser.test.mjs tests/douyin-dedicated-browser.test.mjs`

Expected: PASS; the old dedicated classifier remains unchanged until formal routing is removed.

- [ ] **Step 5: Commit the pure state layer**

```bash
git add scripts/web-data-collector/browser/providers/douyinEgoState.mjs tests/douyin-ego-browser.test.mjs tests/douyin-dedicated-browser.test.mjs
git commit -m "fix(douyin): distinguish login load and schema states"
```

### Task 3: Ego Task Space, Ownership, and Store Binding

**Files:**
- Create: `scripts/web-data-collector/browser/providers/douyinEgoTask.mjs`
- Modify: `scripts/web-data-collector/checkpoints.mjs`
- Modify: `tests/douyin-ego-browser.test.mjs`
- Modify: `tests/web-data-collector-checkpoints.test.mjs`

**Interfaces:**
- Consumes: `validateDouyinEgoTask`, `parseDouyinStoreIdentityText`, and `classifyDouyinEgoSnapshot` from Task 2.
- Produces: `egoTaskSpaceName({ providerId, storeId }): string`.
- Produces: `executeDouyinEgoTask({ task, control }, helpers): Promise<EgoResult>`.
- `control.explicitHumanRetry` is local-only. It is true only when the runtime loads a preserved
  `waiting_human` checkpoint for the same job after the server has manually requeued that job.
  It is never accepted from the remote task payload or an environment variable.
- `helpers` explicitly contains `listTaskSpaces`, `useOrCreateTaskSpace`, `claimTaskSpace`, `handOffTaskSpace`, `openOrReuseTab`, `gotoAndWait`, `pageInfo`, `js`, `cdp`, `wait`, and `completeTaskSpace`.

- [ ] **Step 1: Write tests for deterministic space reuse and explicit user confirmation**

```js
test("waiting-human retry claims the same store space only after server requeue", async () => {
  const helpers = egoHelpers({ ownership: "user" });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: true }
  }, helpers);
  assert.deepEqual(helpers.calls[0], ["claimTaskSpace", 41]);
  assert.equal(result.kind, "download_capability_check");
});
```

Also assert that an automatic attempt with a user-owned space returns `EGO_TASK_SPACE_USER_CONTROLLED`
without calling `claimTaskSpace`, and that a remote task field named `explicitHumanRetry` is rejected as
an unregistered field.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/douyin-ego-browser.test.mjs`

Expected: FAIL because the task-space module is absent.

- [ ] **Step 3: Implement store-first navigation**

Use fixed URLs only:

```js
const STORE_IDENTITY_URL = "https://fxg.jinritemai.com/ffa/grs-new/qualification/common-tools";
const RESOURCE_URLS = Object.freeze({
  store_daily: "https://compass.jinritemai.com/shop",
  product_daily: "https://compass.jinritemai.com/shop/merchandise-traffic",
  live_daily: "https://compass.jinritemai.com/shop/live-overview",
  video_daily: "https://compass.jinritemai.com/shop/video/overview"
});
```

Open the identity page, parse stable `storeId`, compare with the task, then open the resource. On login or verification, call `handOffTaskSpace(taskSpaceId)` and return `waiting_human`; on mismatch return `DOUYIN_STORE_MISMATCH` before resource navigation.

Extend the local checkpoint schema with stage `waiting_human` and a bounded, non-sensitive
`resume.humanWait` object containing only `errorCode` and `taskSpaceName`. The task-space name is the
deterministic provider/store binding, not an Ego numeric ID. This checkpoint is the only source of the
local retry control bit.

- [ ] **Step 4: Verify ownership, wrong-store, and no-fallback behavior**

Run: `node --test tests/douyin-ego-browser.test.mjs tests/web-data-collector-checkpoints.test.mjs`

Expected: PASS; no test double records a Google Chrome spawn or extension bridge call.

- [ ] **Step 5: Commit Task Space execution**

```bash
git add scripts/web-data-collector/browser/providers/douyinEgoTask.mjs scripts/web-data-collector/checkpoints.mjs tests/douyin-ego-browser.test.mjs tests/web-data-collector-checkpoints.test.mjs
git commit -m "feat(douyin): bind collection to Ego task spaces"
```

### Task 4: Controlled Download Capability and Local One-Job Probe

**Files:**
- Create: `scripts/web-data-collector/ego-probe.mjs`
- Modify: `scripts/web-data-collector/browser/providers/douyinEgoTask.mjs`
- Modify: `scripts/web-data-collector/index.mjs`
- Modify: `tests/douyin-ego-browser.test.mjs`
- Modify: `tests/web-data-collector-runtime.test.mjs`

**Interfaces:**
- Produces: `configureEgoDownload({ cdp, workspace }): Promise<void>`.
- Produces: `waitForStableEgoDownload({ workspace, startedAt, timeoutMs }): Promise<{ filePath, safeFileName }>`.
- Produces CLI: `node scripts/web-data-collector/index.mjs probe-ego --store-id ID --resource video_daily --business-date YYYY-MM-DD --ego-cli /absolute/path`.
- Probe result ends as `downloaded`, `parsed`, `pending_upload`, or a stable error. It never calls `orchestrator.complete`.

- [ ] **Step 1: Write capability and real-file tests**

```js
test("download success requires a new stable file inside the task workspace", async () => {
  const result = await waitForStableEgoDownload({ workspace, startedAt, timeoutMs: 2_000 });
  assert.equal(result.safeFileName, "采集-video-20260803-20260803.xlsx");
  assert.equal(result.filePath.startsWith(`${workspace}/`), true);
});
```

Reject pre-existing files, path escape, partial download suffixes, zero-byte files, and files whose size is still changing.

- [ ] **Step 2: Run tests and confirm missing capability functions**

Run: `node --test tests/douyin-ego-browser.test.mjs tests/web-data-collector-runtime.test.mjs`

Expected: FAIL on missing download/probe exports.

- [ ] **Step 3: Implement the capability gate before any export action**

Call `Browser.setDownloadBehavior` with `behavior: "allow"`, the task workspace, and download events enabled. If Ego returns a protocol/domain error, return:

```js
{
  kind: "failed",
  errorCode: "EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE",
  safeSummary: "当前 Ego 版本无法提供受控下载目录，采集已停止。",
  stage: "opening"
}
```

Do not invoke the registered export or self-service action after this error.

- [ ] **Step 4: Implement `probe-ego` as a local-only command**

The command validates one fixed task, creates a `0600` checkpoint under the collector runtime root, runs the existing Douyin parser and archive flow, and records `pending_upload` when no approved Aliyun base URL is configured. It does not claim, transition, or complete a production job.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/ego-cli-runtime.test.mjs tests/douyin-ego-browser.test.mjs tests/web-data-collector-runtime.test.mjs`

Expected: PASS.

```bash
git add scripts/web-data-collector/ego-probe.mjs scripts/web-data-collector/browser/providers/douyinEgoTask.mjs scripts/web-data-collector/index.mjs tests/douyin-ego-browser.test.mjs tests/web-data-collector-runtime.test.mjs
git commit -m "feat(douyin): add controlled Ego download probe"
```

### Task 5: Formal Ego Runtime and No-Chrome Routing

**Files:**
- Create: `scripts/web-data-collector/browser/ego-runtime.mjs`
- Modify: `scripts/web-data-collector/index.mjs`
- Modify: `scripts/web-data-collector/orchestrator.mjs`
- Modify: `scripts/web-data-collector/bridge.mjs`
- Modify: `scripts/web-data-collector/checkpoints.mjs`
- Modify: `tests/web-data-collector-runtime.test.mjs`
- Modify: `tests/web-data-collector-bridge.test.mjs`
- Modify: `tests/web-data-collector-checkpoints.test.mjs`

**Interfaces:**
- Produces: `createEgoBrowserRuntime({ api, orchestrator, executeTask, checkpointStore })`.
- Adds `browserMode: "ego"`.
- Keeps existing result types `downloaded`, `captured`, `waiting_human`, `failed`, and `schema_changed` so provider processors do not fork.

- [ ] **Step 1: Write routing tests before changing the runtime**

```js
test("ego mode reserves Douyin and leaves Kuaimai on the extension", async () => {
  assert.equal(await bridge.next(douyinTask), null);
  assert.equal((await bridge.next(kuaimaiTask)).providerId, "kuaimai");
  assert.equal((await egoRuntime.runOnce()).processed, 1);
  assert.equal(chromeSpawns.length, 0);
});
```

- [ ] **Step 2: Run routing tests and confirm `ego` is not recognized**

Run: `node --test tests/web-data-collector-runtime.test.mjs tests/web-data-collector-bridge.test.mjs`

Expected: FAIL because mode normalization falls back to `extension`.

- [ ] **Step 3: Add explicit three-value mode parsing and Ego runtime wiring**

```js
export function normalizeBrowserMode(value) {
  if (["extension", "dedicated", "ego"].includes(value)) return value;
  throw Object.assign(new Error("浏览器模式无效。"), { code: "WEB_COLLECTION_BROWSER_MODE_INVALID" });
}
```

`ego` mode creates no managed Chrome registry and never calls `ensureManagedChrome`. The bridge continues serving Kuaimai but withholds Douyin exactly as dedicated mode does today.

- [ ] **Step 4: Verify checkpoint resume and result submission**

When the Ego result is `waiting_human`, submit that terminal state to the server but retain a local
`waiting_human` checkpoint without the terminal result. The server contract already prevents automatic
retry of human states; its existing `force: true` trigger requeues the same job ID. Only when that same
job is claimed again may the runtime derive `control.explicitHumanRetry = true`, remove the human-wait
marker before browser execution, and claim the same deterministic Ego task space. Any other queued job
gets `false`.

Cover downloaded checkpoint resume, `waiting_human` checkpoint retention, same-job manual requeue,
unrelated-job rejection, non-retryable schema change, task-space process crash, and successful processor
completion.

Run: `npm run test:web-collector`

Expected: PASS with the new Ego tests included.

- [ ] **Step 5: Commit formal runtime routing**

```bash
git add scripts/web-data-collector/browser/ego-runtime.mjs scripts/web-data-collector/index.mjs scripts/web-data-collector/orchestrator.mjs scripts/web-data-collector/bridge.mjs scripts/web-data-collector/checkpoints.mjs tests/web-data-collector-runtime.test.mjs tests/web-data-collector-bridge.test.mjs tests/web-data-collector-checkpoints.test.mjs
git commit -m "feat(collector): route Douyin exclusively through Ego"
```

### Task 6: Aliyun Activation Gate, LaunchAgent, and Operator Switch

**Files:**
- Modify: `scripts/web-data-collector/automation.mjs`
- Modify: `scripts/web-data-collector/index.mjs`
- Create: `scripts/switch-collector-to-ego.sh`
- Modify: `tests/web-data-collector-automation.test.mjs`
- Modify: `tests/web-data-collector-runtime.test.mjs`

**Interfaces:**
- Produces: `assertAliyunCollectorTarget({ baseUrl, browserMode, allowLocalProbe }): void`.
- LaunchAgent arguments include `--browser-mode ego` and `--ego-cli /absolute/path`.
- Formal `serve --browser-mode ego` rejects Cloudflare Pages and arbitrary public IP targets.

- [ ] **Step 1: Write fail-closed target and plist tests**

```js
test("formal Ego service refuses Cloudflare while local probe may remain pending", () => {
  assert.throws(
    () => assertAliyunCollectorTarget({ baseUrl: "https://deshan-tiyes.cn", browserMode: "ego" }),
    error => error.code === "EGO_FORMAL_TARGET_NOT_ALIYUN"
  );
});
```

Assert the plist contains the exact validated Ego executable and no secret, Cookie, Task Space ID, or local worktree entrypoint.

- [ ] **Step 2: Run automation tests and confirm failure**

Run: `node --test tests/web-data-collector-automation.test.mjs tests/web-data-collector-runtime.test.mjs`

Expected: FAIL because the `ego` mode and target gate are absent.

- [ ] **Step 3: Implement install and switch guards**

`switch-collector-to-ego.sh` must verify the primary repository path, current code fingerprint, Ego executable, current base URL, LaunchAgent mode, process PID, loopback bridge, and log output. It must exit before changing the plist if the formal Aliyun URL is unavailable. It may print the exact `probe-ego` command for local one-job validation.

- [ ] **Step 4: Run shell syntax and automation tests**

Run: `bash -n scripts/switch-collector-to-ego.sh && node --test tests/web-data-collector-automation.test.mjs tests/web-data-collector-runtime.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the activation boundary**

```bash
git add scripts/web-data-collector/automation.mjs scripts/web-data-collector/index.mjs scripts/switch-collector-to-ego.sh tests/web-data-collector-automation.test.mjs tests/web-data-collector-runtime.test.mjs
git commit -m "feat(collector): gate Ego service on Aliyun target"
```

### Task 7: Error Copy and Durable Integration Rules

**Files:**
- Modify: `src/domain/collectionFailureExplainer.js`
- Modify: `react-tests/collection-failure-explainer.test.mjs`
- Modify: `docs/platform/data-acquisition.md`
- Modify: `docs/platform/apis/web-collection-v1.md`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `functions/api/platform/_generated/environmentCapabilities.js`
- Modify: `tests/integration-registry.test.mjs`
- Modify: `tests/environment-capabilities.test.mjs`

**Interfaces:**
- Registers `EGO_UNAVAILABLE`, `EGO_TASK_SPACE_USER_CONTROLLED`, `EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE`, `DOUYIN_PAGE_LOAD_TIMEOUT`, and `EGO_FORMAL_TARGET_NOT_ALIYUN`.
- Changes the Douyin integration summary from Chrome-first to Ego-only while preserving Kuaimai Chrome relations.

- [ ] **Step 1: Write copy and registry tests**

```js
test("Ego unavailable points to Ego and never suggests Chrome retry", () => {
  const result = explainCollectionFailure({ errorCode: "EGO_UNAVAILABLE", stage: "opening" });
  assert.match(result.action, /打开 Ego/);
  assert.doesNotMatch(result.action, /Chrome/);
});
```

- [ ] **Step 2: Run domain and registry tests and confirm old Chrome-first rules fail**

Run: `node --test react-tests/collection-failure-explainer.test.mjs tests/integration-registry.test.mjs tests/environment-capabilities.test.mjs`

Expected: FAIL on missing Ego errors and Chrome-first registry assertions.

- [ ] **Step 3: Update durable rules and regenerate capabilities**

Document authentication, task-space ownership, stable store ID, download evidence, retry classes, local pending upload, Aliyun activation, no-D1 write, compatibility, and rollback. Run the repository generator instead of editing generated capability output by hand.

- [ ] **Step 4: Run governance checks**

Run: `npm run check:integrations && npm run check:environment-capabilities && npm run check:governance`

Expected: PASS.

- [ ] **Step 5: Commit rules and error copy**

```bash
git add src/domain/collectionFailureExplainer.js react-tests/collection-failure-explainer.test.mjs docs/platform/data-acquisition.md docs/platform/apis/web-collection-v1.md docs/platform/integration-registry.json docs/platform/environment-capabilities.json functions/api/platform/_generated/environmentCapabilities.js tests/integration-registry.test.mjs tests/environment-capabilities.test.mjs
git commit -m "docs(collector): make Ego the Douyin execution rule"
```

### Task 8: Full Verification and One-Job Acceptance

**Files:**
- Modify: `docs/features/douyin-ego-collector/tasks.md`
- Modify: `docs/features/douyin-ego-collector/design.md` only if verified behavior differs from the approved design.

**Interfaces:**
- Consumes all previous tasks.
- Produces a local evidence record containing job ID, resource, business date, executor, file hash, archive ID, parsed row count, upload batch ID, database row count, and validation summary. It contains no credential or page body.

- [ ] **Step 1: Run focused and complete local gates**

```bash
node --test tests/ego-cli-runtime.test.mjs tests/douyin-ego-browser.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run a read-only Ego identity and download capability probe**

Run the new `probe-ego` command for store `90862283`, resource `video_daily`, and one explicitly selected business date. Stop before export if stable store identity or controlled download capability is unavailable.

Expected: executor is `ego`, stable store ID matches, and no Google Chrome process is launched.

- [ ] **Step 3: Run exactly one local `video_daily` probe**

Confirm the exact business date with the user, then execute one probe. Do not enqueue other resources or dates.

Expected before Aliyun cutover: `pending_upload` with a real file, content hash, archive ID, parsed row count, and no Cloudflare ingest request.

- [ ] **Step 4: Complete formal acceptance only when the Aliyun endpoint is reachable**

After ICP/domain cutover or an approved private network route, point the collector at the approved ECS base URL and rerun exactly one task.

Expected: ECS returns a commerce fact batch ID, accepted row count, and validation summary; SQLite verification confirms the batch; only then does the task become `success` and advance its cursor.

- [ ] **Step 5: Update the task evidence and commit**

Record safe command results and counts in `tasks.md`; do not record secrets, full page text, local absolute Profile paths, or raw provider responses.

```bash
git add docs/features/douyin-ego-collector/tasks.md docs/features/douyin-ego-collector/design.md
git commit -m "test(collector): record Ego single-job acceptance"
```

## Pull Request Handoff

The PR targets `dev` and declares:

```text
Integration-Impact: douyin-ecommerce, erp-file-import, kuaimai, aliyun, cloudflare-pages, cloudflare-d1
Integration-Impact-Reason: Douyin execution moves to Ego only; Kuaimai remains on MV3; files reuse the existing parser/archive boundary; formal facts require the Aliyun runtime; Cloudflare remains rollback-only and receives no Ego collection writes.
Rule-Writeback: docs/platform/data-acquisition.md, docs/platform/apis/web-collection-v1.md, docs/platform/integration-registry.json
Rule-Writeback-Reason: Browser ownership, error classification, data destination, retry, and rollback rules change at the shared provider boundary.
```
