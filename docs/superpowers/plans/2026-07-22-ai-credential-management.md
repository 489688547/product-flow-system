# AI 凭据管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「AI 大模型 → 模型与安全设置」直接安全保存、更新和按需查看灵算 AI 网关凭据。

**Architecture:** 继续使用 `/api/platform/v1/platform-connections` 与 `platform_credentials` 保险箱保存和验证凭据；新增只针对已启用保险箱版本的 reveal 路由，复用最高权限与 15 分钟新鲜会话校验。React 页面嵌入单平台连接表单，明文只进入组件内存并在 5 分钟、页面隐藏、保存、折叠或卸载时清除。

**Tech Stack:** React、Vite、Cloudflare Pages Functions、Cloudflare D1、Web Crypto、Node.js 内建测试。

## Global Constraints

- 只回显保险箱中当前启用的 `lingsuan-ai-gateway` 凭据；环境变量回退值永不返回浏览器。
- 查看必须是最高权限账号、会话创建不超过 15 分钟、填写用途并输入确认语「查看灵算凭据」。
- 同一平台 15 分钟最多成功查看 5 次；成功响应使用 `Cache-Control: private, no-store`。
- 明文不得写入日志、审计、URL、浏览器存储、Provider 状态 API 或错误响应。
- 浏览器明文 5 分钟后清除，并在保存、折叠、`visibilitychange`、卸载时立即清除。
- 凭据仍先只读验证再原子切换；保存失败不得影响当前有效版本。
- 每项生产代码修改前先运行对应失败测试并确认失败原因。

---

## File Structure

- `migrations/0010_platform_credential_reveal.sql`：为平台凭据审计增加非敏感 `purpose` 字段。
- `functions/api/platform/_shared/platformCredentials.js`：解密当前启用的保险箱版本、写 reveal 审计、执行频率限制。
- `functions/api/platform/v1/platform-connections/[platformId]/reveal.js`：查看请求的认证、确认语、用途、no-store 与安全错误合同。
- `src/state/platformConnectionsApi.js`：封装 reveal 请求。
- `src/state/usePlatformConnections.js`：保留服务端 `canManage` 并提供 reveal 操作。
- `src/features/data-center/PlatformConnectionsWorkspace.jsx`：复用连接表单并提供暂态查看面板和清除生命周期。
- `src/features/data-center/AiProviderSettings.jsx`：在 AI 设置中嵌入灵算单平台连接管理，删除旧数据接入链接。
- `src/features/data-center/AiModelWorkspace.jsx`：设置折叠时通知子组件清除明文。
- `tests/platform-credential-storage.test.mjs`、`tests/platform-connections-reveal-api.test.mjs`：存储与路由安全合同。
- `react-tests/platform-connections.test.mjs`、`react-tests/ai-provider-settings.test.mjs`：嵌入入口、显示/清除与中文文案合同。
- `docs/platform/*`、`PRODUCT.md`、`DESIGN.md`：反写 API、错误、集成、环境与长期产品设计规则。

### Task 1: Secure reveal storage and API

**Interfaces:**
- Produces: `revealPlatformCredentials(db, platformId, context) -> { platformId, fields, expiresAt }`
- Produces: `assertPlatformCredentialRevealRateLimit(db, platformId, options?)`
- Produces: `POST /api/platform/v1/platform-connections/:platformId/reveal`

- [ ] **Step 1: Write failing storage and API tests**

Add tests asserting vault reveal succeeds only for a fresh executive session, rejects employees/stale sessions/wrong confirmation/missing purpose/environment-only sources, applies five-per-15-minute limit, emits no-store, and stores only purpose metadata in audit.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/platform-credential-storage.test.mjs tests/platform-connections-reveal-api.test.mjs`

Expected: FAIL because the reveal exports and route do not exist.

- [ ] **Step 3: Add migration and minimal storage implementation**

Add `purpose TEXT NOT NULL DEFAULT ''`; decrypt only an enabled row with the platform master key; reject missing/disabled/environment sources; query recent successful `reveal` audits; insert a reveal audit whose `changed_fields` is `[]` and whose `purpose` contains only the cleaned user purpose.

- [ ] **Step 4: Add minimal reveal route**

Accept only `{ purpose, confirmation }`, require `confirmation === "查看灵算凭据"`, call `authorizeCredentialAction(session, "credential:reveal", { scopeType: "company" })`, restrict the route to `lingsuan-ai-gateway`, and return explicit `revealedAt/expiresAt` with private no-store headers.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/platform-credential-storage.test.mjs tests/platform-connections-reveal-api.test.mjs tests/platform-connections-api.test.mjs`

Expected: all tests PASS and no response/audit contains ciphertext, IV, or unrelated secrets.

### Task 2: AI-page credential UI

**Interfaces:**
- Consumes: reveal API from Task 1.
- Produces: `revealPlatformConnection({ platformId, purpose, confirmation })` and controller `canManage/reveal`.
- Produces: embedded `PlatformConnectionsWorkspace` with `showBackButton={false}` and `onConnectionChange`.

- [ ] **Step 1: Write failing UI source/behavior tests**

Assert the AI page embeds only `lingsuan-ai-gateway`, contains no `#/data-sources/company` link, offers explicit reveal confirmation, renders revealed fields read-only, and installs timer/visibility/collapse cleanup.

- [ ] **Step 2: Verify RED**

Run: `node --test react-tests/platform-connections.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/ai-model-governance.test.mjs`

Expected: FAIL because the AI page still points to data access and the reusable form has no reveal controls.

- [ ] **Step 3: Implement client/controller changes**

Use the platform-specific reveal URL with encoded platform ID; keep `canManage` from GET; expose `reveal`; do not persist reveal results in the shared connection list.

- [ ] **Step 4: Implement transient reveal panel**

Require purpose and confirmation before calling reveal; render each returned configured field in a read-only password input with per-field local show/hide; clear the response on a 5-minute timer, save, disable, page hidden, collapse notification, and unmount.

- [ ] **Step 5: Embed in AI settings**

Mount `PlatformConnectionsWorkspace` with `platformIds={["lingsuan-ai-gateway"]}`, `initialPlatformId="lingsuan-ai-gateway"`, no back button, and a local `usePlatformConnections` controller. Refresh model status after connection save/disable; update safe error copy to point to AI model settings.

- [ ] **Step 6: Verify GREEN**

Run: `node --test react-tests/platform-connections.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/ai-model-governance.test.mjs`

Expected: all tests PASS; keyboard labels and disabled states are present.

### Task 3: Durable rules, manifests, and release verification

**Interfaces:**
- Consumes: Tasks 1-2 behavior.
- Produces: documented platform contract, migration manifest, generated modules, complete verification evidence.

- [ ] **Step 1: Write failing migration/manifest contract tests**

Assert migration `0010` adds `purpose`, environment capability expects it, registry owns the reveal route, and API/error docs name the new contract.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/environment-capabilities.test.mjs tests/integration-registry.test.mjs`

Expected: FAIL against the old migration/registry expectations.

- [ ] **Step 3: Update durable sources and generate modules**

Update `PRODUCT.md`, `DESIGN.md`, platform API catalog/details, integrations, error codes, environment capabilities, integration registry, feature plan/tasks, then run `npm run generate:platform-manifests`. Document rollback as application rollback while retaining the additive audit column.

- [ ] **Step 4: Run focused and full verification**

Run the focused Node/React tests, then:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: every command exits 0.

- [ ] **Step 5: Release through protected workflow**

Inspect `git status --short`, stage only feature files, update from `origin/main`, push the branch, open a PR with `Integration-Impact` and `Rule-Writeback`, merge after CI, apply D1 migration `0010`, run `npm run release:pages`, and verify production readiness plus the AI settings page. Never print or capture revealed values during verification.
