# DingTalk Web Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DingTalk browser QR login while keeping DingTalk embedded auto-login, with both modes producing one secure D1-backed server session that protects all company APIs.

**Architecture:** The Cloudflare Pages release repository owns authentication routes, session storage, DingTalk identity exchange, API middleware, and D1 tables. The React source repository owns the authentication state machine, browser login page, embedded login bootstrap, account menu, and logout experience. The existing company state remains in D1 and is not migrated.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages Functions, Cloudflare D1, DingTalk OAuth 2.0, DingTalk JSAPI, Node test runner.

## Global Constraints

- Only active employees found in the configured DingTalk enterprise may create a Session.
- Browser and embedded login must enter the same React application and use the same `pfs_session` cookie.
- `AppSecret`, user access tokens, and raw Session tokens never reach browser JavaScript.
- Production must not expose the local test login.
- Existing `product_flow_state` and sales tables must not be rewritten or migrated.
- Unauthenticated clients must not read `/api/state`, `/api/sales`, or DingTalk integration data.
- The current React source workspace is `/Users/roger/Documents/product-flow-system-react`.
- The Cloudflare release repository is `/Users/roger/Documents/product-flow-system`.
- Every behavior change follows RED, GREEN, REFACTOR with a focused test before implementation.

---

## File Structure

### Cloudflare release repository

- Create `functions/api/auth/_shared/session.js`: D1 table creation, cookies, Session creation, lookup, revocation, and response helpers.
- Create `functions/api/auth/session.js`: public current-session endpoint.
- Create `functions/api/auth/logout.js`: revoke current Session and clear Cookie.
- Create `functions/api/auth/dingtalk/start.js`: generate OAuth state and redirect to DingTalk.
- Create `functions/api/auth/dingtalk/callback.js`: validate state, exchange code, verify employee, create Session, redirect to app.
- Create `functions/api/auth/dingtalk/embedded.js`: exchange JSAPI auth code, verify employee, create Session.
- Create `functions/api/_middleware.js`: allow public auth/config routes and protect every other `/api/*` route.
- Modify `functions/api/dingtalk/_shared/dingtalk.js`: browser OAuth identity exchange, enterprise membership lookup, and normalized identity.
- Modify `functions/api/dingtalk/config.js`: expose only client ID, CorpId, and callback route.
- Modify `functions/api/dingtalk/login.js`: preserve compatibility by delegating to embedded Session creation.
- Modify `functions/api/state.js`: reject `readonly` writes and use authenticated user as `updatedBy`.
- Modify `functions/api/sales.js`: reject unauthenticated requests through middleware and reject `readonly` mutations.
- Modify `functions/api/dingtalk/org/sync.js`: persist normalized members into the auth member cache.
- Create `tests/helpers/auth-d1-mock.mjs`: reusable D1 mock for Session and member tests.
- Create `tests/dingtalk-web-auth.test.mjs`: OAuth, embedded login, Session, enterprise membership, middleware, logout, and expiry tests.

### React source workspace

- Create `src/state/AuthProvider.jsx`: Session bootstrap and authentication state machine.
- Create `src/domain/authSession.js`: same-origin auth API client and normalized auth errors.
- Create `src/features/auth/LoginPage.jsx`: browser login, forbidden, expired, and retry states.
- Create `src/features/auth/AuthGate.jsx`: blocks business application until authenticated.
- Modify `src/domain/dingTalkLogin.js`: return embedded auth code without storing a trusted local Session.
- Modify `src/state/ProductFlowProvider.jsx`: consume authenticated identity and delay state/org loading until login succeeds.
- Modify `src/domain/sessionUser.js`: stop trusting localStorage as identity; retain only organization matching helpers.
- Modify `src/App.jsx`: account menu and logout command.
- Modify `src/main.jsx`: mount `AuthProvider` and `AuthGate` before `ProductFlowProvider`.
- Modify `src/styles.css`: compact login page, account menu, loading, and error states.
- Modify `tests/react-app.test.mjs`: authentication gate, login page, embedded auto-login, logout, and production safety checks.

---

### Task 1: D1 Session Core

**Files:**
- Create: `functions/api/auth/_shared/session.js`
- Create: `tests/helpers/auth-d1-mock.mjs`
- Create: `tests/dingtalk-web-auth.test.mjs`

**Interfaces:**
- Produces: `ensureAuthTables(db)`, `createSession(identity, loginMode, env)`, `readSession(request, env)`, `requireSession(request, env)`, `revokeSession(request, env)`, `sessionCookie(token)`, `clearSessionCookie()`.
- Test helper exports: `createAuthD1Mock()`, `createStateD1Mock()`, `createSalesD1Mock()`, `validState`, and `validSalesRow` from `tests/helpers/auth-d1-mock.mjs`.
- Session shape: `{ idHash, corpId, userId, unionId, name, role, department, title, loginMode, expiresAt }`.

- [ ] **Step 1: Write failing Session lifecycle tests**

Add tests that create a Session, read it from a Cookie, reject an expired Session, revoke it, and confirm D1 never stores the raw token:

```js
test("server session stores only a token hash and resolves an active employee", async () => {
  const db = createAuthD1Mock();
  const created = await createSession({
    corpId: "ding-company",
    userId: "user-1",
    unionId: "union-1",
    name: "周荣庆",
    role: "executive",
    department: "总经办",
    title: "总经理"
  }, "browser", { PRODUCT_FLOW_DB: db });

  assert.match(created.cookie, /^pfs_session=/);
  assert.equal(db.dumpSessions()[0].id_hash.includes(created.token), false);
  const session = await readSession(new Request("https://flow.example.com/api/state", {
    headers: { cookie: created.cookie }
  }), { PRODUCT_FLOW_DB: db });
  assert.equal(session.unionId, "union-1");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/dingtalk-web-auth.test.mjs`

Expected: FAIL because `functions/api/auth/_shared/session.js` and `createAuthD1Mock` do not exist.

- [ ] **Step 3: Implement the Session module and D1 mock**

Create these D1 tables in `ensureAuthTables`:

```sql
CREATE TABLE IF NOT EXISTS product_flow_sessions (
  id_hash TEXT PRIMARY KEY,
  corp_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  union_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT,
  title TEXT,
  login_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
)
```

Use `crypto.getRandomValues(new Uint8Array(32))` for tokens and `crypto.subtle.digest("SHA-256", ...)` for stored hashes. Parse only the `pfs_session` Cookie. Return 401 from `requireSession` when the Cookie is missing, expired, unknown, or revoked.

- [ ] **Step 4: Run Session tests and verify GREEN**

Run: `node --test tests/dingtalk-web-auth.test.mjs`

Expected: PASS for creation, lookup, expiry, revocation, and raw-token non-persistence.

- [ ] **Step 5: Commit Session infrastructure**

```bash
git add functions/api/auth/_shared/session.js tests/helpers/auth-d1-mock.mjs tests/dingtalk-web-auth.test.mjs
git commit -m "feat(auth): add D1 server sessions"
```

---

### Task 2: Browser OAuth and Embedded Login Routes

**Files:**
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Create: `functions/api/auth/dingtalk/start.js`
- Create: `functions/api/auth/dingtalk/callback.js`
- Create: `functions/api/auth/dingtalk/embedded.js`
- Create: `functions/api/auth/session.js`
- Create: `functions/api/auth/logout.js`
- Modify: `functions/api/dingtalk/login.js`
- Modify: `functions/api/dingtalk/config.js`
- Test: `tests/dingtalk-web-auth.test.mjs`

**Interfaces:**
- Consumes: Session functions from Task 1.
- Produces: `getDingBrowserIdentity(code, env, fetchImpl)`, `getDingEmbeddedIdentity(authCode, corpId, env, fetchImpl)`, `GET /api/auth/dingtalk/start`, `GET /api/auth/dingtalk/callback`, `POST /api/auth/dingtalk/embedded`, `GET /api/auth/session`, `POST /api/auth/logout`.
- Test-local helper functions in `tests/dingtalk-web-auth.test.mjs`: `configuredEnv(db)` supplies DingTalk bindings and a fetch mock; `createAuthenticatedResponse(identity, loginMode)` creates a Session response through the real Session helper; `publicSession(response)` resolves that Cookie through the Session endpoint; `browserCallbackWithIdentity(identity)` runs the callback route with a mocked DingTalk identity.

- [ ] **Step 1: Verify the current DingTalk OAuth contract before coding**

Run:

```bash
dws devdoc article search --query "钉钉 OAuth2 网页扫码登录 authorization code userAccessToken contact users me" --format json
```

Confirm the authorization endpoint, callback parameter name, `openid` scope, user access-token exchange, and current-user endpoint. If DingTalk documentation is temporarily unavailable, retain the standard adapter contract below and do not perform a real production login until Preview verification succeeds.

- [ ] **Step 2: Write failing route tests**

Cover these behaviors with mocked DingTalk responses:

```js
test("browser OAuth callback rejects a mismatched state", async () => {
  const response = await browserCallback({
    request: new Request("https://flow.example.com/api/auth/dingtalk/callback?code=x&state=wrong", {
      headers: { cookie: "pfs_oauth_state=expected" }
    }),
    env: configuredEnv(createAuthD1Mock())
  });
  assert.equal(response.status, 400);
});

test("browser OAuth callback creates the same session model as embedded login", async () => {
  const identity = { corpId: "ding-company", userId: "user-1", unionId: "union-1", name: "周荣庆", role: "executive" };
  const browser = await createAuthenticatedResponse(identity, "browser");
  const embedded = await createAuthenticatedResponse(identity, "embedded");
  assert.match(browser.headers.get("set-cookie"), /pfs_session=/);
  assert.match(embedded.headers.get("set-cookie"), /pfs_session=/);
  assert.deepEqual(publicSession(browser), publicSession(embedded));
});

test("browser OAuth rejects a DingTalk account outside the enterprise", async () => {
  const response = await browserCallbackWithIdentity({ unionId: "external-union", enterpriseUserId: "" });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("set-cookie")?.includes("pfs_session=") || false, false);
});
```

- [ ] **Step 3: Run route tests and verify RED**

Run: `node --test tests/dingtalk-web-auth.test.mjs`

Expected: FAIL because browser OAuth routes and identity adapters do not exist.

- [ ] **Step 4: Implement DingTalk identity adapters**

Use the existing `getDingUserAccessToken` for browser authorization codes. Add:

```js
export async function getDingCurrentUser(userAccessToken, fetchImpl = fetch) {
  return requestDingOpenApi(userAccessToken, "GET", "/v1.0/contact/users/me", null, fetchImpl);
}

export async function getDingUserByUnionId(appAccessToken, unionId, fetchImpl = fetch) {
  return postDingTopApi(appAccessToken, "/topapi/user/getbyunionid", { unionid: unionId }, fetchImpl);
}
```

Browser login succeeds only when `getDingUserByUnionId` returns a real enterprise `userid`. Normalize both browser and embedded identities to the Session identity interface from Task 1.

- [ ] **Step 5: Implement start, callback, embedded, session, and logout routes**

`start.js` generates a 32-byte state, sets `pfs_oauth_state` for 10 minutes, and redirects to:

```text
https://login.dingtalk.com/oauth2/auth
  ?redirect_uri=<origin>/api/auth/dingtalk/callback
  &response_type=code
  &client_id=<DINGTALK_APP_KEY>
  &scope=openid
  &state=<state>
  &prompt=consent
```

`callback.js` validates the state Cookie, exchanges the code, verifies the employee, creates the Session, clears the OAuth Cookie, and redirects to `/?login=success`.

`embedded.js` accepts `{ authCode, corpId }`, uses the existing enterprise免登 flow, then creates the same Session Cookie. `session.js` returns only public user, role, department, title, loginMode, and expiry. `logout.js` revokes and clears the Session.

- [ ] **Step 6: Run auth tests and verify GREEN**

Run: `node --test tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs`

Expected: all tests PASS, including existing role mapping and config tests.

- [ ] **Step 7: Commit DingTalk login routes**

```bash
git add functions/api/auth functions/api/dingtalk/_shared/dingtalk.js functions/api/dingtalk/login.js functions/api/dingtalk/config.js tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs
git commit -m "feat(auth): add DingTalk browser login"
```

---

### Task 3: Protect Business APIs and Persist Employee Directory

**Files:**
- Create: `functions/api/_middleware.js`
- Modify: `functions/api/state.js`
- Modify: `functions/api/sales.js`
- Modify: `functions/api/dingtalk/org/sync.js`
- Modify: `functions/api/auth/_shared/session.js`
- Test: `tests/dingtalk-web-auth.test.mjs`
- Test: `tests/shared-state.test.mjs`

**Interfaces:**
- Consumes: `readSession`, `requireSession`, `ensureAuthTables`.
- Produces: `upsertOrgMembers(db, org, corpId)`, authenticated `context.data.session`, and 401 / 403 API behavior.

- [ ] **Step 1: Write failing middleware and permission tests**

Add tests asserting:

```js
test("API middleware blocks anonymous company data", async () => {
  const response = await apiMiddleware({
    request: new Request("https://flow.example.com/api/state"),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() },
    data: {},
    next: () => new Response("unexpected")
  });
  assert.equal(response.status, 401);
});

test("API middleware keeps auth start callback session logout and config public", async () => {
  const paths = [
    "/api/auth/session",
    "/api/auth/logout",
    "/api/auth/dingtalk/start",
    "/api/auth/dingtalk/callback",
    "/api/auth/dingtalk/embedded",
    "/api/dingtalk/config"
  ];
  for (const path of paths) {
    const response = await apiMiddleware({
      request: new Request(`https://flow.example.com${path}`),
      env: {},
      data: {},
      next: () => new Response("next", { status: 204 })
    });
    assert.equal(response.status, 204, path);
  }
});

test("readonly session cannot overwrite company state or import sales", async () => {
  const context = { data: { session: { role: "readonly", name: "只读员工" } } };
  const stateResponse = await stateRequest({
    ...context,
    request: new Request("https://flow.example.com/api/state", { method: "POST", body: JSON.stringify({ state: validState }) }),
    env: { PRODUCT_FLOW_DB: createStateD1Mock() }
  });
  const salesResponse = await salesRequest({
    ...context,
    request: new Request("https://flow.example.com/api/sales", { method: "POST", body: JSON.stringify({ rows: [validSalesRow] }) }),
    env: { PRODUCT_FLOW_DB: createSalesD1Mock() }
  });
  assert.equal(stateResponse.status, 403);
  assert.equal(salesResponse.status, 403);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/dingtalk-web-auth.test.mjs tests/shared-state.test.mjs`

Expected: FAIL because the middleware and server authorization are missing.

- [ ] **Step 3: Implement Pages middleware**

Allow `OPTIONS`, `/api/auth/session`, `/api/auth/logout`, `/api/auth/dingtalk/start`, `/api/auth/dingtalk/callback`, `/api/auth/dingtalk/embedded`, and `/api/dingtalk/config`. Every other `/api/*` route must call `requireSession`, assign the result to `context.data.session`, and then call `context.next()`.

- [ ] **Step 4: Enforce write access inside state and sales routes**

For `POST /api/state`, ignore client-provided `updatedBy` and use `context.data.session.name`. Return 403 when role is `readonly`. Apply the same rule to `POST` and `DELETE /api/sales`; authenticated GET remains readable.

- [ ] **Step 5: Store normalized organization members**

Add `product_flow_org_members` to `ensureAuthTables` and have org sync upsert current users. Mark previously cached users inactive when they are absent from a successful full sync. Sort and preserve department/title fields used by the existing selectors.

- [ ] **Step 6: Run backend regression tests and verify GREEN**

Run:

```bash
node --test tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs tests/dingtalk-org-routes.test.mjs tests/dingtalk-org.test.mjs tests/dingtalk-sync.test.mjs tests/shared-state.test.mjs
```

Expected: all selected backend tests PASS. Update legacy test requests to provide authenticated middleware context rather than bypassing authorization.

- [ ] **Step 7: Commit API protection**

```bash
git add functions/api/_middleware.js functions/api/state.js functions/api/sales.js functions/api/dingtalk/org/sync.js functions/api/auth/_shared/session.js tests
git commit -m "feat(auth): protect company APIs"
```

---

### Task 4: React Authentication Gate and Browser Login Page

**Files:**
- Create: `/Users/roger/Documents/product-flow-system-react/src/domain/authSession.js`
- Create: `/Users/roger/Documents/product-flow-system-react/src/state/AuthProvider.jsx`
- Create: `/Users/roger/Documents/product-flow-system-react/src/features/auth/AuthGate.jsx`
- Create: `/Users/roger/Documents/product-flow-system-react/src/features/auth/LoginPage.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/domain/dingTalkLogin.js`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/state/ProductFlowProvider.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/domain/sessionUser.js`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/main.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/styles.css`
- Test: `/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs`

**Interfaces:**
- Produces: `useAuth()` returning `{ status, account, error, retry, logout }`.
- `status` is one of `checking`, `anonymous-browser`, `anonymous-embedded`, `authenticated`, `forbidden`, `error`.
- `authSessionApi.getSession()`, `.loginEmbedded(authCode, corpId)`, `.logout()`.

- [ ] **Step 1: Write failing frontend structure tests**

Add source-level tests asserting that:

```js
test("business app is gated by a server session", () => {
  const main = read("src/main.jsx");
  const gate = read("src/features/auth/AuthGate.jsx");
  const provider = read("src/state/AuthProvider.jsx");
  assert.match(main, /AuthProvider/);
  assert.match(main, /AuthGate/);
  assert.match(provider, /\/api\/auth\/session/);
  assert.match(gate, /anonymous-browser/);
  assert.match(gate, /LoginPage/);
});

test("browser login uses the server OAuth start route", () => {
  const page = read("src/features/auth/LoginPage.jsx");
  assert.match(page, /\/api\/auth\/dingtalk\/start/);
  assert.match(page, /钉钉扫码登录/);
});
```

- [ ] **Step 2: Run the focused frontend test and verify RED**

Run: `npm test -- --test-name-pattern="session|browser login|embedded"`

Expected: FAIL because the provider, gate, and page do not exist.

- [ ] **Step 3: Implement the auth API client and provider**

`getSession` sends same-origin credentials. A 401 returns anonymous instead of throwing. In DingTalk, anonymous state triggers `requestDingAuthCode` and `POST /api/auth/dingtalk/embedded`, then reloads `/api/auth/session`. In a normal browser, anonymous state becomes `anonymous-browser` without invoking JSAPI.

Do not write role or user identity into localStorage. Keep only non-security UI caches.

- [ ] **Step 4: Implement AuthGate and LoginPage**

`AuthGate` renders:

- full-page loading for `checking` and `anonymous-embedded`;
- `LoginPage` for `anonymous-browser`, `forbidden`, and `error`;
- children only for `authenticated`.

The login page contains the product mark, “产品全周期协同系统”, “仅限公司员工使用”, and a primary “钉钉扫码登录” link to `/api/auth/dingtalk/start`. It has no feature marketing, no data preview, and no production test-login button.

When `window.location.hostname` is `localhost`, `127.0.0.1`, or `::1`, the provider may expose a separate local-test action. That action creates an in-memory `source: "local-test"` identity, uses local fixture/cache data only, and disables real DingTalk writes. It never calls the protected production API as an unauthenticated user.

- [ ] **Step 5: Gate company-state loading**

Move trustworthy identity from localStorage into `useAuth().account`. `ProductFlowProvider` must not call `/api/state` or `/api/dingtalk/org/sync` until auth status is `authenticated`. Preserve the existing state normalization and save behavior after authentication.

- [ ] **Step 6: Add compact auth styling**

Use existing design tokens. The login surface is centered at `min(440px, calc(100vw - 32px))`, uses one 8px-radius panel, 44px controls, visible focus state, and responsive padding. Do not introduce gradients, illustrations, nested cards, or large display typography.

- [ ] **Step 7: Run frontend tests and verify GREEN**

Run: `npm test`

Expected: all React tests PASS.

Run: `npm run build`

Expected: Vite production build exits 0.

---

### Task 5: Account Menu, Logout, and Local Development Safety

**Files:**
- Modify: `/Users/roger/Documents/product-flow-system-react/src/App.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/styles.css`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/state/AuthProvider.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs`

**Interfaces:**
- Consumes: `useAuth().logout`.
- Produces: keyboard-accessible account menu with one “退出登录” command.

- [ ] **Step 1: Write failing logout and production-safety tests**

Assert that the account chip is a button, opens a menu, and calls `logout`. Assert that “本地测试登录” is rendered only when `isLocalPreview()` is true, uses an in-memory `local-test` account, and never bypasses `/api/auth/session` on a production hostname.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --test-name-pattern="logout|production|account"`

Expected: FAIL because the account menu and logout integration are missing.

- [ ] **Step 3: Implement account menu and logout**

Use the existing account chip dimensions. Display name, department/title, and a single “退出登录” row. On success, clear UI identity, preserve non-sensitive local UI preferences, and return to `anonymous-browser` or restart embedded login based on runtime. A local-test logout returns to the localhost-only login screen without sending a production logout request.

- [ ] **Step 4: Verify GREEN and run the design audit**

Run: `npm test && npm run build`.

Then inspect 1440×900 and 1280×720 screenshots for login, dashboard, and the account menu. Check hierarchy, spacing, alignment, keyboard focus, overflow, and text truncation.

---

### Task 6: Build Sync, Preview Authentication, and Production Release

**Files:**
- Replace from build: `/Users/roger/Documents/product-flow-system/index.html`
- Replace from build: `/Users/roger/Documents/product-flow-system/assets/*`
- Modify: `/Users/roger/Documents/product-flow-system/DINGTALK_SETUP.md`

**Interfaces:**
- Consumes: passing backend tests and React `dist`.
- Produces: Cloudflare Preview and production deployments using the same callback and D1 binding.

- [ ] **Step 1: Run fresh verification before building**

React workspace:

```bash
cd /Users/roger/Documents/product-flow-system-react
npm test
npm run build
```

Release repository:

```bash
cd /Users/roger/Documents/product-flow-system
node --test tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs tests/dingtalk-org-routes.test.mjs tests/dingtalk-org.test.mjs tests/dingtalk-sync.test.mjs tests/shared-state.test.mjs
```

Expected: every current-suite test exits 0.

- [ ] **Step 2: Sync the React build into the release repository**

```bash
rsync -a --delete /Users/roger/Documents/product-flow-system-react/dist/assets/ /Users/roger/Documents/product-flow-system/assets/
cp /Users/roger/Documents/product-flow-system-react/dist/index.html /Users/roger/Documents/product-flow-system/index.html
```

Review `git status`, stage only auth/backend/build files, and commit:

```bash
git commit -m "feat: add DingTalk web login"
```

- [ ] **Step 3: Configure DingTalk callback and Cloudflare Preview**

Register the exact callback URL shown by `/api/dingtalk/config` for the Preview host. Keep `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`, `DINGTALK_CORP_ID`, and `PRODUCT_FLOW_DB` as Cloudflare environment bindings. Never place them in the bundle.

- [ ] **Step 4: Verify real browser QR login on Preview**

Use a company DingTalk account to verify login, refresh persistence, correct department/title, logout, and re-login. Verify a non-enterprise DingTalk account returns 403. Inspect Network to confirm unauthenticated `/api/state` returns 401 and no business payload.

- [ ] **Step 5: Verify embedded DingTalk login on Preview**

Open the Preview URL from DingTalk workbench. Verify JSAPI silent login creates the same `pfs_session`, business data loads, and todo/calendar operations still use the logged-in user.

- [ ] **Step 6: Publish production and verify the deployed hash**

Push the release commit to `main`. Poll `https://product-flow-system.pages.dev/` until it references the new asset hash. Verify `/api/auth/session`, browser QR login, embedded login, `/api/state` authorization, logout, and one read-only product progress flow.

- [ ] **Step 7: Record known legacy test status**

The release repository still contains old single-file HTML UI tests that do not represent the React bundle. Do not claim the full legacy `npm test` suite passes unless those tests are migrated separately. Report current React tests and selected backend tests explicitly.
