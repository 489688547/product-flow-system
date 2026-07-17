# 钉钉群聊执行人选择实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users search their visible DingTalk groups on desktop web and inside DingTalk, select a group to add all valid members as todo executors, de-duplicate people, and remove individual members before syncing.

**Architecture:** Keep DingTalk groups as a temporary executor-selection source; the existing todo payload remains user-only. Add a mandatory official-API capability gate, server-side encrypted user-token storage, session-protected group search/member adapters, a pure selection-state domain module, and a focused React picker embedded in `TodoSyncModal`.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages Functions, Cloudflare D1, Web Crypto AES-GCM, Node.js built-in test runner, DingTalk OAuth/OpenAPI.

## Global Constraints

- Desktop web and DingTalk embedded WebView must use the same in-app search and selection behavior.
- A selected group adds every valid member by default; the user may remove individual people before submission.
- Groups never become todo executors and no group message is sent.
- The final sync payload contains only de-duplicated personal `unionId` values.
- Group membership is temporary modal state and must not enter product-flow shared business state.
- User access and refresh tokens stay server-side, are encrypted at rest, and are never logged or returned to the browser.
- Group search/member data is isolated by signed-in DingTalk user.
- Do not silently truncate group members or executors. Block submission and show the verified DingTalk limit.
- If official enterprise-app verification cannot prove full visible-group search and complete member reads, stop after Task 1 and report the blocker; do not ship partial or fake results.
- Deployment or DingTalk application-permission changes require separate user approval; use an existing authorized test deployment when available.

---

## File Map

- Create `docs/integrations/dingtalk-group-capability-evidence.md`: records official API paths, auth type, permissions, pagination, executor limit, and PASS/FAIL evidence.
- Create `functions/api/dingtalk/_shared/group-contract.js`: contains only the exact official API constants proven by the capability gate.
- Create `functions/api/auth/_shared/ding-user-token.js`: encrypts, stores, reads, refreshes, and revokes user-scoped DingTalk tokens.
- Modify `functions/api/auth/_shared/session.js`: creates the token table and exposes a server-only session hash resolver.
- Modify `functions/api/dingtalk/_shared/dingtalk.js`: returns browser identity plus OAuth token metadata without changing existing public identity helpers.
- Modify `functions/api/auth/dingtalk/callback.js`: persists the browser login user token against the new session.
- Create `functions/api/auth/dingtalk/group/start.js` and `functions/api/auth/dingtalk/group/callback.js`: one-time embedded group authorization and safe return flow.
- Modify `functions/api/_middleware.js`: makes only the OAuth callback public; group search/member routes remain session protected.
- Create `functions/api/dingtalk/_shared/groups.js`: normalizes verified DingTalk group search/member APIs and errors.
- Create `functions/api/dingtalk/groups/search.js`: session-scoped group search route.
- Create `functions/api/dingtalk/groups/[groupId]/members.js`: validates visibility and returns complete normalized members.
- Create `tests/dingtalk-group-auth.test.mjs`: token storage, encryption, refresh, revoke, and OAuth continuation coverage.
- Create `tests/dingtalk-groups.test.mjs`: DingTalk adapter and route coverage.
- Modify `tests/helpers/auth-d1-mock.mjs`: supports the new encrypted-token table and group-route session lookups.
- Create `src/domain/dingTalkGroupSelection.js`: pure person/group source tracking and de-duplication.
- Create `src/domain/dingTalkGroups.js`: browser API client and normalized frontend errors.
- Create `react-tests/dingtalk-group-selection.test.mjs`: source tracking and removal behavior.
- Create `src/features/progress/GroupExecutorPicker.jsx`: personnel/group tabs, search results, selected groups, member loading, and errors.
- Modify `src/features/progress/TodoSyncModal.jsx`: owns final selection state and submits only selected people.
- Create `react-tests/dingtalk-group-picker.test.mjs`: UI contract coverage.
- Modify `src/styles.css`: focused responsive styles for the new picker.
- Modify `package.json`: includes new API test files in `test:api`.

---

### Task 1: Prove DingTalk Group API Capability

**Files:**
- Create: `docs/integrations/dingtalk-group-capability-evidence.md`
- Create on PASS only: `functions/api/dingtalk/_shared/group-contract.js`

**Interfaces:**
- Consumes: Enterprise DingTalk app credentials and a test account that belongs to at least two groups.
- Produces: A PASS evidence document plus `dingGroupContract`, containing exact `searchPath`, `membersPath`, auth header, required application permission, pagination fields, executor limit, and observed visibility semantics. Tasks 2–7 must not begin unless status is PASS.

- [ ] **Step 1: Query official DingTalk developer documentation through DWS**

Run:

```bash
dws devdoc article search --query "搜索当前用户可见群聊 openConversationId 用户授权" --size 10 --format json
dws devdoc article search --query "获取群成员 openConversationId 分页 unionId" --size 10 --format json
dws devdoc article search --query "创建待办 executorIds 人数上限" --size 10 --format json
```

Expected: each command returns at least one official article. Record article title, URL, API method/path, auth type, required permission, request fields, response fields, and limits. If DWS returns a recovery event, follow the DWS recovery workflow once. If grounded recovery says not to retry or the official articles do not establish all required capabilities, mark the evidence document FAIL and stop the plan.

- [ ] **Step 2: Run read-only account-level probes**

Run:

```bash
dws chat search --query "产品" --format json
dws chat group list-my-groups --format json
```

Copy one returned `openConversationId` into the shell variable, then run:

```bash
read -r GROUP_ID
dws chat group members list --id "$GROUP_ID" --format json
```

Expected: search returns a group visible to the signed-in test user, and member listing returns the complete expected group roster. Do not send messages or create todos during this task.

- [ ] **Step 3: Create the evidence document**

Write `docs/integrations/dingtalk-group-capability-evidence.md` with `Status: PASS`, the current ISO timestamp, and four sections: Group search, Group members, Todo executor limit, and Account probe. Each API section must contain the official article title and URL, exact HTTP method/path, authentication header and token type, exact application permission, request/response pagination fields, and observed visibility semantics. The todo section must contain the official positive integer limit. The account probe must mask names while recording expected and returned integer member counts.

If any required item is unsupported, write `Status: FAIL`, state the missing capability and official evidence, commit only this file, and stop.

On PASS, create `functions/api/dingtalk/_shared/group-contract.js` exporting frozen `dingGroupContract`. It must contain `search.{method,path,queryField,cursorField,listField,nextCursorField,idField,nameField}`, `members.{method,path,cursorField,listField,nextCursorField,hasMoreField,userIdField,unionIdField,nameField}`, `authHeader`, `requiredPermission`, and positive integer `todoExecutorLimit`. Every value must be copied from the evidence document; unavailable optional member identity fields use an empty string, but at least one of `userIdField` or `unionIdField` must be non-empty. The module must contain no fallback endpoint or guessed permission.

- [ ] **Step 4: Validate and commit the gate**

Run:

```bash
rg -n "Status: PASS|Method and path|Application permission|Maximum executors|Returned members" docs/integrations/dingtalk-group-capability-evidence.md
rg -n "<|>|TBD|TODO|待定" docs/integrations/dingtalk-group-capability-evidence.md
node -e "import('./functions/api/dingtalk/_shared/group-contract.js').then(({dingGroupContract:c})=>{if(!c.search?.path||!c.members?.path||!c.authHeader||!c.requiredPermission||!Number.isInteger(c.todoExecutorLimit)||c.todoExecutorLimit<1)process.exit(1)})"
```

Expected: the first command prints every required field; the second prints nothing; the Node contract validation exits 0.

Commit:

```bash
git add docs/integrations/dingtalk-group-capability-evidence.md functions/api/dingtalk/_shared/group-contract.js
git commit -m "docs: verify DingTalk group API capability"
```

---

### Task 2: Store User-Scoped DingTalk Tokens Securely

**Files:**
- Create: `functions/api/auth/_shared/ding-user-token.js`
- Modify: `functions/api/auth/_shared/session.js`
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Modify: `functions/api/auth/dingtalk/callback.js`
- Modify: `functions/api/auth/logout.js`
- Modify: `tests/helpers/auth-d1-mock.mjs`
- Create: `tests/dingtalk-group-auth.test.mjs`

**Interfaces:**
- Consumes: `getDingUserAccessToken(env, { code | refreshToken }, fetchImpl)` and `createSession(...)`.
- Produces: `saveDingUserToken(db, sessionIdHash, token, env)`, `getValidDingUserToken(request, env, fetchImpl)`, `deleteDingUserToken(request, env)`, and `getSessionIdHash(request, env)`.

- [ ] **Step 1: Write failing encryption and lifecycle tests**

Add tests that use a fixed 32-byte base64 key and assert ciphertext never contains the raw tokens:

```js
const TOKEN_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("DingTalk user tokens are encrypted and bound to the server session", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "raw-access",
    refreshToken: "raw-refresh",
    expireIn: 7200
  }, { DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY });

  const row = db.dumpDingTokens()[0];
  assert.equal(JSON.stringify(row).includes("raw-access"), false);
  assert.equal(JSON.stringify(row).includes("raw-refresh"), false);
});

test("expired DingTalk user tokens refresh once and persist the replacement", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "expired-access",
    refreshToken: "refresh-1",
    expireIn: 1
  }, env);
  db.setDingTokenExpires(created.sessionIdHash, "2000-01-01T00:00:00.000Z");
  const fetchImpl = async (url, options) => {
    assert.match(String(url), /\/v1\.0\/oauth2\/userAccessToken/);
    assert.equal(JSON.parse(options.body).refreshToken, "refresh-1");
    return Response.json({ accessToken: "fresh-access", refreshToken: "refresh-2", expireIn: 7200 });
  };

  const accessToken = await getValidDingUserToken(requestWithCookie(created.cookie), env, fetchImpl);

  assert.equal(accessToken, "fresh-access");
  assert.equal(db.dumpDingTokens().length, 1);
  assert.equal(Date.parse(db.dumpDingTokens()[0].expires_at) > Date.now(), true);
});

test("logout deletes the DingTalk user token bound to the session", async () => {
  const db = createAuthD1Mock();
  const env = { PRODUCT_FLOW_DB: db, DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY };
  const created = await createSession(identity, "browser", env);
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expireIn: 7200
  }, env);

  const response = await logout({
    request: new Request("https://flow.example.com/api/auth/logout", {
      method: "POST",
      headers: { cookie: created.cookie }
    }),
    env
  });

  assert.equal(response.status, 200);
  assert.deepEqual(db.dumpDingTokens(), []);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test tests/dingtalk-group-auth.test.mjs
```

Expected: FAIL because `ding-user-token.js`, `sessionIdHash`, and mock token-table support do not exist.

- [ ] **Step 3: Add server-only session identity and the token table**

Extend `createSession` to return `sessionIdHash: idHash`. Add this table in `ensureAuthTables`:

```sql
CREATE TABLE IF NOT EXISTS product_flow_ding_user_tokens (
  session_id_hash TEXT PRIMARY KEY,
  access_ciphertext TEXT NOT NULL,
  refresh_ciphertext TEXT,
  iv TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

Export a resolver that hashes the `pfs_session` cookie but never exposes it through `/api/auth/session`:

```js
export async function getSessionIdHash(request, env = {}) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !authDatabase(env)) return "";
  return hashToken(token);
}
```

- [ ] **Step 4: Implement AES-GCM token storage and refresh**

In `ding-user-token.js`, implement base64 conversion, import `DINGTALK_TOKEN_ENCRYPTION_KEY` as AES-GCM, encrypt one JSON payload `{ accessToken, refreshToken }` with a random 12-byte IV, and store the expiry. `getValidDingUserToken` must:

```js
export async function getValidDingUserToken(request, env = {}, fetchImpl = fetch) {
  const sessionIdHash = await getSessionIdHash(request, env);
  if (!sessionIdHash) throw httpError(401, "请先使用钉钉登录。");
  const row = await readTokenRow(env.PRODUCT_FLOW_DB, sessionIdHash);
  if (!row) throw httpError(428, "需要授权访问当前账号可见的钉钉群。", "GROUP_AUTH_REQUIRED");
  const token = await decryptToken(row, env);
  if (Date.parse(row.expires_at) > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) throw httpError(428, "群聊授权已过期，请重新授权。", "GROUP_AUTH_REQUIRED");
  const refreshed = await getDingUserAccessToken(env, { refreshToken: token.refreshToken }, fetchImpl);
  await saveDingUserToken(env.PRODUCT_FLOW_DB, sessionIdHash, refreshed, env);
  return refreshed.accessToken;
}
```

Use one generic 500 error for missing/invalid encryption configuration; never include the secret or decrypted payload in errors.

- [ ] **Step 5: Return token metadata from browser OAuth and persist it**

Add `getDingBrowserLogin` without breaking callers of `getDingBrowserIdentity`:

```js
export async function getDingBrowserLogin(code, env = {}, fetchImpl = fetch) {
  const userToken = await getDingUserAccessToken(env, { code }, fetchImpl);
  const identity = await resolveBrowserIdentity(userToken.accessToken, env, fetchImpl);
  return { identity, userToken };
}

export async function getDingBrowserIdentity(code, env = {}, fetchImpl = fetch) {
  return (await getDingBrowserLogin(code, env, fetchImpl)).identity;
}
```

Update the browser callback to create the session from `identity`, then call `saveDingUserToken(db, created.sessionIdHash, userToken, env)` before redirecting. Update logout to call `deleteDingUserToken` before revoking the session.

- [ ] **Step 6: Extend the D1 mock and make tests pass**

Teach `tests/helpers/auth-d1-mock.mjs` to handle INSERT, SELECT, DELETE, and UPDATE statements for `product_flow_ding_user_tokens`, plus `dumpDingTokens()` and a test-only expiry setter.

Run:

```bash
node --test tests/dingtalk-group-auth.test.mjs tests/dingtalk-web-auth.test.mjs
```

Expected: PASS, with no raw user token in stored rows or public session JSON.

- [ ] **Step 7: Commit secure token storage**

```bash
git add functions/api/auth/_shared/ding-user-token.js functions/api/auth/_shared/session.js functions/api/dingtalk/_shared/dingtalk.js functions/api/auth/dingtalk/callback.js functions/api/auth/logout.js tests/helpers/auth-d1-mock.mjs tests/dingtalk-group-auth.test.mjs
git commit -m "feat(auth): retain encrypted DingTalk user tokens"
```

---

### Task 3: Add Embedded Group Authorization Continuation

**Files:**
- Create: `functions/api/auth/dingtalk/group/start.js`
- Create: `functions/api/auth/dingtalk/group/callback.js`
- Modify: `functions/api/_middleware.js`
- Modify: `tests/dingtalk-group-auth.test.mjs`

**Interfaces:**
- Consumes: existing authenticated session, `getDingUserAccessToken`, `saveDingUserToken`, and the official OAuth scope verified in Task 1.
- Produces: `GET /api/auth/dingtalk/group/start?returnTo=%2F%3FproductId%3Dp1%23progress` and public OAuth callback `/api/auth/dingtalk/group/callback`.

- [ ] **Step 1: Write failing authorization-continuation tests**

Cover these exact cases:

```js
test("embedded group authorization stores protected state and a safe return path", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "embedded", { PRODUCT_FLOW_DB: db });
  const response = await startGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/start?returnTo=%2F%3FproductId%3Dp1%23progress", {
      headers: { cookie: created.cookie }
    }),
    env: { PRODUCT_FLOW_DB: db, DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });

  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("location")).origin, "https://login.dingtalk.com");
  assert.match(response.headers.get("set-cookie"), /pfs_group_oauth_state=/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});

test("group authorization rejects external return URLs", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "embedded", { PRODUCT_FLOW_DB: db });
  const response = await startGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/start?returnTo=https%3A%2F%2Fevil.example", {
      headers: { cookie: created.cookie }
    }),
    env: { PRODUCT_FLOW_DB: db, DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });

  assert.match(response.headers.get("set-cookie"), /%2F%23progress/);
  assert.doesNotMatch(response.headers.get("set-cookie"), /evil\.example/);
});

test("group callback requires matching state and an active product-flow session", async () => {
  const wrongState = await finishGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/callback?code=code-1&state=wrong", {
      headers: { cookie: "pfs_group_oauth_state=expected" }
    }),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() }
  });
  assert.equal(wrongState.status, 400);

  const noSession = await finishGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/callback?code=code-1&state=expected", {
      headers: { cookie: "pfs_group_oauth_state=expected" }
    }),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() }
  });
  assert.equal(noSession.status, 401);
});

test("group callback stores the user token and redirects to the saved product task", async () => {
  const db = createAuthD1Mock();
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  const created = await createSession(identity, "embedded", env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ accessToken: "access-1", refreshToken: "refresh-1", expireIn: 7200 });
  try {
    const response = await finishGroupAuthorization({
      request: new Request("https://flow.example.com/api/auth/dingtalk/group/callback?code=code-1&state=expected", {
        headers: { cookie: `${created.cookie}; pfs_group_oauth_state=expected; pfs_group_return=%2F%3FproductId%3Dp1%23progress` }
      }),
      env
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/?productId=p1#progress");
    assert.equal(db.dumpDingTokens().length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Verify the new tests fail**

Run:

```bash
node --test tests/dingtalk-group-auth.test.mjs
```

Expected: FAIL because the two routes do not exist.

- [ ] **Step 3: Implement start and callback routes**

The start route must accept only a relative path beginning with `/`; otherwise use `/#progress`. Store state and return path in `HttpOnly; Secure; SameSite=Lax; Max-Age=600` cookies. The callback must compare state in constant application logic, require the existing session cookie, exchange the code, persist the encrypted user token, clear temporary cookies, and redirect to the saved path.

Use the OAuth scope and application permission proven in Task 1. Do not request unrelated permissions.

- [ ] **Step 4: Keep only the callback public**

Add `/api/auth/dingtalk/group/callback` to `PUBLIC_PATHS`. Do not add `/api/auth/dingtalk/group/start`; middleware must attach an authenticated session before authorization begins.

- [ ] **Step 5: Run auth regressions and commit**

Run:

```bash
node --test tests/dingtalk-group-auth.test.mjs tests/dingtalk-web-auth.test.mjs
```

Expected: PASS.

Commit:

```bash
git add functions/api/auth/dingtalk/group/start.js functions/api/auth/dingtalk/group/callback.js functions/api/_middleware.js tests/dingtalk-group-auth.test.mjs
git commit -m "feat(auth): authorize DingTalk group access"
```

---

### Task 4: Build Session-Protected Group Search and Member APIs

**Files:**
- Create: `functions/api/dingtalk/_shared/groups.js`
- Consume: `functions/api/dingtalk/_shared/group-contract.js`
- Create: `functions/api/dingtalk/groups/search.js`
- Create: `functions/api/dingtalk/groups/[groupId]/members.js`
- Create: `tests/dingtalk-groups.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: exact official method/path/auth/pagination contract from Task 1 and `getValidDingUserToken(request, env, fetchImpl)` from Task 2.
- Produces: `searchDingGroups(userToken, query, cursor, fetchImpl) -> { groups, nextCursor }`, `listDingGroupMembers(userToken, groupId, { resolveMember, fetchImpl }) -> { members, skippedCount, skippedReasons }`, and the two JSON routes defined in the design. Search responses use a 30-second session-user cache; member responses are never cached.

- [ ] **Step 1: Write failing adapter and route tests**

Use mocked DingTalk responses shaped exactly like the Task 1 evidence. Cover:

```js
test("group search normalizes visible groups and pagination", async () => {
  const raw = {
    [dingGroupContract.search.listField]: [{
      [dingGroupContract.search.idField]: "g1",
      [dingGroupContract.search.nameField]: "产品群"
    }],
    [dingGroupContract.search.nextCursorField]: "c2"
  };
  const calls = [];
  const result = await searchDingGroups("user-token", " 产品 ", "", async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(raw);
  });

  assert.deepEqual(result, { groups: [{ id: "g1", name: "产品群" }], nextCursor: "c2" });
  assert.equal(calls[0].options.headers[dingGroupContract.authHeader], "user-token");
});

test("group members follows every page and maps active employees to unionId", async () => {
  const member = (userId, name) => ({
    [dingGroupContract.members.userIdField]: userId,
    [dingGroupContract.members.nameField]: name
  });
  const pages = [
    {
      [dingGroupContract.members.listField]: [member("staff-1", "甲"), member("staff-2", "乙")],
      [dingGroupContract.members.hasMoreField]: true,
      [dingGroupContract.members.nextCursorField]: "c2"
    },
    {
      [dingGroupContract.members.listField]: [member("staff-2", "乙"), member("staff-3", "丙")],
      [dingGroupContract.members.hasMoreField]: false,
      [dingGroupContract.members.nextCursorField]: ""
    }
  ];
  const resolveMember = async source => source.userId === "staff-3" ? null : {
    unionId: source.userId === "staff-1" ? "u1" : "u2",
    name: source.name
  };
  const result = await listDingGroupMembers("user-token", "g1", {
    resolveMember,
    fetchImpl: async () => Response.json(pages.shift())
  });

  assert.deepEqual(result.members.map(item => item.unionId), ["u1", "u2"]);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.skippedReasons, { missingIdentity: 1, inactive: 0, unavailable: 0 });
});

test("group member route rejects a group outside the current user's search visibility", async () => {
  const db = createAuthD1Mock();
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  const created = await createSession(identity, "browser", env);
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expireIn: 7200
  }, env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "Forbidden", message: "group is not visible" }, { status: 403 });
  try {
    const response = await listGroupMembersRoute({
      request: new Request("https://flow.example.com/api/dingtalk/groups/g1/members", {
        headers: { cookie: created.cookie }
      }),
      env,
      data: { session: created.session },
      params: { groupId: "g1" }
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "GROUP_NOT_VISIBLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("group search cache is isolated by session and expires after 30 seconds", async () => {
  const db = createAuthD1Mock();
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  const sessionA = await createSession(identity, "browser", env);
  const sessionB = await createSession({ ...identity, userId: "user-2", unionId: "union-2" }, "browser", env);
  await saveDingUserToken(db, sessionA.sessionIdHash, { accessToken: "a", refreshToken: "ra", expireIn: 7200 }, env);
  await saveDingUserToken(db, sessionB.sessionIdHash, { accessToken: "b", refreshToken: "rb", expireIn: 7200 }, env);
  const stored = new Map();
  const putResponses = [];
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  globalThis.caches = { default: {
    async match(request) { return stored.get(String(request.url || request))?.clone(); },
    async put(request, response) {
      putResponses.push(response.clone());
      stored.set(String(request.url || request), response.clone());
    }
  } };
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({
      [dingGroupContract.search.listField]: [{
        [dingGroupContract.search.idField]: "g1",
        [dingGroupContract.search.nameField]: "产品群"
      }]
    });
  };
  const invoke = created => searchGroupsRoute({
    request: new Request("https://flow.example.com/api/dingtalk/groups/search?q=%E4%BA%A7%E5%93%81", {
      headers: { cookie: created.cookie }
    }),
    env,
    data: { session: created.session }
  });
  try {
    await invoke(sessionA);
    await invoke(sessionA);
    await invoke(sessionB);
    assert.equal(upstreamCalls, 2);
    assert.equal(putResponses.every(response => response.headers.get("cache-control") === "private, max-age=30"), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("group routes return GROUP_AUTH_REQUIRED without a stored user token", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const response = await searchGroupsRoute({
    request: new Request("https://flow.example.com/api/dingtalk/groups/search?q=%E4%BA%A7%E5%93%81", {
      headers: { cookie: created.cookie }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: created.session }
  });
  const body = await response.json();

  assert.equal(response.status, 428);
  assert.equal(body.code, "GROUP_AUTH_REQUIRED");
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
node --test tests/dingtalk-groups.test.mjs
```

Expected: FAIL because the adapter and routes do not exist.

- [ ] **Step 3: Implement the DingTalk adapter from verified evidence**

Define a single request helper driven by `dingGroupContract`; it uses only the Task 1 method/path and auth header, normalizes DingTalk errors to local codes, and never logs request headers. Search must trim the query and reject empty values. Member listing must iterate until the verified `hasMore`/cursor termination condition, de-duplicate by `unionId`, and map users to:

```js
{
  unionId: String(source.unionId || source.unionid || ""),
  name: String(source.name || source.nick || "钉钉成员"),
  department: String(source.department || ""),
  title: String(source.title || "")
}
```

If the member API returns only staff user IDs, use the existing enterprise org-member cache to convert `(corpId, userId)` to `unionId`. Return `skippedReasons` with integer keys `missingIdentity`, `inactive`, and `unavailable`; `skippedCount` is their sum.

- [ ] **Step 4: Implement the two routes**

The search route accepts `q` and `cursor`, obtains the user token and `sessionIdHash` from the current request, and uses `caches.default` with a key containing `sessionIdHash`, normalized query, and cursor. Cache only successful responses for 30 seconds; never cache authorization or upstream errors. It returns:

```js
return jsonResponse({ groups, nextCursor });
```

The member route decodes the path segment and calls the verified member operation with the current user's token. DingTalk therefore remains the source of truth for group visibility; translate its inaccessible/not-found response to local 403 `GROUP_NOT_VISIBLE`. On success, read all pages and return:

```js
return jsonResponse({ members, skippedCount, skippedReasons, executorLimit: dingGroupContract.todoExecutorLimit });
```

Reject empty group IDs with 400, inaccessible groups with 403, missing group authorization with 428, and upstream DingTalk errors with 502 plus a safe local error code.

- [ ] **Step 5: Add the API test to the default suite and verify**

Append `tests/dingtalk-group-auth.test.mjs tests/dingtalk-groups.test.mjs` to `test:api`.

Run:

```bash
npm run test:api
```

Expected: all API tests PASS.

- [ ] **Step 6: Commit group APIs**

```bash
git add functions/api/dingtalk/_shared/groups.js functions/api/dingtalk/groups/search.js 'functions/api/dingtalk/groups/[groupId]/members.js' tests/dingtalk-groups.test.mjs package.json
git commit -m "feat(dingtalk): expose user-visible group members"
```

---

### Task 5: Implement Pure Group/Person Selection State

**Files:**
- Create: `src/domain/dingTalkGroupSelection.js`
- Create: `react-tests/dingtalk-group-selection.test.mjs`

**Interfaces:**
- Consumes: org users shaped as `{ unionid, userid, name, department, title }` and group members shaped as `{ unionId, name, department, title }`.
- Produces: `initialExecutorSelection`, `toggleManualExecutor`, `addGroupExecutors`, `removeGroupExecutors`, `excludeExecutor`, and `selectedExecutorUsers`.

- [ ] **Step 1: Write failing source-tracking tests**

```js
test("group members merge with manual executors by unionId", () => {
  const initial = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);
  const next = addGroupExecutors(initial, { id: "g1", name: "产品群" }, [
    { unionId: "u1", name: "甲" },
    { unionId: "u2", name: "乙" }
  ]);
  assert.deepEqual(selectedExecutorUsers(next).map(user => user.unionid), ["u1", "u2"]);
  assert.equal(next.people.u1.manual, true);
  assert.deepEqual(next.people.u1.groupIds, ["g1"]);
});

test("removing a group preserves manually selected and overlapping members", () => {
  let state = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);
  state = addGroupExecutors(state, { id: "g1", name: "一群" }, [
    { unionId: "u1", name: "甲" }, { unionId: "u2", name: "乙" }
  ]);
  state = addGroupExecutors(state, { id: "g2", name: "二群" }, [
    { unionId: "u2", name: "乙" }, { unionId: "u3", name: "丙" }
  ]);
  state = removeGroupExecutors(state, "g1");

  assert.deepEqual(selectedExecutorUsers(state).map(user => user.unionid), ["u1", "u2", "u3"]);
  assert.deepEqual(state.people.u2.groupIds, ["g2"]);
});

test("an excluded member stays excluded when the same group is loaded again", () => {
  const group = { id: "g1", name: "产品群" };
  const members = [{ unionId: "u2", name: "乙" }];
  let state = addGroupExecutors(initialExecutorSelection([], []), group, members);
  state = excludeExecutor(state, "u2");
  state = addGroupExecutors(state, group, members);

  assert.deepEqual(selectedExecutorUsers(state), []);
  assert.deepEqual(state.excludedUnionIds, ["u2"]);
});

test("closing and reopening rebuilds selection only from persisted todo executors", () => {
  let state = addGroupExecutors(initialExecutorSelection([], []), { id: "g1", name: "产品群" }, [
    { unionId: "u2", name: "乙" }
  ]);
  state = excludeExecutor(state, "u2");
  const reopened = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);

  assert.deepEqual(Object.keys(reopened.groups), []);
  assert.deepEqual(reopened.excludedUnionIds, []);
  assert.deepEqual(selectedExecutorUsers(reopened).map(user => user.unionid), ["u1"]);
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
node --test react-tests/dingtalk-group-selection.test.mjs
```

Expected: FAIL because the domain module does not exist.

- [ ] **Step 3: Implement immutable selection functions**

Use this state shape:

```js
{
  people: {
    [unionId]: {
      user: { unionid, userid, name, department, title },
      manual: Boolean,
      groupIds: String[]
    }
  },
  groups: {
    [groupId]: { id, name, memberCount, skippedCount, skippedReasons }
  },
  excludedUnionIds: String[]
}
```

All functions return new objects and sorted unique `groupIds`. `excludeExecutor` removes the person from final selection and adds the ID to `excludedUnionIds`. `addGroupExecutors` must not re-add excluded IDs. `removeGroupExecutors` deletes a person only when `manual` is false and no other group source remains. `selectedExecutorUsers` returns each user with the existing lowercase `unionid` property expected by `buildTaskTodoPayload`.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
node --test react-tests/dingtalk-group-selection.test.mjs react-tests/task-todo.test.mjs
```

Expected: PASS.

Commit:

```bash
git add src/domain/dingTalkGroupSelection.js react-tests/dingtalk-group-selection.test.mjs
git commit -m "feat(progress): model group-sourced todo executors"
```

---

### Task 6: Add the Browser Group API Client

**Files:**
- Create: `src/domain/dingTalkGroups.js`
- Create: `react-tests/dingtalk-groups-client.test.mjs`

**Interfaces:**
- Consumes: session-protected routes from Task 4.
- Produces: `searchDingTalkGroups(query, cursor, fetchImpl)`, `loadDingTalkGroupMembers(groupId, fetchImpl)`, and `groupAuthorizationUrl(returnTo)`.

- [ ] **Step 1: Write failing API client tests**

```js
test("group search encodes query and normalizes the successful response", async () => {
  let requested = null;
  const result = await searchDingTalkGroups("产品", "", async (url, options) => {
    requested = { url: String(url), options };
    return Response.json({ groups: [{ id: "g1", name: "产品群" }], nextCursor: "c2" });
  });

  assert.match(requested.url, /\/api\/dingtalk\/groups\/search\?q=%E4%BA%A7%E5%93%81/);
  assert.equal(requested.options.credentials, "same-origin");
  assert.deepEqual(result, { groups: [{ id: "g1", name: "产品群" }], nextCursor: "c2" });
});

test("GROUP_AUTH_REQUIRED exposes a reauthorization action", async () => {
  await assert.rejects(
    () => searchDingTalkGroups("产品", "", async () => Response.json({
      code: "GROUP_AUTH_REQUIRED",
      message: "需要授权访问当前账号可见的钉钉群。"
    }, { status: 428 })),
    error => error.code === "GROUP_AUTH_REQUIRED" && /\/api\/auth\/dingtalk\/group\/start/.test(error.authorizeUrl)
  );
});

test("group member loading encodes the group id", async () => {
  let requestedUrl = "";
  const result = await loadDingTalkGroupMembers("group/1", async url => {
    requestedUrl = String(url);
    return Response.json({ members: [{ unionId: "u1", name: "甲" }], skippedCount: 0, executorLimit: 50 });
  });

  assert.match(requestedUrl, /\/api\/dingtalk\/groups\/group%2F1\/members$/);
  assert.equal(result.members[0].unionId, "u1");
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
node --test react-tests/dingtalk-groups-client.test.mjs
```

Expected: FAIL because `src/domain/dingTalkGroups.js` does not exist.

- [ ] **Step 3: Implement the client**

Use one JSON request helper. On non-2xx responses throw an `Error` extended with `code`, `status`, and `authorizeUrl` only for `GROUP_AUTH_REQUIRED`. Build the authorization URL from a relative return path:

```js
export function groupAuthorizationUrl(returnTo = "/#progress") {
  return `/api/auth/dingtalk/group/start?returnTo=${encodeURIComponent(returnTo)}`;
}
```

Never accept or attach an access token in frontend functions.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
node --test react-tests/dingtalk-groups-client.test.mjs
```

Expected: PASS.

Commit:

```bash
git add src/domain/dingTalkGroups.js react-tests/dingtalk-groups-client.test.mjs
git commit -m "feat(progress): add DingTalk group browser client"
```

---

### Task 7: Integrate the Group Executor Picker UI

**Files:**
- Create: `src/features/progress/GroupExecutorPicker.jsx`
- Modify: `src/features/progress/TodoSyncModal.jsx`
- Modify: `src/styles.css`
- Create: `react-tests/dingtalk-group-picker.test.mjs`

**Interfaces:**
- Consumes: Task 5 selection functions and Task 6 API client.
- Produces: a controlled `GroupExecutorPicker({ users, selection, onChange, disabled })`; `TodoSyncModal` still calls `onSync({ executors })` with no group fields.

- [ ] **Step 1: Write failing UI contract tests**

Read the component source and assert these stable behaviors:

```js
test("todo sync offers person and group search modes", () => {
  assert.match(source, /按人员/);
  assert.match(source, /按群聊/);
  assert.match(source, /搜索群名称/);
});

test("selected groups load members and report skipped people", () => {
  assert.match(source, /loadDingTalkGroupMembers/);
  assert.match(source, /skippedCount/);
  assert.match(source, /带入/);
});

test("todo submission still sends only selected executor users", () => {
  assert.match(modalSource, /onSync\(\{ executors: selectedUsers \}\)/);
  assert.doesNotMatch(modalSource, /onSync\(\{[^}]*groups/);
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
node --test react-tests/dingtalk-group-picker.test.mjs
```

Expected: FAIL because `GroupExecutorPicker.jsx` does not exist.

- [ ] **Step 3: Build the controlled picker**

Implement an accessible segmented control with `button` elements and `aria-pressed`. Person mode filters cached organization users. Group mode:

- waits for a non-empty trimmed query;
- debounces search by 300 ms and cancels stale responses with `AbortController` or a request sequence guard;
- shows loading, empty, permission, and retry states separately;
- disables a group row while its members load;
- calls `addGroupExecutors` only after the complete member response succeeds;
- renders selected group chips with remove buttons;
- renders the final selected-person list in both modes so individual removal remains available;
- renders a “重新授权” link only for `GROUP_AUTH_REQUIRED`.

All interactive targets must have visible focus styles and a minimum 36 px height. Do not add animation libraries.

- [ ] **Step 4: Refactor `TodoSyncModal` to the pure selection model**

Replace `selectedUnionIds` with `selection`. On open, call:

```js
setSelection(initialExecutorSelection(users, task?.dingTodo?.executorUnionIds || []));
```

Derive:

```js
const selectedUsers = selectedExecutorUsers(selection);
```

Keep the existing due-date validation, loading layer, error alert, and exact submission contract:

```js
await onSync({ executors: selectedUsers });
```

Closing the modal discards `selection`; no group metadata is written to the task.

- [ ] **Step 5: Add responsive styles**

Add classes scoped under `.todo-executor-picker` for the mode switch, search box, group rows, selected group chips, summary, and errors. At widths below 640 px, keep the mode buttons in one row, make chips wrap, and keep the member list within the modal viewport. Reuse existing CSS variables for color, radius, spacing, borders, focus rings, and control height.

- [ ] **Step 6: Run focused UI and build checks**

Run:

```bash
node --test react-tests/dingtalk-group-selection.test.mjs react-tests/dingtalk-groups-client.test.mjs react-tests/dingtalk-group-picker.test.mjs react-tests/task-todo.test.mjs
npm run build
```

Expected: all focused tests PASS and Vite build exits 0.

- [ ] **Step 7: Commit the picker UI**

```bash
git add src/features/progress/GroupExecutorPicker.jsx src/features/progress/TodoSyncModal.jsx src/styles.css react-tests/dingtalk-group-picker.test.mjs
git commit -m "feat(progress): select todo executors from DingTalk groups"
```

---

### Task 8: Full Verification and Real DingTalk Acceptance

**Files:**
- Modify only if a test exposes a defect in files already listed above.

**Interfaces:**
- Consumes: completed Tasks 1–7 and enterprise DingTalk test accounts.
- Produces: verified desktop-web and embedded behavior with no regression to person-only todo sync.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run build
git diff --check HEAD~6..HEAD
```

Expected: all tests PASS, build exits 0, and diff check prints nothing.

- [ ] **Step 2: Verify desktop web behavior**

Start the local preview:

```bash
npm run dev
```

In an authenticated desktop browser:

1. Open 产品进度 and a task with a valid due date.
2. Open 同步到钉钉待办 and switch to 按群聊.
3. Search a known visible group and select it.
4. Confirm the displayed member count equals the group roster minus explicitly reported skipped users.
5. Remove one person and submit.
6. Confirm only the remaining people are todo executors and the group receives no message.

Expected: all six checks pass without exposing a token in browser storage or network response bodies.

Run a visual audit at 1440×900 and 390×844. Verify hierarchy, spacing, alignment, selected/hover/focus states, chip wrapping, list scrolling, error placement, and that the footer buttons remain reachable. Capture screenshots for both widths and fix any clipped text, horizontal overflow, or control smaller than 36 px before continuing.

- [ ] **Step 3: Verify DingTalk embedded behavior**

Open the same existing authorized test deployment inside DingTalk and repeat Step 2. If the account has no stored group token, verify the one-time authorization returns to the same product progress context, then repeat the group search. If no authorized test deployment exists, stop and request deployment approval rather than publishing automatically.

Expected: search visibility and member counts match the same account on desktop web.

- [ ] **Step 4: Verify failure states**

With controlled test accounts or mocked upstream responses, verify:

- no group permission shows a reauthorization action;
- expired access token refreshes once;
- inaccessible/deleted group shows a retryable error and adds no partial members;
- overlapping groups de-duplicate people;
- removing one group preserves manual and other-group sources;
- executor overflow blocks submit and never truncates.

- [ ] **Step 5: Review the final diff and commit any verification-only fixes**

Run:

```bash
git status --short
git diff --check
git log --oneline -8
```

Expected: only intended files are changed. If verification required code fixes, rerun the affected focused test plus `npm test` and commit those fixes with a narrow message. If no fixes were required, do not create an empty commit.
