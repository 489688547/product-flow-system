# 展示数据库环境实施计划

> **执行提示：** 按任务顺序逐项实施，每个任务先写失败测试，再做最小实现。可在新任务中使用 `superpowers:executing-plans`；如用户明确要求并行代理，再使用 `superpowers:subagent-driven-development`。

**目标：** 新增一个独立的展示 D1，并让最高权限用户在设置中为当前浏览器切换正式/展示业务数据；展示销售可加总事实为真实来源两倍，比例保持一致，真实采集写入所选业务库，展示环境外部写动作统一模拟。

**架构：** `PRODUCT_FLOW_DB` 同时承担正式业务库和不可切换的控制库；新增 `DEMO_FLOW_DB` 只存展示业务数据。认证中间件先使用控制库解析身份，再由共享数据环境路由解析 HttpOnly 授权并向业务模块注入 `businessDb`。展示刷新是单库维护式、服务端分步和可续跑任务；刷新成功才推进环境版本并恢复使用。

**技术栈：** React、Vite、Cloudflare Pages Functions、Cloudflare D1、Node test runner、Wrangler 3.x 兼容构建。

**关联文档：**

- `docs/features/demo-data-environment/prd.md`
- `docs/features/demo-data-environment/design.md`
- `docs/features/demo-data-environment/tasks.md`

## 实施前约束

1. 新实施分支必须先包含最新 `origin/main`，编码前和合并前均运行 `npm run check:branch-base`。
2. 当前工作区存在其他未提交修改；只暂存本功能文件，禁止覆盖或顺带提交。
3. 本地线上模式 `npm start` 使用受治理的远程正式/展示绑定；试验性数据写入仍使用 `npm run seed:sandbox` 和 `npm run start:sandbox`。
4. 每个新增业务 API 必须通过统一数据环境路由。直接解析 `PRODUCT_FLOW_DB` 只允许存在于登记的控制面模块。
5. 未登记到展示数据目录的表默认不复制。
6. 展示环境刷新期间和失败后均不读取正式库兜底。
7. Cloudflare、钉钉、快麦、ERP 文件相关变更必须同步更新集成注册表和持久规则。

---

## 任务 1：固化数据库、环境与迁移合同

**修改文件：**

- 新增：`migrations/0011_demo_data_environment.sql`
- 修改：`wrangler.toml`
- 修改：`docs/platform/environment-capabilities.json`
- 修改：`scripts/generate-environment-capabilities.mjs`
- 修改：`scripts/check-pages-environment-parity.mjs`
- 修改：`tests/environment-capabilities.test.mjs`
- 修改：`tests/pages-environment-parity.test.mjs`
- 修改：`tests/environment-readiness-api.test.mjs`
- 新增：`tests/demo-data-environment-migration.test.mjs`
- 新增：`tests/cloudflare-pages-compat.test.mjs`
- 生成：`functions/api/platform/_generated/environmentCapabilities.js`

### 1.1 先写失败测试

在 `tests/pages-environment-parity.test.mjs` 增加双绑定合同：

```js
test("requires distinct production and display D1 bindings in every environment", () => {
  const source = [
    d1("d1_databases", "PRODUCT_FLOW_DB", "prod-id"),
    d1("d1_databases", "DEMO_FLOW_DB", "display-id"),
    d1("env.preview.d1_databases", "PRODUCT_FLOW_DB", "prod-id"),
    d1("env.preview.d1_databases", "DEMO_FLOW_DB", "display-id"),
    d1("env.production.d1_databases", "PRODUCT_FLOW_DB", "prod-id"),
    d1("env.production.d1_databases", "DEMO_FLOW_DB", "display-id")
  ].join("\n");

  assert.deepEqual(inspectWranglerD1Bindings(source), {
    local: { PRODUCT_FLOW_DB: "prod-id", DEMO_FLOW_DB: "display-id" },
    preview: { PRODUCT_FLOW_DB: "prod-id", DEMO_FLOW_DB: "display-id" },
    production: { PRODUCT_FLOW_DB: "prod-id", DEMO_FLOW_DB: "display-id" }
  });
  assert.deepEqual(validateD1Bindings(inspectWranglerD1Bindings(source)), []);
});

test("rejects a display binding that points at the production database", () => {
  const bindings = {
    local: { PRODUCT_FLOW_DB: "same-id", DEMO_FLOW_DB: "same-id" },
    preview: { PRODUCT_FLOW_DB: "same-id", DEMO_FLOW_DB: "same-id" },
    production: { PRODUCT_FLOW_DB: "same-id", DEMO_FLOW_DB: "same-id" }
  };

  assert.match(validateD1Bindings(bindings).join("\n"), /必须使用不同数据库/);
});
```

在 `tests/demo-data-environment-migration.test.mjs` 读取迁移 SQL 并断言：

```js
test("creates control-plane data environment tables without storing raw grants", async () => {
  const sql = await readFile(
    new URL("../migrations/0011_demo_data_environment.sql", import.meta.url),
    "utf8"
  );

  for (const table of [
    "data_environment_grants",
    "demo_data_environment_state",
    "demo_data_refresh_jobs",
    "data_environment_audit"
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /token_hash TEXT NOT NULL UNIQUE/);
  assert.doesNotMatch(sql, /\btoken_plaintext\b|\bsecret_value\b/);
});
```

### 1.2 实现控制面迁移

`migrations/0011_demo_data_environment.sql` 创建：

- `data_environment_grants`
  - `id`, `token_hash`, `actor_id`, `environment_id`, `environment_version`
  - `expires_at`, `revoked_at`, `created_at`, `updated_at`
  - `CHECK (environment_id IN ('production','display'))`
- `demo_data_environment_state`
  - 单例 `id='display'`
  - `enabled`, `status`, `version`, `active_job_id`, `rule_version`
  - `source_updated_at`, `coverage_json`, `validation_json`
  - `last_error_code`, `updated_by`, `updated_at`
  - `CHECK (status IN ('empty','ready','refreshing','failed'))`
- `demo_data_refresh_jobs`
  - `id`, `status`, `stage`, `current_table`, `cursor_json`
  - `source_version`, `rule_version`, `counts_json`
  - `last_error_code`, `actor_id`, `created_at`, `started_at`, `finished_at`
- `data_environment_audit`
  - `id`, `actor_id`, `action`, `environment_id`, `environment_version`
  - `job_id`, `result_code`, `created_at`

迁移还为需要异步运行的采集控制表增加：

- `target_environment TEXT NOT NULL DEFAULT 'production'`
- `target_environment_version INTEGER NOT NULL DEFAULT 1`

适用表以现有迁移实际创建的 web collection、ERP collection job/batch/run 表为准；使用 `ALTER TABLE` 前先确认真实表名，不创建重复影子表。

### 1.3 配置双 D1

`wrangler.toml` 的根、Preview 和 Production 环境都登记两个条目：

```toml
[[d1_databases]]
binding = "PRODUCT_FLOW_DB"
database_name = "product-flow-system"
remote = true

[[d1_databases]]
binding = "DEMO_FLOW_DB"
database_name = "product-flow-system-display"
remote = true
```

以上片段只展示稳定字段；每个条目还必须保留或写入真实 `database_id`。`PRODUCT_FLOW_DB` 保留仓库当前正式 ID；先通过 Wrangler 创建 `product-flow-system-display`，再把工具返回的展示 ID 写入 `DEMO_FLOW_DB`，不得猜测 ID。Preview 与 Production 对同一 binding 使用相同 ID，而两个 binding 的 ID 必须不同。

### 1.4 扩展环境能力清单

在 `docs/platform/environment-capabilities.json`：

- 将 D1 从单绑定描述扩展为 `PRODUCT_FLOW_DB` 与 `DEMO_FLOW_DB`。
- 为每个 binding 声明 required environments、required tables 和用途。
- `PRODUCT_FLOW_DB` 包含控制面表和全部正式业务表。
- `DEMO_FLOW_DB` 只要求展示所需业务表，明确排除会话、凭证、令牌和审计秘密表。

生成器输出绑定级合同；`environmentReadiness` 按 binding 检查表，错误只返回安全表名和绑定别名。

### 1.5 验证

```bash
node --test tests/demo-data-environment-migration.test.mjs
node --test tests/pages-environment-parity.test.mjs
node --test tests/environment-capabilities.test.mjs
node --test tests/environment-readiness-api.test.mjs
node scripts/generate-platform-manifests.mjs
npm run check:environment-capabilities
node --test tests/cloudflare-pages-compat.test.mjs
```

### 1.6 提交边界

只提交迁移、环境清单、生成模块、Wrangler 配置、检查脚本和对应测试：

```bash
git commit -m "feat: register display database environment"
```

---

## 任务 2：建立共享数据环境控制面与 API

**新增文件：**

- `functions/api/platform/_shared/dataEnvironmentStorage.js`
- `functions/api/platform/_shared/dataEnvironment.js`
- `functions/api/platform/v1/data-environment.js`
- `tests/helpers/data-environment-d1-mock.mjs`
- `tests/data-environment-api.test.mjs`
- `tests/data-environment-routing.test.mjs`

**修改文件：**

- `functions/api/_middleware.js`
- `docs/platform/api-catalog.md`
- `docs/platform/error-codes.md`

### 2.1 先写存储和路由失败测试

`tests/data-environment-routing.test.mjs` 覆盖：

```js
test("defaults authenticated requests to the production business database", async () => {
  const data = { session: executiveSession };
  const resolved = await resolveDataEnvironment(
    makeContext({ PRODUCT_FLOW_DB: productionDb, DEMO_FLOW_DB: displayDb }, data)
  );

  assert.equal(resolved.id, "production");
  assert.equal(resolved.businessDb, productionDb);
});

test("uses display D1 only for a valid ready grant", async () => {
  controlDb.seedGrant(hashToken("browser-grant"), {
    actorId: executiveSession.user.id,
    environmentId: "display",
    environmentVersion: 7
  });
  controlDb.seedDisplayState({ enabled: 1, status: "ready", version: 7 });

  const resolved = await resolveDataEnvironment(
    makeContext(
      { PRODUCT_FLOW_DB: controlDb, DEMO_FLOW_DB: displayDb },
      { session: executiveSession },
      "pfs_data_environment=browser-grant"
    )
  );

  assert.equal(resolved.id, "display");
  assert.equal(resolved.version, 7);
  assert.equal(resolved.businessDb, displayDb);
});

test("does not fall back when display is refreshing", async () => {
  seedValidDisplayGrant({ state: "refreshing", version: 7 });
  await assert.rejects(() => resolveDataEnvironment(displayContext), {
    code: "DATA_ENVIRONMENT_MAINTENANCE",
    status: 503
  });
});

test("rejects stale environment versions on business writes", () => {
  assert.throws(
    () => assertEnvironmentWriteVersion(requestWithVersion("6"), { version: 7 }),
    { code: "DATA_ENVIRONMENT_VERSION_CONFLICT", status: 409 }
  );
});
```

`tests/data-environment-api.test.mjs` 覆盖非最高权限 403、GET 不泄露绑定、PUT 写 HttpOnly Cookie、展示未就绪拒绝选择、生产环境始终可选择、撤销旧授权和审计无秘密。

### 2.2 实现存储合同

`dataEnvironmentStorage.js` 只接受控制库，导出：

```js
export async function getDisplayEnvironmentState(controlDb) {}
export async function createEnvironmentGrant(controlDb, input) {}
export async function resolveEnvironmentGrant(controlDb, tokenHash) {}
export async function revokeEnvironmentGrant(controlDb, tokenHash, actorId) {}
export async function appendDataEnvironmentAudit(controlDb, event) {}
```

要求：

- 授权值使用 `crypto.getRandomValues` 生成至少 32 字节随机值。
- 数据库只保存 SHA-256 哈希。
- 授权绑定 `actor_id`，身份不一致时无效。
- Cookie 使用 `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=...`。
- 本地 loopback HTTP 仅在现有本地线上运行规则允许时省略 `Secure`，不弱化线上 Cookie。
- 审计使用稳定动作和结果码，不记录 Cookie。

### 2.3 实现统一路由合同

`dataEnvironment.js` 导出：

```js
export function controlDatabase(env) {
  return env.PRODUCT_FLOW_DB;
}

export async function resolveDataEnvironment(context) {}
export function businessDatabase(context) {}
export function assertEnvironmentWriteVersion(request, dataEnvironment) {}
export function withDataEnvironmentHeaders(response, dataEnvironment) {}
```

`resolveDataEnvironment` 只从服务端 Cookie 授权解析环境，返回：

```js
{
  id: "production" | "display",
  version: number,
  status: "ready",
  businessDb: D1Database
}
```

显示环境缺绑定、disabled、empty、refreshing、failed 或结构不匹配时分别返回稳定错误。请求 Query/Header/Body 中出现数据库 ID 不参与解析。

### 2.4 接入认证中间件

在 `functions/api/_middleware.js` 中保持顺序：

1. 用 `PRODUCT_FLOW_DB` 解析已有认证会话。
2. 对需要业务库的 `/api` 请求解析数据环境。
3. 注入：

```js
context.data.controlDb = context.env.PRODUCT_FLOW_DB;
context.data.dataEnvironment = resolved;
context.data.businessDb = resolved.businessDb;
```

4. 对非 GET/HEAD 业务请求校验 `X-Data-Environment-Version`。
5. 给业务响应加入：
   - `X-Data-Environment: production|display`
   - `X-Data-Environment-Version: <integer>`

认证、环境管理、健康检查和 Provider 回调使用明确的控制面路由 allowlist，避免解析展示库造成循环依赖。

### 2.5 实现 API

`GET /api/platform/v1/data-environment` 返回：

```json
{
  "current": { "id": "production", "version": 1 },
  "display": {
    "enabled": true,
    "status": "ready",
    "version": 7,
    "lastUpdatedAt": "2026-07-23T...",
    "sourceUpdatedAt": "2026-07-23T...",
    "coverage": {},
    "validation": {}
  },
  "permissions": { "canManage": true }
}
```

`PUT /api/platform/v1/data-environment` 只接受：

```json
{ "environmentId": "production" }
```

或：

```json
{ "environmentId": "display" }
```

环境选择成功后撤销当前授权、创建新授权、设置 Cookie，并返回新环境 ID 和版本。普通用户、未知枚举和未就绪展示环境被拒绝。

### 2.6 验证

```bash
node --test tests/data-environment-routing.test.mjs
node --test tests/data-environment-api.test.mjs
node --test tests/cloudflare-pages-compat.test.mjs
```

### 2.7 提交

```bash
git commit -m "feat: add governed data environment routing"
```

---

## 任务 3：强制所有业务存储使用选定数据库

**新增文件：**

- `scripts/check-data-environment-routing.mjs`
- `tests/data-environment-governance.test.mjs`

**修改范围：**

- `functions/api/brand-content.js`
- `functions/api/data-center.js`
- `functions/api/data-center/_shared/connectorStorage.js`
- `functions/api/data-center/_shared/storage.js`
- `functions/api/data-center/sales.js`
- `functions/api/ecommerce-operations/_shared/storage.js`
- `functions/api/hr-management.js`
- `functions/api/hr-management/_shared/storage.js`
- `functions/api/performance-management/_shared/storage.js`
- `functions/api/platform.js`
- `functions/api/platform/v1/_shared/collaborationStorage.js`
- `functions/api/platform/v1/_shared/dataStandardsStorage.js`
- `functions/api/platform/v1/data-connections/_shared/http.js`
- `functions/api/platform/v1/data-services/sales.js`
- `functions/api/platform/v1/goods-flow/_shared/route.js`
- `functions/api/platform/v1/goods-flow/_shared/storage.js`
- `functions/api/platform/v1/product-catalog.js`
- `functions/api/platform/v1/product-catalog/_shared/storage.js`
- `functions/api/platform/v1/product-catalog/import.js`
- `functions/api/platform/v1/user-insights/_shared/http.js`
- `functions/api/sales.js`
- `functions/api/state.js`
- `functions/api/supply-chain.js`
- `functions/api/supply-chain/_shared/storage.js`
- 以上存储的相关测试与 D1 mocks
- `package.json`

最终文件清单以实施时 `rg -l "PRODUCT_FLOW_DB" functions/api` 复核为准，但不得扩大到无关前端重构。

### 3.1 先写治理失败测试

`tests/data-environment-governance.test.mjs`：

```js
const CONTROL_PLANE_ALLOWLIST = new Set([
  "functions/api/_middleware.js",
  "functions/api/auth/_shared/session.js",
  "functions/api/auth/_shared/ding-user-token.js",
  "functions/api/platform/_shared/credentialVaultStorage.js",
  "functions/api/platform/_shared/environmentReadiness.js",
  "functions/api/platform/_shared/platformCredentials.js",
  "functions/api/platform/_shared/dataEnvironmentStorage.js",
  "functions/api/platform/_shared/dataEnvironment.js",
  "functions/api/platform/v1/production-write-session.js",
  "functions/api/platform/v1/production-data/state.js",
  "functions/api/platform/v1/production-data/store-connections.js"
]);

test("business routes do not resolve PRODUCT_FLOW_DB directly", async () => {
  const violations = await findDirectProductionDbReferences({
    root,
    allowlist: CONTROL_PLANE_ALLOWLIST
  });
  assert.deepEqual(violations, []);
});
```

AI 和采集控制模块在任务 7、9 完成前可暂列带原因的临时 allowlist；最终任务 10 必须移除临时项，只保留真正控制面解析。

### 3.2 改造存储接口

统一原则：

- Route 层从 `context.data.businessDb` 取得 D1。
- 存储函数签名显式接收 `db`，不再接收整个 `env` 后自行解析。
- 业务存储不得回退 `env.PRODUCT_FLOW_DB`。
- 控制面模块使用 `context.data.controlDb` 或 `controlDatabase(env)`。

示例：

```js
export async function onRequestGet(context) {
  const db = businessDatabase(context);
  const result = await readDataCenter(db, context.request);
  return withDataEnvironmentHeaders(json(result), context.data.dataEnvironment);
}
```

### 3.3 Whole-state 原子性不变

`functions/api/state.js` 使用选定的 `businessDb` 后，仍必须保留：

- 先读当前服务端 baseline。
- 写入携带完全相同 baseline。
- baseline 比较、revision 推进和分片替换在一个事务。
- 未变化 fingerprint 跳过写入。
- 每次接受写入执行写前快照和审计。

展示库的写前快照属于展示业务数据；生产修复网关仍是独立控制路径，不因展示选择改变。

### 3.4 加入治理命令

`package.json` 新增：

```json
{
  "scripts": {
    "check:data-environment-routing": "node scripts/check-data-environment-routing.mjs"
  }
}
```

并将其纳入 `check:governance`。脚本输出具体违规文件和行，不读取构建产物 `assets/`。

### 3.5 回归测试

逐类补充 production/display 两个 mock DB，断言：

- GET 只读当前库。
- POST/PUT/DELETE 只写当前库。
- 另一个库没有调用记录。
- 过期环境版本拒绝写入。

至少覆盖：

```bash
node --test tests/shared-state.test.mjs
node --test tests/sales-api.test.mjs
node --test tests/data-services-sales-api.test.mjs
node --test tests/product-catalog-sales-api.test.mjs
node --test tests/supply-chain-api.test.mjs
node --test tests/data-environment-governance.test.mjs
```

### 3.6 提交

```bash
git commit -m "refactor: route business storage by data environment"
```

---

## 任务 4：实现浏览器环境状态、缓存隔离和设置入口

**新增文件：**

- `src/state/dataEnvironmentApi.js`
- `src/state/DataEnvironmentProvider.jsx`
- `src/features/settings/DataEnvironmentSettings.jsx`
- `react-tests/data-environment-api.test.mjs`
- `react-tests/data-environment-provider.test.mjs`
- `react-tests/data-environment-settings.test.mjs`
- `react-tests/data-environment-cache.test.mjs`

**修改文件：**

- `src/App.jsx`
- `src/features/settings/SettingsPage.jsx`
- `src/state/stateApi.js`
- `src/state/ProductFlowProvider.jsx`
- `src/state/PlatformProvider.jsx`
- `src/state/SupplyChainProvider.jsx`
- `src/state/DataCenterProvider.jsx`
- `src/state/BrandContentProvider.jsx`
- `src/state/salesStore.js`
- 其他实际使用 `localStorage`、`sessionStorage` 或 IndexedDB 保存业务数据的 Provider
- `src/styles.css`

### 4.1 先写交互失败测试

覆盖：

```js
test("switches only after server confirmation and then reloads", async () => {
  const calls = [];
  const api = fakeApi({
    switchEnvironment: async id => {
      calls.push(id);
      return { current: { id, version: 7 } };
    }
  });

  renderSettings({ api, current: "production" });
  await clickOption("展示数据库");
  await clickButton("确认切换");

  assert.deepEqual(calls, ["display"]);
  assert.equal(abortAllBusinessRequests.calls.length, 1);
  assert.equal(reloadPage.calls.length, 1);
});

test("does not expose data environment settings to ordinary users", () => {
  renderSettings({ currentUser: employeeUser });
  assert.equal(screen.queryByText("数据环境"), null);
});

test("announces refresh failure and keeps display unavailable", async () => {
  renderSettings({ display: { status: "failed" } });
  assert.match(screen.getByRole("status").textContent, /当前不可使用/);
  assert.ok(screen.getByRole("button", { name: "重新生成" }));
});
```

缓存测试断言 production/display 生成不同 key：

```js
assert.equal(environmentStorageKey("product-flow-state", "production"), "product-flow-state:production");
assert.equal(environmentStorageKey("product-flow-state", "display"), "product-flow-state:display");
assert.notEqual(salesDatabaseName("production"), salesDatabaseName("display"));
```

### 4.2 API 与 Provider

`dataEnvironmentApi.js` 导出：

```js
export async function fetchDataEnvironment() {}
export async function switchDataEnvironment(environmentId) {}
export async function startDisplayRefresh() {}
export async function runDisplayRefreshStep(jobId) {}
export async function fetchDisplayRefreshJob(jobId) {}
```

`DataEnvironmentProvider`：

- 启动时读取当前环境和版本。
- 提供 `environmentId`、`environmentVersion`、`displayState`、权限和操作。
- 将环境版本注入统一业务 fetch helper 的非 GET/HEAD 请求。
- 登记 `AbortController` 集合，切换前中止所有业务请求。
- 比较响应的环境 Header；晚到环境不一致响应直接丢弃。

### 4.3 缓存命名空间

新增纯函数：

```js
export const environmentStorageKey = (base, environmentId) =>
  `${base}:${environmentId}`;
```

所有业务缓存使用环境后缀。`src/state/salesStore.js` 的 IndexedDB 名称改为：

```js
productFlowSales:production
productFlowSales:display
```

迁移规则：

- 原无后缀缓存只允许迁移到 `production` 一次。
- 不复制到 `display`。
- 切换时不删除另一个环境的持久缓存，但必须清空内存状态。
- 本地恢复缓存不得自动初始化或覆盖共享 D1。

### 4.4 设置页

`DataEnvironmentSettings` 复用现有设置卡片、按钮、确认对话框和状态语义：

- 普通业务页不增加标记。
- 只有设置页显示当前环境。
- 展示刷新期间显示阶段、进度和“请等待完成”。
- 失败显示安全中文原因和“重新生成”。
- 环境未 ready 时禁用选择展示。
- `aria-live` 宣告成功/失败。
- 切换或刷新后恢复焦点。

### 4.5 验证

```bash
node --test react-tests/data-environment-api.test.mjs
node --test react-tests/data-environment-provider.test.mjs
node --test react-tests/data-environment-settings.test.mjs
node --test react-tests/data-environment-cache.test.mjs
node --test react-tests/settings-config.test.mjs
```

使用真实笔记本宽度和窄屏检查设置卡片，完成键盘、焦点、空、错误、禁用、对比度和 DingTalk WebView 验收。

### 4.6 提交

```bash
git commit -m "feat: add display database settings"
```

---

## 任务 5：建立展示数据目录、脱敏器和销售转换器

**新增文件：**

- `functions/api/platform/_shared/demoDataCatalog.js`
- `functions/api/platform/_shared/demoDataMasking.js`
- `src/domain/demoSalesTransform.js`
- `tests/demo-data-catalog.test.mjs`
- `tests/demo-data-masking.test.mjs`
- `react-tests/demo-sales-transform.test.mjs`

**修改文件：**

- `docs/platform/apis/data-standards-v1.md`
- `docs/platform/architecture.md`

### 5.1 先写纯规则失败测试

`react-tests/demo-sales-transform.test.mjs`：

```js
test("doubles additive sales facts and preserves dimensions", () => {
  const source = {
    code: "690001",
    date: "2026-07-22",
    platform: "天猫",
    qty: 3,
    sales: 300,
    net_sales: 240,
    refund: 60,
    cost: 120,
    gross_profit: 120,
    pre_ship_refund: 20,
    post_ship_refund: 40
  };

  assert.deepEqual(scaleSalesFact(source), {
    ...source,
    qty: 6,
    sales: 600,
    net_sales: 480,
    refund: 120,
    cost: 240,
    gross_profit: 240,
    pre_ship_refund: 40,
    post_ship_refund: 80
  });
});

test("keeps ratios and averages consistent after transformation", () => {
  const result = deriveSalesMetrics(scaleSalesFact(source));
  assert.equal(result.refundRate, source.refund / source.sales);
  assert.equal(result.grossMarginRate, source.gross_profit / source.net_sales);
});

test("does not scale dimensions, prices or non-sales facts", () => {
  assert.deepEqual(scaleBusinessRecord(nonSalesRecord), nonSalesRecord);
});
```

目录测试断言：

- 凭证、会话、个人令牌、解锁、AI Provider 配置和审计表为 `skip`。
- `product_sales_daily` 为 `transform_sales`。
- 汇总结果表为 `recalculate`。
- 任意未知表返回 `skip`。
- 每个 `mask` 策略都列出字段级转换器。

### 5.2 实现销售转换

`src/domain/demoSalesTransform.js` 是纯业务模块，不依赖 React、浏览器或网络：

```js
export const DISPLAY_SALES_FACTOR = 2;
export const DISPLAY_SALES_RULE_VERSION = "sales-2x-v1";

export function scaleSalesFact(row, factor = DISPLAY_SALES_FACTOR) {}
export function deriveSalesMetrics(row) {}
export function validateSalesTransform(sourceTotals, displayTotals) {}
export function deterministicDisplayId(sourceId, copyIndex, ruleVersion) {}
```

规则：

- 只允许目录登记的 additive 字段乘二。
- 所有金额使用现有整数分/数值精度策略，不引入浮点漂移。
- `null` 保持 `null`，合法零值保持零。
- 不读取商品名称猜测字段含义。
- 明细复制 ID 由 source ID、copy index 和规则版本确定性哈希生成。
- 聚合事实不生成虚假订单明细。

服务端通过同一纯模块或无浏览器依赖的共享导出使用相同规则，禁止复制一份逻辑。

### 5.3 实现目录和脱敏

`demoDataCatalog.js` 为每张允许表声明：

```js
{
  table: "product_sales_daily",
  policy: "transform_sales",
  primaryKey: ["code", "date", "platform"],
  copyOrder: 30,
  batchSize: 250,
  sourceUpdatedAtColumn: "updated_at"
}
```

`demoDataMasking.js` 使用确定性 HMAC/哈希化别名；密钥从服务端受治理配置解析，不写展示库、不输出日志。若没有脱敏密钥，含个人信息的表刷新 fail closed。

### 5.4 验证

```bash
node --test react-tests/demo-sales-transform.test.mjs
node --test tests/demo-data-catalog.test.mjs
node --test tests/demo-data-masking.test.mjs
```

### 5.5 提交

```bash
git commit -m "feat: define display data transformation rules"
```

---

## 任务 6：实现单展示库维护式刷新任务

**新增文件：**

- `functions/api/platform/_shared/demoDataRefresh.js`
- `functions/api/platform/v1/data-environment/refresh.js`
- `functions/api/platform/v1/data-environment/refresh/[id].js`
- `functions/api/platform/v1/data-environment/refresh/[id]/step.js`
- `tests/demo-data-refresh.test.mjs`
- `tests/demo-data-refresh-api.test.mjs`

**修改文件：**

- `functions/api/platform/_shared/dataEnvironmentStorage.js`
- `src/state/dataEnvironmentApi.js`
- `src/state/DataEnvironmentProvider.jsx`
- `src/features/settings/DataEnvironmentSettings.jsx`

### 6.1 先写状态机失败测试

```js
test("blocks display reads from refresh start until validation succeeds", async () => {
  const job = await createDisplayRefreshJob(controlDb, actor);
  assert.equal((await getDisplayState(controlDb)).status, "refreshing");

  await assert.rejects(() => resolveDataEnvironment(displayContext), {
    code: "DATA_ENVIRONMENT_MAINTENANCE"
  });

  await runAllRefreshSteps(job.id);
  const state = await getDisplayState(controlDb);
  assert.equal(state.status, "ready");
  assert.equal(state.version, 8);
});

test("leaves display unavailable after validation failure", async () => {
  const job = await createDisplayRefreshJob(controlDb, actor);
  forceValidationFailure("sales totals");
  await runUntilTerminal(job.id);

  assert.equal((await getDisplayState(controlDb)).status, "failed");
  await assert.rejects(() => resolveDataEnvironment(displayContext), {
    code: "DATA_ENVIRONMENT_REFRESH_FAILED"
  });
});

test("resuming the same job does not multiply data twice", async () => {
  const job = await createDisplayRefreshJob(controlDb, actor);
  await runRefreshStep(job.id);
  await runRefreshStep(job.id);
  await runUntilTerminal(job.id);

  assert.equal(await total(displayDb, "sales"), 2 * await total(productionDb, "sales"));
});
```

### 6.2 实现刷新状态机

固定阶段：

```text
preflight -> clear -> copy -> transform -> recalculate -> validate -> activate
```

每次 `step`：

- 在 Pages Function 时间预算内只执行一批。
- 读取控制库 job 的阶段和游标。
- 对 job ID 加租约，阻止并发 step。
- 写入批次后原子推进游标。
- 返回下一阶段、完成数、总数估算和 terminal 状态。
- 重复提交同一阶段/游标不重复写。

`clear` 按目录逆依赖顺序清空展示业务表；控制表本来就不存在于展示库。`copy`、`transform` 按 `copyOrder` 写入。`recalculate` 只从展示事实生成结果。`validate` 检查结构、覆盖、外键/关系、脱敏和销售不变量。`activate` 原子更新控制库 state 为 ready、version + 1、清空 active job。

### 6.3 API 合同

- `POST /api/platform/v1/data-environment/refresh`
  - 最高权限。
  - 若已有 active job，返回该 job，不重复创建。
  - 将展示 state 置为 refreshing。
- `GET /api/platform/v1/data-environment/refresh/:id`
  - 返回安全状态、阶段、计数、错误码。
- `POST /api/platform/v1/data-environment/refresh/:id/step`
  - 最高权限。
  - 执行一个有界步骤。
  - 请求可安全重试。

前端在页面保持打开时连续调用 `step`；页面关闭后任务保留，重新进入设置可继续。若未来接入 Queue/Cron，只能复用同一 `step` 服务，不复制刷新逻辑。

### 6.4 验证

```bash
node --test tests/demo-data-refresh.test.mjs
node --test tests/demo-data-refresh-api.test.mjs
node --test tests/data-environment-routing.test.mjs
node --test react-tests/data-environment-settings.test.mjs
```

### 6.5 提交

```bash
git commit -m "feat: refresh the display database safely"
```

---

## 任务 7：让真实采集按服务端目标环境写入

**修改文件：**

- `functions/api/platform/v1/web-collection/jobs.js`
- `functions/api/platform/v1/web-collection/runners.js`
- `functions/api/platform/v1/web-collection/_shared/storage.js`
- `functions/api/platform/v1/erp-collection/ingest.js`
- `functions/api/platform/v1/erp-collection/runners.js`
- `functions/api/platform/v1/erp-collection/_shared/storage.js`
- `functions/api/platform/v1/product-catalog/import.js`
- `functions/api/platform/v1/product-catalog/sync/kuaimai.js`
- `functions/api/platform/v1/data-services/_shared/salesRepair.js`
- `functions/api/sales.js`
- `tests/helpers/web-collection-d1-mock.mjs`
- `tests/helpers/erp-collection-d1-mock.mjs`
- `tests/web-collection-api.test.mjs`
- `tests/kuaimai-erp-collection-api.test.mjs`
- `tests/kuaimai-erp-projection.test.mjs`
- `tests/sales-api.test.mjs`

### 7.1 先写目标环境失败测试

```js
test("persists the server-selected target on a collection job", async () => {
  const response = await createJob(displayContext, validRequest);
  const job = controlDb.jobs.get(response.id);

  assert.equal(job.target_environment, "display");
  assert.equal(job.target_environment_version, 7);
});

test("runner projects display sales through the shared 2x transformer", async () => {
  const job = seedJob({ targetEnvironment: "display", targetVersion: 7 });
  await ingestRunnerResult(runnerContext, job, sourceRows);

  assert.equal(displayDb.salesTotal(), 2 * sourceTotal(sourceRows));
  assert.equal(productionDb.salesTotal(), 0);
});

test("production and display idempotency keys do not collide", () => {
  assert.notEqual(
    collectionIdempotencyKey({ sourceId: "x", environmentId: "production" }),
    collectionIdempotencyKey({ sourceId: "x", environmentId: "display" })
  );
});
```

还需断言调用方传入 `{ targetEnvironment: "production" }` 或 D1 ID 时被忽略/拒绝，目标只能来自已认证请求的数据环境。

### 7.2 拆分任务控制面与业务投影

- Job、runner token、lease、cursor 和授权记录继续存 `controlDb`。
- 创建任务时从 `context.data.dataEnvironment` 保存目标环境和版本。
- Runner 领取任务后通过服务端目标解析器获取 D1，不接受浏览器绑定名。
- 写入前再次确认展示 state ready 且版本未变化；否则暂停并返回稳定冲突。
- 标准销售事实写入器在 display 目标调用 `scaleSalesFact`。
- 非销售事实按目录策略写入当前业务库。
- 幂等键加入 `environmentId` 和 `environmentVersion`。

### 7.3 保持真实来源合同

- 快麦按集成注册表当前状态使用官方文件和浏览器采集主通道。
- 不因为存在历史 API 路由就宣称开放平台 API 已接通。
- Provider 读取的超时、重试、游标、审计和授权不因展示环境绕过。
- 退款丰富事实继续受现有 repair safeguard 保护；`manual_required` 时使用官方文件重导，不盲目覆盖。

### 7.4 验证

```bash
node --test tests/web-collection-api.test.mjs
node --test tests/kuaimai-erp-collection-api.test.mjs
node --test tests/kuaimai-erp-projection.test.mjs
node --test tests/sales-api.test.mjs
node --test react-tests/sales-repair-api.test.mjs
```

### 7.5 提交

```bash
git commit -m "feat: route data acquisition to selected environment"
```

---

## 任务 8：统一模拟展示环境的外部写动作

**新增文件：**

- `functions/api/platform/_shared/externalActionMode.js`
- `functions/api/platform/_shared/displayExternalActionAdapter.js`
- `tests/display-external-actions.test.mjs`

**修改文件：**

- `functions/api/dingtalk/todo/create.js`
- `functions/api/dingtalk/todo/sync.js`
- `functions/api/dingtalk/calendar/create.js`
- `functions/api/platform/v1/collaboration-items/[id]/dingtalk.js`
- 其他由集成注册表标记为 external write 的现有路由
- `tests/dingtalk-sync.test.mjs`
- `tests/collaboration-dingtalk.test.mjs`
- `docs/platform/integration-registry.json`
- 生成：`functions/api/platform/_generated/integrationRegistry.js`

### 8.1 先写 Provider 未调用测试

```js
test("simulates DingTalk writes in display mode without calling the provider", async () => {
  const provider = createDingTalkProviderSpy();
  const response = await createTodo(displayContext({ provider }), validTodo);

  assert.equal(provider.createTodo.calls.length, 0);
  assert.equal(response.executionMode, "display");
  assert.match(response.externalId, /^display-/);
  assert.equal(displayDb.todos.length, 1);
  assert.equal(controlDb.audit.at(-1).resultCode, "DEMO_EXTERNAL_ACTION_SIMULATED");
});

test("keeps the real provider path in production mode", async () => {
  const provider = createDingTalkProviderSpy({ externalId: "dt-1" });
  await createTodo(productionContext({ provider }), validTodo);
  assert.equal(provider.createTodo.calls.length, 1);
});
```

### 8.2 实现模式决策

`externalActionMode.js`：

```js
export function externalActionMode(dataEnvironment) {
  return dataEnvironment.id === "display" ? "simulate" : "provider";
}
```

`displayExternalActionAdapter.js`：

- 复用正式入参校验和权限。
- 生成确定性 `display-<hash>` ID。
- 返回与正式成功响应兼容的字段。
- 把业务结果写 `businessDb`。
- 向 `controlDb` 写无秘密审计。
- 不解析 Provider 凭证，不初始化 Provider adapter。

Provider 真实读取路由不走模拟器；其业务写入仍使用所选 `businessDb`。

### 8.3 更新集成注册表

为钉钉 todo/calendar/approval/collaboration 写动作登记：

- `operationMode: external_write`
- `displayMode: simulated`
- 真实读取操作保持 `external_read`
- 变更路径覆盖新的共享 adapter

重新生成集成模块并运行一致性检查。

### 8.4 验证

```bash
node --test tests/display-external-actions.test.mjs
node --test tests/dingtalk-sync.test.mjs
node --test tests/collaboration-dingtalk.test.mjs
npm run check:integrations
```

### 8.5 提交

```bash
git commit -m "feat: simulate external writes in display mode"
```

---

## 任务 9：拆分 AI 控制库与业务上下文库

**修改文件：**

- `functions/api/platform/v1/ai/_shared/http.js`
- `functions/api/platform/v1/ai/_shared/invoke-feature.js`
- `functions/api/platform/v1/ai/_shared/audit.js`
- `functions/api/platform/v1/ai/_shared/context-builders/data-center.js`
- `functions/api/platform/v1/ai/_shared/context-builders/product.js`
- `functions/api/platform/v1/ai/_shared/context-builders/strategy.js`
- `functions/api/platform/v1/ai/_shared/context-builders/supply-chain.js`
- `functions/api/platform/v1/ai/_shared/skill-executors/business-apps.js`
- `functions/api/platform/v1/ai/_shared/skill-executors/core.js`
- `functions/api/platform/v1/ai/usage.js`
- `migrations/0011_demo_data_environment.sql`
- `tests/helpers/ai-d1-mock.mjs`
- `tests/ai-api.test.mjs`
- `tests/ai-feature-invocation.test.mjs`
- `tests/ai-skills-business-apps.test.mjs`
- `tests/ai-usage-api.test.mjs`

### 9.1 先写双库失败测试

```js
test("uses control DB for provider config and display DB for business context", async () => {
  controlDb.seedProviderConfig(validProvider);
  productionDb.seedBusinessMetric("sales", 100);
  displayDb.seedBusinessMetric("sales", 200);

  const result = await invokeAiFeature(displayContext, request);

  assert.equal(provider.lastRequest.context.sales, 200);
  assert.equal(controlDb.aiUsage.length, 1);
  assert.equal(controlDb.aiUsage[0].data_environment, "display");
  assert.equal(displayDb.aiUsage.length, 0);
});
```

并断言审计不含 Prompt、答案、业务上下文、Skill 参数值或 Provider 原始响应。

### 9.2 拆分配置加载

将原本单个 `db` 的配置改为：

```js
{
  controlDb: context.data.controlDb,
  businessDb: context.data.businessDb,
  dataEnvironment: context.data.dataEnvironment,
  providerConfig,
  featureRegistration
}
```

- Provider 配置、凭证解析、租约、用量和 Skill 调用次数写 `controlDb`。
- Context builders 和 business-app skills 只读 `businessDb`。
- `core` 中只涉及控制规则的 Skill 明确使用 `controlDb`。
- 未登记 feature 继续返回 `AI_FEATURE_NOT_REGISTERED`。

### 9.3 扩展审计结构

在同一迁移中为现有 AI 用量/审计表增加：

```sql
data_environment TEXT NOT NULL DEFAULT 'production'
```

不要把 `display` 塞入现有 `executionMode=model|rule_fallback`，两者语义不同。用量页可以按环境聚合，但继续禁止员工排名和个人钻取。

### 9.4 验证

```bash
node --test tests/ai-api.test.mjs
node --test tests/ai-feature-invocation.test.mjs
node --test tests/ai-skills-business-apps.test.mjs
node --test tests/ai-usage-api.test.mjs
node --test react-tests/ai-model-governance.test.mjs
```

### 9.5 提交

```bash
git commit -m "feat: route AI business context by data environment"
```

---

## 任务 10：持久规则写回、完整验证与发布

**修改文件：**

- `AGENTS.md`
- `PRODUCT.md` 或对应 `docs/product/` 规则文件
- `DESIGN.md`
- `docs/platform/architecture.md`
- `docs/platform/middleware.md`
- `docs/platform/api-catalog.md`
- `docs/platform/error-codes.md`
- `docs/platform/integration-registry.json`
- `docs/platform/environment-capabilities.json`
- 新增：`docs/decisions/2026-07-23-display-data-environment.md`
- `docs/features/demo-data-environment/tasks.md`
- 所有生成模块

### 10.1 写回持久规则

`AGENTS.md` 增加：

- 业务 D1 必须通过 `businessDatabase(context)`。
- 直接使用 `PRODUCT_FLOW_DB` 限于控制面 allowlist。
- 新表必须登记展示目录策略。
- 新 external write 必须声明展示模式，默认 fail closed。
- 新采集任务必须服务端固定目标环境和版本。
- 新 AI Skill 业务查询必须使用 `businessDb`。

ADR 记录：

- 采用单独 `DEMO_FLOW_DB`。
- 不采用单库环境字段、查询时乘二和 A/B 双槽。
- 单展示库刷新期间维护、失败不回退。
- 控制面/业务面边界。
- 本地线上、沙箱、Preview 和 Production 的差异。
- 回滚和 D1 Time Travel 运维恢复。

### 10.2 完成路由审计

运行：

```bash
rg -n "PRODUCT_FLOW_DB" functions/api
rg -n "DEMO_FLOW_DB" functions/api
```

逐条分类：

- 合法控制面：认证、凭证、生产网关、环境状态、AI 控制审计、采集控制任务。
- 业务面：必须改用 `context.data.businessDb`。

移除任务 3 治理检查中的所有临时 allowlist。检查新增/修改路由是否被集成注册表覆盖。

### 10.3 完整自动化验证

从仓库根目录运行 AGENTS 定义的全部门禁：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

另外运行：

```bash
npm run check:branch-base
node --test tests/data-environment-governance.test.mjs
node --test tests/demo-data-refresh.test.mjs
node --test tests/display-external-actions.test.mjs
node --test tests/cloudflare-pages-compat.test.mjs
```

### 10.4 本地沙箱验证

```bash
npm run seed:sandbox
npm run start:sandbox
```

验收：

- 本地 SQLite 的 production/display 命名空间可切换。
- 测试写入不触远程 D1。
- 缓存不串环境。
- 外部写不触 Provider。

### 10.5 本地线上验证

启动前证明服务 worktree HEAD 包含 `origin/main`：

```bash
git merge-base --is-ancestor origin/main HEAD
npm start
```

使用最高权限账号验收：

- 正式/展示设置切换。
- 展示刷新维护、成功、失败重试。
- 销售总计 2 倍，退款率/毛利率/客单价一致。
- 快麦官方文件/浏览器采集写展示库。
- 钉钉待办、日历、审批不产生真实外部对象。
- AI 上下文使用展示数据且用量记控制库。

### 10.6 数据库与部署

实施时按以下顺序操作真实环境：

1. 使用 Wrangler 创建展示 D1，保存真实 ID。
2. 对正式 `PRODUCT_FLOW_DB` 应用 `0011` 控制面迁移。
3. 对 `DEMO_FLOW_DB` 应用现有全部业务迁移；控制面表即使因共享迁移存在，也不得由展示路由使用，后续可通过拆分迁移清单排除。
4. 运行双 binding readiness。
5. 部署前执行 `npm run release:pages`，不得直接部署仓库根目录。
6. 验证 Git deployment 与当前 Wrangler CLI 均能构建 Functions。
7. 部署保存的确切提交。
8. 首次刷新展示库并记录校验摘要。
9. 分别检查本地线上、Preview、Production 和钉钉 WebView。

任何迁移、绑定、部署或 Provider 验证失败都停止发布；不把“本地通过”描述为“线上已接通”。

### 10.7 PR 与规则声明

PR 描述必须包含：

```text
Integration-Impact: cloudflare-d1, cloudflare-pages, dingtalk, erp-file-import, kuaimai
Integration-Impact-Reason: 新增独立展示 D1、Pages 双绑定、真实采集目标路由和展示环境外部写模拟
Rule-Writeback: AGENTS.md, docs/platform/architecture.md, docs/platform/middleware.md, docs/platform/integration-registry.json, docs/platform/environment-capabilities.json, docs/decisions/2026-07-23-display-data-environment.md
Rule-Writeback-Reason: 数据环境、采集目标、外部动作和 AI 控制/业务面成为跨 App 平台规则
```

### 10.8 提交和合并前检查

```bash
git status --short
git diff --check
git diff --cached --name-only
```

只暂存本功能文件。最终提交：

```bash
git commit -m "docs: govern display data environment"
```

合并前再次更新最新 `main`、解决冲突并重跑全部门禁。用户明确授权后才可推送、合并和部署。

---

## 完成定义

只有同时满足以下条件才能称为完成：

1. 独立展示 D1 已创建并使用真实绑定 ID。
2. 正式控制库和展示业务库迁移一致、readiness 通过。
3. 设置切换、缓存隔离和环境版本冲突保护通过。
4. 所有业务 API 通过统一路由，治理检查无绕过。
5. 展示刷新单任务、可续跑、幂等、失败不可用。
6. 销售加总事实精确两倍，比例/均值和业务恒等式通过。
7. 真实采集正确写目标业务库。
8. 展示环境外部写未调用真实 Provider。
9. AI 控制/业务数据库拆分通过。
10. 文档、集成注册表、环境清单和 ADR 已写回。
11. AGENTS 全部门禁、Cloudflare Pages 兼容、四条运行验证通道全部通过。
12. 生产部署后由最高权限账号完成设置、数据、外部动作和 AI 验收。
