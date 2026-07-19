# Platform Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让最高权限管理员在数据中心配置并验证钉钉、快麦公司连接，服务端加密保存，现有环境变量保持回退。

**Architecture:** React 数据中心只访问 `/api/platform/v1/platform-connections`；Pages Functions 使用平台字段白名单、最高权限校验、只读连接测试和 AES-256-GCM D1 保险箱。钉钉、快麦和环境就绪检查统一通过异步解析器读取“启用保险箱优先、旧环境变量回退”的当前配置。

**Tech Stack:** React 19、Vite 7、Cloudflare Pages Functions、D1、Web Crypto AES-GCM、Node test runner。

## Global Constraints

- 老板日常界面不得出现环境变量、D1、AES、绑定或密文术语。
- 浏览器、API 响应、日志与审计不得返回或记录已保存凭据值。
- 候选配置验证失败不得替换当前连接。
- 阿里云没有真实适配器时只显示“准备接入”。
- 每个行为必须先运行失败测试，再写最小实现。
- 变更必须同步环境清单、集成注册表、平台文档和 ADR。

---

### Task 1: Credential crypto and storage

**Files:**
- Create: `functions/api/platform/_shared/credentialCrypto.js`
- Create: `functions/api/platform/_shared/platformCredentials.js`
- Create: `migrations/0003_platform_credentials.sql`
- Test: `tests/platform-credential-crypto.test.mjs`
- Test: `tests/platform-credential-storage.test.mjs`

**Interfaces:**
- Produces: `encryptPlatformCredentials(payload, options)`、`decryptPlatformCredentials(record, options)`、`readPlatformCredentials(env, platformId)`、`savePlatformCredentials(db, input, context)`、`disablePlatformCredentials(db, input, context)`。

- [ ] **Step 1: Write the failing crypto test**

```js
test("platform credentials round-trip without plaintext persistence", async () => {
  const encrypted = await encryptPlatformCredentials({ appKey: "key", appSecret: "secret" }, {
    masterKey: key(), platformId: "dingtalk", keyVersion: 1
  });
  assert.doesNotMatch(JSON.stringify(encrypted), /key|secret/);
  assert.deepEqual(await decryptPlatformCredentials(encrypted, {
    masterKey: key(), platformId: "dingtalk", keyVersion: 1
  }), { appKey: "key", appSecret: "secret" });
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/platform-credential-crypto.test.mjs`
Expected: FAIL because `credentialCrypto.js` does not exist.

- [ ] **Step 3: Implement the minimal crypto API**

```js
export async function encryptPlatformCredentials(payload, { masterKey, platformId, keyVersion = 1 }) {
  const key = await importMasterKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(platformId, keyVersion) }, key, encoder.encode(JSON.stringify(payload)));
  return { ciphertext: encode(ciphertext), iv: encode(iv), algorithm: "AES-256-GCM", keyVersion };
}
```

- [ ] **Step 4: Verify GREEN and tamper behavior**

Run: `node --test tests/platform-credential-crypto.test.mjs`
Expected: PASS for round-trip, wrong key, tamper and platform-bound additional data.

- [ ] **Step 5: Write failing storage tests**

```js
test("failed candidate never replaces the active version", async () => {
  const before = await seedActive(db, "dingtalk");
  await assert.rejects(() => savePlatformCredentials(db, candidate, context({ validate: reject })), /验证失败/);
  assert.deepEqual(await currentRow(db, "dingtalk"), before);
});
```

- [ ] **Step 6: Verify RED, implement migration and storage, verify GREEN**

Run: `node --test tests/platform-credential-storage.test.mjs`
Expected before implementation: FAIL because storage exports do not exist. Expected after implementation: PASS for create, replace, conflict, disable, audit and environment fallback.

- [ ] **Step 7: Commit**

```bash
git add functions/api/platform/_shared/credentialCrypto.js functions/api/platform/_shared/platformCredentials.js migrations/0003_platform_credentials.sql tests/platform-credential-crypto.test.mjs tests/platform-credential-storage.test.mjs
git commit -m "feat(platform): add encrypted credential vault"
```

### Task 2: Governed API and provider validation

**Files:**
- Create: `functions/api/platform/_shared/platformConnectionTesters.js`
- Create: `functions/api/platform/v1/platform-connections.js`
- Create: `tests/platform-connections-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: storage functions from Task 1.
- Produces: `GET|PUT|DELETE /api/platform/v1/platform-connections` and `testPlatformConnection(platformId, values, fetchImpl)`.

- [ ] **Step 1: Write failing authorization and safe-response tests**

```js
test("employees read metadata but only executives replace credentials", async () => {
  const read = await call("GET", employee);
  assert.equal(read.status, 200);
  assert.doesNotMatch(await read.clone().text(), /saved-secret/);
  assert.equal((await call("PUT", employee, body)).status, 403);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/platform-connections-api.test.mjs`
Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement provider testers**

```js
const TESTERS = {
  dingtalk: async ({ appKey, appSecret }, fetchImpl) => getDingTokenWithCredentials(appKey, appSecret, fetchImpl),
  kuaimai: async (values, fetchImpl) => callKuaimai("open.system.time.get", {}, values, fetchImpl)
};
```

Wrap each tester with an 8-second `AbortController`; return safe code/message only.

- [ ] **Step 4: Implement GET, PUT and DELETE**

```js
if (request.method === "PUT") {
  assertPlatformAdmin(data.session);
  const input = normalizeConnectionUpdate(await request.json());
  const saved = await validateAndSavePlatformConnection(db, input, context);
  return jsonResponse({ synced: true, connection: saved });
}
```

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/platform-connections-api.test.mjs`
Expected: PASS for methods, session, permission, validation, timeout, failure preservation, success, conflict and no-secret response.

- [ ] **Step 6: Add the new test file to `test:api` and commit**

```bash
git add functions/api/platform/_shared/platformConnectionTesters.js functions/api/platform/v1/platform-connections.js tests/platform-connections-api.test.mjs package.json
git commit -m "feat(platform): expose governed connection API"
```

### Task 3: Resolve managed credentials in integrations and readiness

**Files:**
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Modify: `functions/api/dingtalk/config.js`
- Modify: `functions/api/dingtalk/org/status.js`
- Modify: `functions/api/auth/dingtalk/start.js`
- Modify: `functions/api/auth/_shared/ding-user-token.js`
- Modify: `functions/api/kuaimai/_shared/kuaimai.js`
- Modify: `functions/api/kuaimai/status.js`
- Modify: `functions/api/kuaimai/pull.js`
- Modify: `functions/api/kuaimai/refresh.js`
- Modify: `functions/api/platform/_shared/environmentReadiness.js`
- Test: existing DingTalk, Kuaimai and readiness tests.

**Interfaces:**
- Consumes: `platformEnv(env, platformId)` and `configuredCredentialEnvVars(db)`.
- Produces: async `resolveDingCredentials(env)` and `resolveKuaimaiConfig(env)` while preserving existing pure environment helpers for unit compatibility.

- [ ] **Step 1: Add failing resolver tests**

```js
test("vault credentials override stale environment values", async () => {
  const resolved = await resolveDingCredentials(envWithVaultAndLegacy);
  assert.equal(resolved.appKey, "vault-key");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/dingtalk-api.test.mjs tests/kuaimai-api.test.mjs tests/environment-readiness-api.test.mjs`
Expected: FAIL because managed credentials are not resolved.

- [ ] **Step 3: Update adapters and public login bootstrap**

```js
export async function resolveDingCredentials(env = {}) {
  return getDingCredentials(await platformEnv(env, "dingtalk"));
}
```

All async token paths use the resolver. Synchronous pure helpers remain for existing environment-only unit tests.

- [ ] **Step 4: Update readiness**

Treat a manifest `envVar` as present when `env[name]` exists or the enabled vault row lists the corresponding configured field and the master key is valid.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test tests/dingtalk-api.test.mjs tests/dingtalk-web-auth.test.mjs tests/kuaimai-api.test.mjs tests/environment-readiness-api.test.mjs`
Expected: PASS, with vault priority and environment fallback both covered.

```bash
git add functions/api/dingtalk functions/api/auth/dingtalk functions/api/auth/_shared/ding-user-token.js functions/api/kuaimai functions/api/platform/_shared/environmentReadiness.js tests
git commit -m "feat(integrations): resolve managed credentials"
```

### Task 4: Boss-friendly Data Center workspace

**Files:**
- Create: `src/domain/platformConnections.js`
- Create: `src/state/platformConnectionsApi.js`
- Create: `src/features/data-center/PlatformConnectionsWorkspace.jsx`
- Create: `src/features/data-center/platform-connections.css`
- Modify: `src/App.jsx`
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Create: `react-tests/platform-connections.test.mjs`
- Modify: `react-tests/data-center-app.test.mjs`

**Interfaces:**
- Consumes: the v1 API from Task 2.
- Produces: `PlatformConnectionsWorkspace({ canManage })` and navigation screen `data-connections`.

- [ ] **Step 1: Write failing navigation and UI structure tests**

```js
test("data center exposes platform-specific connection management", () => {
  assert.match(app, /data-connections/);
  assert.match(workspace, /保存并验证/);
  assert.match(workspace, /原连接未受影响/);
  assert.doesNotMatch(workspace, /DINGTALK_APP_KEY|PLATFORM_CREDENTIAL_MASTER_KEY/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test react-tests/platform-connections.test.mjs react-tests/data-center-app.test.mjs`
Expected: FAIL because the workspace and route do not exist.

- [ ] **Step 3: Implement platform definitions and API client**

```js
export const PLATFORM_CONNECTION_DEFINITIONS = [
  { id: "dingtalk", name: "钉钉", fields: [{ key: "appKey", label: "应用凭证", type: "text" }, { key: "appSecret", label: "应用密钥", type: "password" }] },
  { id: "kuaimai", name: "快麦 ERP", fields: [...] },
  { id: "aliyun", name: "阿里云", available: false, disabledReason: "当前尚无可用的系统适配器" }
];
```

- [ ] **Step 4: Implement list, detail form and states**

Use native buttons, labels and password inputs. Keep entered secrets only in component state; clear them after success and never write to storage.

- [ ] **Step 5: Implement restrained responsive CSS**

Use existing tokens, 12px panel radius, no nested cards, no decorative gradients, visible focus, 44px narrow-screen controls and reduced-motion handling.

- [ ] **Step 6: Verify GREEN and commit**

Run: `node --test react-tests/platform-connections.test.mjs react-tests/data-center-app.test.mjs`
Expected: PASS for navigation, Chinese copy, no technical secret names, loading/error/no-permission/disabled states and responsive CSS.

```bash
git add src/domain/platformConnections.js src/state/platformConnectionsApi.js src/features/data-center src/App.jsx react-tests
git commit -m "feat(data): add platform connection workspace"
```

### Task 5: Durable rules, manifests and release

**Files:**
- Modify: `AGENTS.md`
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/integrations.md`
- Modify: `docs/platform/error-codes.md`
- Modify: generated manifest modules.

**Interfaces:**
- Produces: durable platform connection rule and deploy-time capability `platform-credential-vault`.

- [ ] **Step 1: Write failing governance/environment expectations**

Update tests to require the new D1 tables, root secret name, API route and registered code paths; run them before manifest changes.

- [ ] **Step 2: Verify RED, update durable files, regenerate manifests**

Run: `npm run generate:platform-manifests`
Expected: generated modules match JSON sources after updates.

- [ ] **Step 3: Run focused and full verification**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
```

Expected: every command exits 0; all tests pass; no unintended files appear in `git status --short`.

- [ ] **Step 4: Apply production migration and root secret**

Use the existing authenticated Wrangler context. Generate 32 random bytes locally, pipe the Base64URL value directly to `wrangler pages secret put PLATFORM_CREDENTIAL_MASTER_KEY`, and never print or persist it. Apply `migrations/0003_platform_credentials.sql` to the production D1 database.

- [ ] **Step 5: Deploy and verify**

Deploy the verified `main` build, then run:

```bash
npm run verify:production -- --require-platform dingtalk --require-platform kuaimai
```

Expected: both affected platforms report no warning or blocking capability. Browser checks cover list, admin form, read-only view and narrow screen without entering real credentials on behalf of the user.

- [ ] **Step 6: Commit release documentation**

```bash
git add AGENTS.md PRODUCT.md DESIGN.md docs functions/api/platform/_generated
git commit -m "docs(platform): govern managed connections"
```
