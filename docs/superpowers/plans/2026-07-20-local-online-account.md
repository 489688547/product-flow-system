# 本地线上账号一致性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run local code with the product owner's real production identity, data, and external-provider permissions while keeping the personal token server-only and localhost-only.

**Architecture:** Wrangler Pages Dev is the complete local backend while Vite is the single browser entry and proxies `/api` to Wrangler for hot frontend updates. API middleware validates the ignored local personal token against remote production D1, injects the real organization member as a normal session, then lets every existing API route apply the same business and provider rules used after deployment.

**Tech Stack:** React 19, Vite, Cloudflare Pages Functions, Wrangler, Cloudflare D1, Node test runner.

## Global Constraints

- The only behavior difference between local and production is whether the code has been deployed.
- The raw personal token stays in ignored `.env` and server-side Worker bindings; never return or log it.
- Local online identity injection is allowed only for `localhost`, `127.0.0.1`, or `::1` and `LOCAL_ONLINE_ACCOUNT_MODE=1`.
- GET and HEAD require token capability `read`; all mutation methods require `write`.
- Real DingTalk and Kuaimai actions use existing production adapters and route authorization; no local blanket block remains in the supported runtime.
- No automated test creates a real todo, calendar event, or Kuaimai action.

---

### Task 1: Token-backed local session

**Files:**
- Modify: `tests/production-data-access.test.mjs`
- Modify: `tests/dingtalk-web-auth.test.mjs`
- Modify: `functions/api/platform/_shared/productionDataAccess.js`
- Modify: `functions/api/_middleware.js`

**Interfaces:**
- Produces: `authorizeProductionToken(rawToken, db, { capability, now })` returning `{ tokenHash, capabilities, corpId, userId, unionId, name, department, title, role }`.
- Produces: `context.data.session.loginMode === "local-online-account"` for authorized loopback requests.

- [ ] **Step 1: Write failing authorization tests**

Add cases that expect the token helper to return organization fields from `product_flow_org_members`, not the name stored in the token row, and to reject a read-only token for `write`.

```js
const access = await authorizeProductionToken("personal-token", db, { capability: "read", now });
assert.deepEqual(access, {
  tokenHash: await hashSecret("personal-token"), capabilities: ["read", "write"],
  corpId: "corp-main", userId: "u-zhou", unionId: "union-zhou",
  name: "周荣庆", department: "总经办", title: "总经理", role: "executive"
});
```

- [ ] **Step 2: Run the authorization test and confirm RED**

Run: `node --test tests/production-data-access.test.mjs`

Expected: FAIL because `authorizeProductionToken` is not exported and current identity query omits organization fields.

- [ ] **Step 3: Implement the reusable raw-token helper**

Move the existing hash, token row, capability, active executive identity, and `last_used_at` logic into `authorizeProductionToken`. Keep `authorizeProductionAccess(request, db, options)` as a compatibility wrapper that extracts the Bearer token and calls the new helper.

- [ ] **Step 4: Write failing middleware tests**

Cover loopback GET with `read`, loopback POST with `write`, missing token, read-only mutation, and production hostname.

```js
const env = {
  LOCAL_ONLINE_ACCOUNT_MODE: "1",
  PRODUCTION_DATA_ACCESS_TOKEN: "personal-token",
  PRODUCT_FLOW_DB: createProductionIdentityD1Mock()
};
assert.equal((await apiMiddleware(localPostContext(env))).status, 200);
assert.equal(localPostContext.data.session.loginMode, "local-online-account");
assert.equal((await apiMiddleware(productionHostContext(env))).status, 401);
```

- [ ] **Step 5: Replace the hard-coded preview identity**

Delete `LOCAL_LIVE_PREVIEW_SESSION` and the non-GET 403. Add async localhost authorization using `env.PRODUCTION_DATA_ACCESS_TOKEN`, `env.PRODUCT_FLOW_DB`, and the request-method capability mapping. Convert known production-access errors to safe JSON responses with their stable codes.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test tests/production-data-access.test.mjs tests/dingtalk-web-auth.test.mjs`

Expected: all tests pass; no `local-live-d1-preview` or hard-coded identity remains in middleware.

Commit: `feat(auth): use real account in local online mode`

### Task 2: Complete local runtime

**Files:**
- Create: `tests/local-online-start.test.mjs`
- Create: `scripts/start-local-online.mjs`
- Modify: `package.json`
- Modify: `启动服务.command`
- Modify: `.env.example`
- Modify: `wrangler.toml`

**Interfaces:**
- Produces: `npm start` and the Finder launcher at `http://127.0.0.1:8127`.
- Consumes: local `.env`, Vite browser port 8127, Wrangler Pages Functions port 8132.

- [ ] **Step 1: Write the failing launcher contract**

Assert the parent script starts Wrangler Pages Dev on 8132, waits for that port, starts Vite on 8127 with `VITE_API_TARGET` pointing to Wrangler, requires the ignored root `.env` that Wrangler loads into Pages Functions, forwards termination, and that `npm start` points to the script.

- [ ] **Step 2: Run the launcher test and confirm RED**

Run: `node --test tests/local-online-start.test.mjs`

Expected: FAIL because the script and package wiring do not exist.

- [ ] **Step 3: Implement the process supervisor**

Use `node:child_process.spawn` with inherited stdio, a bounded `node:net` port readiness check, and signal handlers that terminate both children. Exit non-zero if either child fails unexpectedly.

- [ ] **Step 4: Wire configuration and launcher**

Set `LOCAL_ONLINE_ACCOUNT_MODE = "1"` in `wrangler.toml`, replace `LOCAL_LIVE_D1_PREVIEW`, document the two server-only local variables in `.env.example`, and make the Finder launcher call `npm start`.

- [ ] **Step 5: Run the contract and smoke start**

Run: `node --test tests/local-online-start.test.mjs`

Then run `npm start`, request `http://127.0.0.1:8127/api/auth/session`, and stop the process. Expected: one accessible URL, real account session, both child processes exit together.

- [ ] **Step 6: Commit**

Commit: `feat(dev): run full pages stack locally`

### Task 3: Visible real-environment state

**Files:**
- Create: `react-tests/local-online-account-ui.test.mjs`
- Create: `src/ui/LocalOnlineEnvironmentBanner.jsx`
- Modify: `react-tests/local-dev-login.test.mjs`
- Modify: `src/state/AuthProvider.jsx`
- Modify: `src/App.jsx`
- Modify: the global stylesheet imported by `src/main.jsx`

**Interfaces:**
- Consumes: `sessionUser.loginMode`, `sessionUser.name`.
- Produces: `LocalOnlineEnvironmentBanner({ sessionUser })`.

- [ ] **Step 1: Write failing UI source contracts**

Assert `AuthProvider` has no `LOCAL_USER` fallback, the banner renders only for `local-online-account`, App mounts it above page content, and mobile CSS wraps without fixed positioning.

- [ ] **Step 2: Run the UI tests and confirm RED**

Run: `node --test react-tests/local-online-account-ui.test.mjs react-tests/local-dev-login.test.mjs`

- [ ] **Step 3: Remove fake-browser fallback and add the banner**

On localhost session failure, keep the real error state and retry path. Render:

```jsx
<div className="local-online-environment" role="status">
  <strong>本地代码 · 线上真实环境</strong>
  <span>当前账号：{sessionUser.name}。数据修改、钉钉和快麦操作都会立即在线上生效。</span>
</div>
```

- [ ] **Step 4: Add responsive styles and run tests**

Use normal document flow, visible risk contrast, `overflow-wrap:anywhere`, and a 760px media query. Run the focused React tests and `npm run build`.

- [ ] **Step 5: Commit**

Commit: `feat(ui): show local online environment`

### Task 4: Durable environment and integration governance

**Files:**
- Modify: `AGENTS.md`
- Modify: `.agents/skills/environment-parity/SKILL.md`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/architecture.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/middleware.md`
- Modify: `docs/platform/integrations.md`
- Modify: `docs/platform/environment-readiness.md`
- Modify: `docs/platform/error-codes.md`
- Create: `docs/decisions/2026-07-20-local-online-account.md`
- Regenerate: `functions/api/platform/_generated/environmentCapabilities.js`
- Regenerate: `functions/api/platform/_generated/integrationRegistry.js`

**Interfaces:**
- Produces: development capability `local-online-account` and replaces registry env var `LOCAL_LIVE_D1_PREVIEW` with `LOCAL_ONLINE_ACCOUNT_MODE` plus `PRODUCTION_DATA_ACCESS_TOKEN`.

- [ ] **Step 1: Update source-of-truth rules**

Document that local online mode is a production-authenticated application runtime, not the cross-environment repair gateway. Database and provider actions remain separate route boundaries but both use the real session; local hostname alone never grants either.

- [ ] **Step 2: Regenerate manifests**

Run: `npm run generate:platform-manifests`

- [ ] **Step 3: Scan away obsolete rules**

Run: `git grep -n -E 'LOCAL_LIVE_D1_PREVIEW|local-live-d1-preview|EXTERNAL_ACTION_DISABLED_IN_TEST|测试环境只允许修改数据库|本地钉钉真实写操作保持禁止' -- ':!docs/features/environment-parity-production-data/tasks.md'`

Expected: no executable or durable-rule matches.

- [ ] **Step 4: Run governance checks and commit**

Run: `npm run check:environment-capabilities && npm run check:governance && npm run check:integrations`

Commit: `docs: govern local online account parity`

### Task 5: Full verification and release

**Files:**
- Modify only task checkboxes/evidence and generated release assets required by the repository release command.

**Interfaces:**
- Consumes all prior tasks; produces a mergeable, deployable branch.

- [ ] **Step 1: Run the complete definition of done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

- [ ] **Step 2: Perform local evidence checks**

Verify the session endpoint returns the real identity and `local-online-account`; verify a normal production-data write path reaches its route with the existing version guard. Check DingTalk and Kuaimai readiness/status only; do not create synthetic external objects.

- [ ] **Step 3: Perform visual checks**

Inspect 1440×900, 1024×768 and 390×844; confirm banner hierarchy, no overflow, keyboard focus, and production host does not render the local banner.

- [ ] **Step 4: Commit, merge, deploy, and verify production**

Stage only task files, commit, merge into latest `main`, run `npm run release:pages`, deploy through the established Pages workflow, then run production readiness requiring Cloudflare Pages, D1, DingTalk and Kuaimai. Confirm a non-DingTalk production request still receives 401.
