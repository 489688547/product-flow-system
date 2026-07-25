# 专用浏览器采集器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Douyin MV3 long-running collection with a visible, persistent, store-scoped Chrome runtime that performs only short page actions while the local collector owns downloads, parsing, validation, retries, checkpoints, diagnostics, and governed API upload.

**Architecture:** Extend the existing CDP, web-collection control-plane, provider processor, and commerce-facts boundaries instead of creating a second task system. A managed Chrome process uses a non-default profile and localhost-only ephemeral DevTools port. The server assigns registered stores to an authenticated runner; the local runtime claims the existing store-scoped jobs and executes only registered Douyin actions. The MV3 bridge remains available for Kuaimai and rollback, but cannot claim Douyin jobs while dedicated mode is active.

**Tech Stack:** Node.js ESM, native WebSocket/CDP, Cloudflare Pages Functions, D1, React, Node test runner.

## Global Constraints

- Do not use the user's default Chrome profile.
- Do not upload cookies, tokens, credentials, HTML, arbitrary page text, screenshots, or local absolute paths.
- Browser and runner payloads never select a D1 binding or database ID.
- Fixed Provider origins, resource types, action schemas, and metric fields fail closed.
- Keep the existing Kuaimai extension path compatible.
- Use the same `web_collection_jobs` lease and state machine for mutual exclusion.
- Run each task test red before implementing the corresponding production code.
- Keep `docs/features/douyin-compass-collection/tasks.md` checkboxes current.
- Production release remains GitOps-only.

---

## Task 1: Extract a shared CDP session and managed Chrome supervisor

**Files:**

- Create: `scripts/browser-runtime/cdp.mjs`
- Create: `scripts/browser-runtime/managed-chrome.mjs`
- Create: `tests/managed-browser-runtime.test.mjs`
- Modify: `scripts/user-insights-collector/chrome-devtools.mjs`
- Modify: `scripts/data-connection-agent/chrome.mjs`
- Modify: `tests/chrome-devtools-browser.test.mjs`

- [x] Write tests that reject the default Chrome profile, a path outside the managed root, a non-loopback debugging address, and a missing store/profile identity.
- [x] Write tests for reading `DevToolsActivePort`, reusing a healthy managed process, detecting a stale process, and emitting only safe profile status.
- [x] Write CDP tests for command timeout, event subscription, target discovery, and download progress.
- [x] Run `node --test tests/managed-browser-runtime.test.mjs tests/chrome-devtools-browser.test.mjs` and confirm the new cases fail for the intended missing behavior.
- [x] Extract the existing private CDP session to `scripts/browser-runtime/cdp.mjs` while preserving the user-insights public interface.
- [x] Implement `managedChromeProfile({ providerId, storeId, rootDir })` and `ensureManagedChrome(...)` using a visible Chrome process, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=0`, and a non-default `user-data-dir`.
- [x] Refactor the data-connection agent to use the shared supervisor without changing its current launch contract.
- [x] Re-run the focused tests and confirm they pass.

## Task 2: Expose the runner's registered store assignments

**Files:**

- Modify: `functions/api/platform/v1/web-collection/jobs.js`
- Modify: `functions/api/platform/v1/web-collection/_shared/storage.js`
- Modify: `scripts/web-data-collector/api.mjs`
- Modify: `tests/web-collection-api.test.mjs`

- [x] Add API tests for `action=assigned_stores`: authenticated runner receives only enabled stores assigned to that runner and only the safe fields `providerId`, `storeId`, and `storeName`.
- [x] Add denial tests for unknown runners, disabled stores, unknown actions, and responses containing URL, credentials, cookies, tokens, or local paths.
- [x] Run `node --test tests/web-collection-api.test.mjs` and confirm the new cases fail.
- [x] Add a storage query scoped by `runner_id` and enabled state.
- [x] Add the runner-only action to the existing jobs endpoint and `api.assignedStores()`.
- [x] Re-run the API tests and confirm they pass.

## Task 3: Add the store-scoped profile registry and dedicated execution mode

**Files:**

- Create: `scripts/web-data-collector/browser/profile-registry.mjs`
- Create: `scripts/web-data-collector/browser/runtime.mjs`
- Modify: `scripts/web-data-collector/orchestrator.mjs`
- Modify: `scripts/web-data-collector/bridge.mjs`
- Modify: `scripts/web-data-collector/index.mjs`
- Modify: `tests/web-data-collector-runtime.test.mjs`
- Modify: `tests/web-data-collector-bridge.test.mjs`

- [x] Add tests for deterministic provider/store profile identity, duplicate store prevention, safe local-only metadata, and rejecting arbitrary profile directories.
- [x] Add tests proving dedicated mode claims Douyin with the registered `storeId`, while the extension bridge returns no Douyin task in dedicated mode and still serves non-Douyin/Kuaimai work.
- [x] Add tests proving both executors cannot claim the same job because they share the existing server lease.
- [x] Run the focused runtime and bridge tests and confirm the new cases fail.
- [x] Implement the local profile registry beneath the managed root; never serialize the absolute path into an API payload or log.
- [x] Add `--browser-mode=dedicated|extension` and a server-safe runner version string.
- [x] Add the dedicated loop: fetch assigned stores, ensure one store profile, claim with `storeId`, execute once, and submit through the current processor.
- [x] Gate only Douyin extension claims while dedicated mode is active; preserve Kuaimai.
- [x] Re-run the focused tests and confirm they pass.

## Task 4: Move Douyin short page actions into the local browser adapter

**Files:**

- Create: `scripts/web-data-collector/browser/providers/douyin.mjs`
- Create: `tests/douyin-dedicated-browser.test.mjs`
- Modify: `src/domain/webCollection.js`
- Modify: `scripts/web-data-collector/providers/douyin/index.mjs`
- Modify: `tests/web-data-collector-runtime.test.mjs`

- [x] Add contract tests for the four registered resources, fixed origins/routes, store/date matching, and the allowed result kinds: `downloaded`, `captured`, `waiting_human`, `schema_changed`, and `failed`.
- [x] Add security tests rejecting arbitrary URLs, scripts, selectors, page text, wrong store, wrong date, missing login, and unknown metric fields.
- [x] Add behavior tests for login required, email/SMS/slider/manual verification, page schema change, official report download, and the `store_daily` metric whitelist.
- [x] Run `node --test tests/douyin-dedicated-browser.test.mjs tests/web-data-collector-runtime.test.mjs` and confirm the new cases fail.
- [x] Implement fixed Douyin page classification and store identity verification.
- [x] Implement registered date-selection and export actions with bounded CDP commands.
- [x] Implement download behavior/events and return a local download handle only to the local runtime.
- [x] Implement `store_daily` fixed metric extraction without returning arbitrary DOM content.
- [x] Re-run the focused tests and confirm they pass.

## Task 5: Add durable local checkpoints and bounded recovery

**Files:**

- Create: `scripts/web-data-collector/checkpoints.mjs`
- Create: `scripts/web-data-collector/diagnostics.mjs`
- Modify: `scripts/web-data-collector/orchestrator.mjs`
- Modify: `scripts/web-data-collector/automation.mjs`
- Modify: `tests/web-data-collector-runtime.test.mjs`
- Modify: `tests/web-data-collector-automation.test.mjs`

- [x] Add tests for atomic checkpoint writes, restart recovery, download stability, idempotent submit, bounded retry, lease expiry, and preserving the last trusted batch.
- [x] Add tests proving human verification does not consume automatic retry attempts.
- [x] Add tests for encrypted local failure diagnostics, safe diagnostic IDs, registered-page-only screenshots, no server upload, and seven-day cleanup.
- [x] Run the focused tests and confirm the new cases fail.
- [ ] Implement checkpoint stages for `opening`, `waiting_download`, `downloaded`, `archived`, `parsed`, `validated`, `uploading`, and `submitted`.
- [x] Resume from the last safe local stage and rely on the existing job/batch idempotency keys during upload.
- [x] Implement local diagnostic encryption and retention cleanup; emit only diagnostic ID and stable error code to the server.
- [x] Re-run the focused tests and confirm they pass.

## Task 6: Surface actionable dedicated-browser state in Data Sync

**Files:**

- Modify: `src/domain/webCollection.js`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `tests/web-collection-api.test.mjs`
- Modify: `react-tests/data-governance-workspaces.test.mjs`
- Modify: `docs/platform/data-acquisition.md`
- Modify: `docs/features/douyin-compass-collection/tasks.md`

- [x] Add tests for the new safe statuses: browser online, login required, human verification required, page schema changed, local processing, and runner offline.
- [x] Add UI tests proving every failure has an actionable destination and that success, failure, waiting-human, and completed records remain visible.
- [x] Confirm filters change locally until the user clicks `查询` or `刷新`.
- [x] Run the focused domain/API/UI tests and confirm the new cases fail.
- [x] Map safe runtime/checkpoint state onto the existing sync record without exposing local paths or page data.
- [x] Replace generic “Chrome 采集中” copy with device/Profile/page/local-processing ownership and the exact recovery action.
- [x] Update the durable data-acquisition contract and task checkboxes.
- [x] Re-run the focused tests and confirm they pass.

## Task 7: Compatibility, local acceptance, and release handoff

**Files:**

- Modify only files required by failures discovered in this task.

- [x] Run `npm run test:web-collector`.
- [x] Run `npm run lint`.
- [x] Run `npm run check:governance`.
- [x] Run `npm run check:integrations`.
- [x] Run `npm run check:environment-capabilities`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run the Pages Functions build compatibility check used by the repository.
- [ ] Start the dedicated runtime against the authenticated local-online API.
- [ ] Verify a registered Douyin store opens in its managed visible profile, reports login/manual action accurately, and does not let the extension claim the same job.
- [ ] When the profile is logged in, execute the latest business-day four-resource collection and verify completed or safely failed records in Data Sync and completed batches in D1.
- [ ] Record evidence in the backlog item and submit it for review. Do not disable the MV3 rollback path until seven consecutive business days pass.
