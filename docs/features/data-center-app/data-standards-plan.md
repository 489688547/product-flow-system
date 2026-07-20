# 数据口径治理与计算实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把“数据口径”从只读说明页升级为有权限、有版本、有审计的公司级 CRUD 能力，并让数据中心五项销售 KPI 只读取同一套安全公式引擎生成的结果。

**Architecture:** 纯领域模块定义首批 11 项口径、受控公式 AST、版本选择和权限规则；`/api/platform/v1/data-standards` 负责版本化 CRUD、预览、计算批次和结果读取；D1 追加保存版本、结果、批次和审计。数据中心仅组合共享 API，不再在 React 组件中复制 KPI 公式。已有销售事实继续来自 `product_sales_daily`；六项货流口径先进入目录，事实未覆盖时返回明确状态，不生成模拟值。

**Tech Stack:** React 19、Cloudflare Pages Functions、Cloudflare D1、Web Crypto/原生 JavaScript、Node test runner、Vite。

## Global Constraints

- 统计时间统一为订单创建时间 `create_time`，时区 `Asia/Shanghai`，日常经营口径排除“其它/其他/未知/未知平台”。
- 不接受 SQL、JavaScript、函数文本或任意字段名；公式只能由服务端白名单 AST 编译。
- 已发布版本不可修改；修改创建新版本并指定严格递增的生效日期。
- “删除”只归档；历史版本、结果、计算批次和审计永不随归档删除。
- 总经办可管理全部；运营、财务、供应链只能直接发布和归档本部门负责的口径；只读身份不能写。
- 普通历史查询按周期选择当时生效版本；定义更新不自动重算历史。
- 显式重算生成新批次；全部结果成功落库后才切换 `is_current`，失败批次不能替换当前结果。
- 预览和正式计算必须使用同一个验证器、依赖解析器和执行器。
- 本轮不改变钉钉、快麦、ERP 或其他外部平台接入，不新增 Secret、变量或数据库绑定；继续使用 `PRODUCT_FLOW_DB`。
- 本地 Vite/Node、Cloudflare Preview、Production 和钉钉 WebView 分开验收；未经单独授权不迁移生产 D1、不部署、不写生产数据。
- 本计划路由到 `cloudflare-d1` 和 `cloudflare-pages`。PR 必须声明两者的 `Integration-Impact`，并以 API 契约、环境清单和集成注册表作为 `Rule-Writeback`。

---

## Task 1：建立纯领域契约和首批 11 项口径

**Files:**

- Create: `src/domain/dataStandards.js`
- Create: `react-tests/data-standards-domain.test.mjs`
- Modify: `src/domain/dataCenter.js`
- Modify: `react-tests/data-center.test.mjs`

- [x] 1.1 先写领域失败测试，覆盖：11 个唯一 `metricCode`、责任部门、单位、周期、销售时间口径、货流未覆盖状态、AST 未知节点、未知字段、单位冲突、除零保护、循环依赖、版本生效选择、归档不可被新公式引用。

运行：

```bash
node --test react-tests/data-standards-domain.test.mjs
```

预期：失败，报 `ERR_MODULE_NOT_FOUND` 或缺少导出。

- [x] 1.2 创建不依赖 React、浏览器或网络的领域 API：

```js
export const CORE_DATA_STANDARDS = [/* exactly 11 immutable definitions */];
export const DATA_STANDARD_OWNER_DEPARTMENTS = ["运营部", "财务部", "供应链部"];
export const FACT_FIELD_REGISTRY = {
  "sales.net_sales": { source: "product_sales_daily", column: "net_sales", unit: "CNY" },
  "sales.gross_profit": { source: "product_sales_daily", column: "gross_profit", unit: "CNY" },
  "sales.quantity": { source: "product_sales_daily", column: "qty", unit: "COUNT" },
  "sales.refund": { source: "product_sales_daily", column: "refund", unit: "CNY" },
  "sales.gross_sales": { source: "product_sales_daily", column: "sales", unit: "CNY" }
};

export function validateFormulaAst(ast, context) {}
export function collectFormulaDependencies(ast) {}
export function orderMetricDependencies(definitions) {}
export function resolveEffectiveVersion(versions, periodEnd) {}
export function canManageDataStandard(actor, definition, action) {}
export function normalizeDataStandardDraft(input) {}
```

AST 首版节点固定为：

```js
{ type: "field", field: "sales.net_sales" }
{ type: "metric", metricCode: "sales.net_sales" }
{ type: "aggregate", operation: "sum", input: /* field */, filters: [] }
{ type: "arithmetic", operation: "divide", left: /* node */, right: /* node */, onZero: "null" }
{ type: "constant", value: 100, unit: "PERCENT_SCALE" }
```

`sum`、`average`、`weighted_average`、`count`、`count_distinct` 和日期节点进入 schema 白名单；首轮执行器只对销售所需节点标记 `executable: true`。货流节点可以被验证和发布，但在缺少事实源时返回 `DATA_NOT_COVERED`。

- [x] 1.3 将旧数据中心状态中的 `metricDefinitions` 改成兼容只读字段，不再作为通用整份状态的持久化集合。导出 `DATA_CENTER_PERSISTED_COLLECTIONS`，明确排除 `metricDefinitions`，避免 `/api/data-center` 覆盖共享口径表。

- [x] 1.4 运行领域回归：

```bash
node --test react-tests/data-standards-domain.test.mjs react-tests/data-center.test.mjs
```

预期：全部通过，且 `summarizeDataCenterSales` 暂时保留，只作为下一阶段只读对账函数。

- [x] 1.5 提交：

```bash
git add src/domain/dataStandards.js src/domain/dataCenter.js react-tests/data-standards-domain.test.mjs react-tests/data-center.test.mjs
git commit -m "feat(data): define governed metric contracts"
```

---

## Task 2：迁移 D1 表并提供追加式存储

**Files:**

- Create: `migrations/0004_data_standards.sql`
- Create: `functions/api/platform/v1/_shared/dataStandardsStorage.js`
- Create: `tests/data-standards-storage.test.mjs`
- Modify: `functions/api/data-center/_shared/storage.js`
- Modify: `tests/data-center-api.test.mjs`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify generated manifests under `src/platform/_generated/` and `functions/api/platform/_generated/`

- [x] 2.1 先写存储失败测试，覆盖：迁移表名、内置口径幂等初始化、旧净销售额/毛利兼容迁移、追加版本、同日版本冲突、归档不删除、计算批次幂等、批次成功后原子切换当前结果、失败批次保留旧结果。

运行：

```bash
node --test tests/data-standards-storage.test.mjs tests/data-center-api.test.mjs
```

预期：失败，因为迁移和存储模块尚不存在。

- [x] 2.2 在迁移中先把旧通用 payload 表改名为 `data_metric_definitions_legacy`，再建立规范化表：

```sql
ALTER TABLE data_metric_definitions RENAME TO data_metric_definitions_legacy;

CREATE TABLE data_metric_definitions (
  id TEXT PRIMARY KEY,
  metric_code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_department TEXT NOT NULL,
  unit TEXT NOT NULL,
  period TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  archived_at TEXT,
  archived_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
```

同一迁移创建：

- `data_metric_definition_versions`，主键 `(definition_id, version)`，唯一键 `(definition_id, effective_from)`；
- `data_metric_results`，保存周期、维度 JSON、可空数值、覆盖率、可信度、估算标识、状态、原因、截止时间、批次和 `is_current`；
- `data_metric_calculation_runs`，`idempotency_key` 唯一；
- `data_metric_audit_logs`，仅追加必要元数据。

把旧 payload 中 `sales.net_sales` 和 `sales.gross_profit` 迁成 `v1`；其余 9 项由同一 SQL 使用固定 ID 和固定 JSON AST 幂等插入。迁移不得删除 `data_metric_definitions_legacy`。

- [x] 2.3 实现以下存储边界，所有 SQL 和 D1 批处理只出现在该模块：

```js
export function dataStandardsDatabase(env = {}) {}
export async function ensureDataStandardsTables(db) {}
export async function listDefinitions(db, filters) {}
export async function getDefinitionDetail(db, id) {}
export async function insertDefinitionWithVersion(db, definition, version, audit) {}
export async function appendDefinitionVersion(db, id, expectedVersion, version, audit) {}
export async function archiveDefinition(db, id, expectedVersion, audit) {}
export async function createCalculationRun(db, input) {}
export async function writeCalculationBatch(db, run, results) {}
export async function failCalculationRun(db, runId, errorCode) {}
export async function listCurrentResults(db, query) {}
```

`appendDefinitionVersion` 和 `archiveDefinition` 必须以 `WHERE current_version = ?` 实现乐观锁；受影响行数为 0 时返回版本冲突。`writeCalculationBatch` 使用 D1 `batch()`：先写新结果，再取消同范围旧结果的 current，最后激活新批次并把 run 标记成功。

- [x] 2.4 修改旧通用存储只遍历 `DATA_CENTER_PERSISTED_COLLECTIONS`；旧 `data_metric_definitions_legacy` 只读保留，不再由通用 POST 删除或覆盖。

- [x] 2.5 更新环境与集成契约：

  - 在 `business-data-apps.tables` 增加四张新表和 `data_metric_definitions_legacy`；
  - 把 `/api/platform/v1/data-standards` 加到 Cloudflare D1/Pages 相关 `apiRoutes`、`codePaths` 和 `evidence`；
  - Cloudflare D1 capability 增加“版本化数据口径与计算结果”；
  - 不新增 env var、Secret 或 binding。

生成并校验：

```bash
npm run generate:platform-manifests
npm run check:environment-capabilities
node --test tests/data-standards-storage.test.mjs tests/data-center-api.test.mjs tests/environment-readiness-api.test.mjs
```

- [x] 2.6 提交：

```bash
git add migrations/0004_data_standards.sql functions/api/platform/v1/_shared/dataStandardsStorage.js functions/api/data-center/_shared/storage.js tests/data-standards-storage.test.mjs tests/data-center-api.test.mjs docs/platform/environment-capabilities.json docs/platform/integration-registry.json src/platform/_generated functions/api/platform/_generated
git commit -m "feat(platform): persist governed metric versions"
```

---

## Task 3：实现共享 CRUD、权限和错误契约

**Files:**

- Create: `functions/api/platform/v1/_shared/dataStandardsHttp.js`
- Create: `functions/api/platform/v1/_shared/dataStandardsAuthorization.js`
- Create: `functions/api/platform/v1/_shared/dataStandardsValidation.js`
- Create: `functions/api/platform/v1/data-standards.js`
- Create: `functions/api/platform/v1/data-standards/[id].js`
- Create: `functions/api/platform/v1/data-standards/[id]/archive.js`
- Create: `tests/data-standards-api.test.mjs`
- Create: `docs/platform/apis/data-standards-v1.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `src/domain/permissions.js`
- Modify: `react-tests/permissions.test.mjs`

- [x] 3.1 先写 API 失败测试，至少覆盖：未登录 401、无查看权 403、只读 403、运营/财务/供应链可创建本部门口径、不能指定其他部门、总经办可跨部门、重复 `metricCode` 409、版本落后 409、非法 AST 400、修改生成新版本、同日生效冲突、归档不删除、详情包含版本/依赖/最近结果。

运行：

```bash
node --test tests/data-standards-api.test.mjs react-tests/permissions.test.mjs
```

预期：路由或权限导出缺失而失败。

- [x] 3.2 在服务端把钉钉会话规范化为不可由客户端伪造的 actor：

```js
export function dataStandardActor(session) {
  return {
    id: String(session.userId || session.id || ""),
    name: String(session.name || ""),
    departments: normalizeDepartmentNames(session),
    executive: normalizeDepartmentNames(session).includes("总经办"),
    readonly: session.role === "readonly" || session.readonly === true
  };
}

export function requireDefinitionWrite(actor, ownerDepartment) {}
export function requireRecalculation(actor, definitions) {}
```

部门别名 `供应链`、`供应链团队`、`采购部` 统一映射到 `供应链部`。非总经办的 `ownerDepartment` 由服务端锁定为自己的可管理部门；请求体中的 actor、createdBy、publishedAt、audit 字段全部忽略。

- [x] 3.3 实现路由方法：

  - `GET /api/platform/v1/data-standards`；
  - `POST /api/platform/v1/data-standards`，201；
  - `GET /api/platform/v1/data-standards/:id`；
  - `PUT /api/platform/v1/data-standards/:id`；
  - `POST /api/platform/v1/data-standards/:id/archive`。

写入请求只接受：

```js
{
  metricCode,
  name,
  category,
  ownerDepartment,
  unit,
  period,
  effectiveFrom,
  displayFormula,
  formulaAst,
  sourceFields,
  expectedVersion
}
```

稳定错误代码固定为：`AUTH_SESSION_REQUIRED`、`PERMISSION_VIEW_DENIED`、`PERMISSION_WRITE_DENIED`、`DATA_STANDARD_INVALID`、`DATA_STANDARD_FIELD_UNKNOWN`、`DATA_STANDARD_CYCLE`、`DATA_STANDARD_UNIT_MISMATCH`、`DATA_STANDARD_VERSION_CONFLICT`、`DATA_STANDARD_EFFECTIVE_DATE_CONFLICT`、`DATA_STANDARD_DEPENDENCY_ARCHIVED`、`DATA_STANDARD_STORAGE_UNAVAILABLE`、`INTERNAL_UNEXPECTED`。响应统一 `Cache-Control: no-store` 并带 `requestId`、`retryable`。

- [x] 3.4 扩展 `DEFAULT_PERMISSIONS.features.dataCenter.editDepartments` 和 edit titles，使财务/供应链能够进入编辑态；具体某条口径是否可写仍由 API 按责任部门二次校验。

- [x] 3.5 完成共享契约文档，明确 auth、authorization、query/body、response、errors、idempotency、兼容、deprecation、日志、超时和不记录业务事实的审计约束；更新 API 目录。

- [x] 3.6 验证并提交：

```bash
node --test tests/data-standards-api.test.mjs react-tests/permissions.test.mjs
git add functions/api/platform/v1/_shared/dataStandardsHttp.js functions/api/platform/v1/_shared/dataStandardsAuthorization.js functions/api/platform/v1/_shared/dataStandardsValidation.js functions/api/platform/v1/data-standards.js 'functions/api/platform/v1/data-standards/[id].js' 'functions/api/platform/v1/data-standards/[id]/archive.js' tests/data-standards-api.test.mjs docs/platform/apis/data-standards-v1.md docs/platform/api-catalog.md src/domain/permissions.js react-tests/permissions.test.mjs
git commit -m "feat(platform): expose data standards CRUD"
```

---

## Task 4：实现共享公式编译器、销售执行器和预览

**Files:**

- Create: `functions/api/platform/v1/_shared/dataStandardsCompiler.js`
- Create: `functions/api/platform/v1/_shared/dataStandardsCalculation.js`
- Create: `functions/api/platform/v1/data-standards/preview.js`
- Create: `tests/data-standards-calculation.test.mjs`
- Modify: `tests/data-standards-api.test.mjs`

- [x] 4.1 先写失败测试，使用固定销售事实验证：净销售额、毛利、销量、退款率、毛利率；排除其它；分母为零返回 `value: null`；缺数据不是 0；版本按 `periodEnd` 选择；覆盖率、可信等级、估算标识、截止时间和版本随结果返回；货流指标返回 `DATA_NOT_COVERED`。

运行：

```bash
node --test tests/data-standards-calculation.test.mjs
```

预期：计算模块不存在而失败。

- [x] 4.2 编译器只把已验证 AST 转成内部执行计划，不拼接用户输入 SQL：

```js
export function compileDataStandard(version, registry = FACT_FIELD_REGISTRY) {
  return {
    metricCode: version.metricCode,
    dependencies: [],
    source: "product_sales_daily",
    operation: "sum",
    field: "net_sales",
    filters: [{ field: "platform", operation: "not_in", value: ["", "其它", "其他", "未知", "未知平台"] }]
  };
}
```

SQL 列名、表名、聚合函数和过滤器只能从服务端 registry 映射；日期始终使用 bound parameters，不能把 AST 字符串插入 SQL。

- [x] 4.3 实现执行入口：

```js
export async function calculateMetricRange({ db, definition, version, from, to, dependencyResults = new Map() }) {}
export async function calculateMetricSet({ db, definitions, versions, from, to }) {}
```

五项销售指标都从 `product_sales_daily` 聚合。退款率使用 `SUM(refund) / SUM(sales) * 100`；毛利率使用 `SUM(gross_profit) / SUM(net_sales) * 100`。结果状态为 `complete | incomplete | data_not_covered | failed`，不得以 `Number(value) || 0` 抹掉空值。

- [x] 4.4 实现 `POST /api/platform/v1/data-standards/preview`。请求范围最多 31 天、最多 5 个指标，不持久化业务结果；仍追加一次脱敏审计，只记录指标、版本、日期范围和成功/错误代码。预览权限与定义发布权限相同。

- [x] 4.5 验证预览与正式执行共用编译器：

```bash
node --test tests/data-standards-calculation.test.mjs tests/data-standards-api.test.mjs
```

- [x] 4.6 提交：

```bash
git add functions/api/platform/v1/_shared/dataStandardsCompiler.js functions/api/platform/v1/_shared/dataStandardsCalculation.js functions/api/platform/v1/data-standards/preview.js tests/data-standards-calculation.test.mjs tests/data-standards-api.test.mjs
git commit -m "feat(platform): calculate governed sales metrics"
```

---

## Task 5：实现计算批次、显式重算和结果读取

**Files:**

- Create: `functions/api/platform/v1/data-standards/recalculate.js`
- Create: `functions/api/platform/v1/data-standards/results.js`
- Create: `tests/data-standards-results-api.test.mjs`
- Modify: `functions/api/platform/v1/_shared/dataStandardsCalculation.js`
- Modify: `functions/api/platform/v1/_shared/dataStandardsStorage.js`
- Modify: `docs/platform/apis/data-standards-v1.md`

- [x] 5.1 先写失败测试，覆盖：范围最多 370 天、目标版本存在、责任部门权限、幂等键重复不新建批次、`202 pending`、成功后切 current、失败不切换、按历史日期选择版本、读取结果含 version/coverage/confidence/estimated/cutoff/status/reason、无结果返回原因而不是 0。

运行：

```bash
node --test tests/data-standards-results-api.test.mjs
```

- [x] 5.2 `POST /recalculate` 请求固定为：

```js
{
  metricCodes: ["sales.net_sales", "sales.gross_profit", "sales.quantity", "sales.refund_rate", "sales.gross_margin_rate"],
  from: "2026-07-01",
  to: "2026-07-19",
  targetVersions: {},
  mode: "ensure_current",
  idempotencyKey: "sha256(metricCodes|range|versions|factWatermark)"
}
```

`ensure_current` 允许数据中心查看者为当前查询范围创建幂等派生结果；`explicit_recalculation` 只允许总经办或所有目标口径的责任部门编辑者，并要求客户端提交确认字段 `confirmed: true`。服务端自行计算/校验幂等摘要，不信任任意客户端 key。

- [x] 5.3 Pages Function 创建 run 后调用 `context.waitUntil(executeCalculationRun(...))`，立即返回 202。测试环境向路由注入可控的 `waitUntil` 收集器并等待 promise，验证成功/失败状态。每个 run 最多 11 项指标、370 天、依赖深度 8；超限返回 `DATA_STANDARD_QUERY_RANGE_INVALID`。

- [x] 5.4 `GET /results` 支持 `metricCodes`、`from`、`to`、允许维度和可选 `runId`：

```js
{
  synced: true,
  run: { id, status, progress, errorCode },
  results: [{ metricCode, value, unit, version, from, to, coverageRate, confidence, estimated, cutoffAt, status, reasonCode }]
}
```

默认只返回 `is_current = 1`；显式指定 run 只用于重算预览/审计。读取接口不触发计算、不写库。

- [x] 5.5 更新文档的异步、轮询、幂等、超时、失败恢复和当前批次切换契约。

- [x] 5.6 验证并提交：

```bash
node --test tests/data-standards-results-api.test.mjs tests/data-standards-calculation.test.mjs tests/data-standards-storage.test.mjs
git add functions/api/platform/v1/data-standards/recalculate.js functions/api/platform/v1/data-standards/results.js functions/api/platform/v1/_shared/dataStandardsCalculation.js functions/api/platform/v1/_shared/dataStandardsStorage.js tests/data-standards-results-api.test.mjs docs/platform/apis/data-standards-v1.md
git commit -m "feat(platform): version metric calculation results"
```

---

## Task 6：建立前端共享客户端和状态编排

**Files:**

- Create: `src/state/dataStandardsApi.js`
- Create: `src/state/DataStandardsProvider.jsx`
- Create: `react-tests/data-standards-api-client.test.mjs`
- Create: `react-tests/data-standards-provider.test.mjs`
- Modify: `src/main.jsx`
- Modify: `src/state/DataCenterProvider.jsx`

- [x] 6.1 先写失败测试，覆盖 URL、过滤参数、CRUD body 白名单、错误码保留、结果轮询停止条件、卸载取消、范围变化去抖、无权限不发写请求、不会把定义/结果写入 localStorage。

- [x] 6.2 实现客户端唯一入口：

```js
export function loadDataStandards(filters, fetchImpl = fetch) {}
export function loadDataStandard(id, fetchImpl = fetch) {}
export function createDataStandard(input, fetchImpl = fetch) {}
export function publishDataStandardVersion(id, input, fetchImpl = fetch) {}
export function archiveDataStandard(id, input, fetchImpl = fetch) {}
export function previewDataStandard(input, fetchImpl = fetch) {}
export function requestMetricCalculation(input, fetchImpl = fetch) {}
export function loadMetricResults(query, fetchImpl = fetch) {}
```

- [x] 6.3 `DataStandardsProvider` 管理目录、筛选、详情、saving、errors、结果和 run 轮询。`ensureResults(range, SALES_OVERVIEW_METRIC_CODES)` 先 GET 当前结果；缺失或版本过期时 POST `ensure_current`，每 800ms 轮询，最大 20 次，超时后保留可重试错误。

- [x] 6.4 把 Provider 挂在 `ProductFlowProvider` 内、Data Center 和其他业务 App 外，使多个 App 可以通过 `useDataStandards()` 读取；`DataCenterProvider` 继续负责连接器、质量和原始销售兼容数据，不再拥有口径 CRUD。

- [x] 6.5 验证和提交：

```bash
node --test react-tests/data-standards-api-client.test.mjs react-tests/data-standards-provider.test.mjs react-tests/data-center-provider.test.mjs
git add src/state/dataStandardsApi.js src/state/DataStandardsProvider.jsx src/state/DataCenterProvider.jsx src/main.jsx react-tests/data-standards-api-client.test.mjs react-tests/data-standards-provider.test.mjs react-tests/data-center-provider.test.mjs
git commit -m "feat(data): orchestrate shared metric standards"
```

---

## Task 7：交付“数据口径”CRUD 和公式构建器界面

**Files:**

- Create: `src/features/data-center/data-standards/DataStandardsWorkspace.jsx`
- Create: `src/features/data-center/data-standards/DataStandardEditorDialog.jsx`
- Create: `src/features/data-center/data-standards/FormulaBuilder.jsx`
- Create: `src/features/data-center/data-standards/DataStandardDetailDialog.jsx`
- Create: `src/features/data-center/data-standards/DataStandardRecalculationDialog.jsx`
- Create: `react-tests/data-standards-ui.test.mjs`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `src/styles.css`

- [ ] 7.1 先写失败测试，覆盖：“数据口径”标题、11 项分区、搜索/分类/状态筛选、新增、编辑新版本、详情版本历史、受控节点选择、样本预览、归档影响、重算范围、只读态、保存中禁用、服务端字段错误、409 冲突刷新、数据未覆盖状态和无任意代码输入框。

- [ ] 7.2 页面头部使用治理说明、筛选和“新增口径”；列表按销售/货流分区，展示名称、`metricCode`、展示公式、版本与生效日、覆盖状态、责任部门、操作。窄屏改为卡片，不强迫横向表格滚动。

- [ ] 7.3 编辑器分为 5 步：基本信息、数据范围、公式、样本预览、发布确认。公式构建器只能从 `FACT_FIELD_REGISTRY`、已发布指标、聚合/运算下拉和结构化过滤行生成 AST；不提供 textarea 代码模式。

- [ ] 7.4 权限 UI：总经办可选责任部门；运营/财务/供应链的责任部门只读锁定；其他人只显示详情。所有写按钮还要处理 API 403，不能把客户端判断当安全边界。

- [ ] 7.5 对话框要求：初始焦点、焦点限制、Esc、未保存确认、错误与字段关联、请求中禁用、关闭后清草稿；390px 使用全屏抽屉，底部操作不遮挡键盘。

- [ ] 7.6 删除旧 `MetricDefinitionsWorkspace` 的只读实现并替换为新 workspace；导航 route key 继续使用 `data-metrics`。

- [ ] 7.7 验证和提交：

```bash
node --test react-tests/data-standards-ui.test.mjs react-tests/data-center-app.test.mjs
npm run build
git add src/features/data-center/data-standards src/features/data-center/DataGovernanceWorkspaces.jsx src/features/data-center/DataCenterAppPage.jsx src/styles.css react-tests/data-standards-ui.test.mjs react-tests/data-center-app.test.mjs
git commit -m "feat(data): add data standards workspace"
```

---

## Task 8：让数据总览只读统一口径结果

**Files:**

- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `src/features/data-center/DataOverview.jsx`
- Modify: `src/domain/dataCenter.js`
- Modify: `src/state/DataStandardsProvider.jsx`
- Create: `react-tests/data-center-governed-overview.test.mjs`
- Modify: `react-tests/data-center-app.test.mjs`

- [ ] 8.1 先写失败测试：页面源码不再调用 `summarizeDataCenterSales` 生成 KPI；5 张 KPI 卡按 metricCode 读取结果；空值显示“暂无结果”和原因；覆盖不足显示覆盖率；计算中、失败、重试、版本和截止时间可见；绝不回退到硬编码金额。

- [ ] 8.2 定义固定映射，不在组件内写公式：

```js
const OVERVIEW_METRICS = [
  { metricCode: "sales.net_sales", label: "净销售额", format: "money" },
  { metricCode: "sales.quantity", label: "销售数量", format: "number" },
  { metricCode: "sales.gross_profit", label: "毛利", format: "money" },
  { metricCode: "sales.refund_rate", label: "退款率", format: "percent" },
  { metricCode: "sales.gross_margin_rate", label: "毛利率", format: "percent" }
];
```

`DataOverview` 接收 `metricResults`、`metricRun` 和 `retryMetricResults`。金额/百分比格式化必须保留 `null`，不能用 `value || 0`。

- [ ] 8.3 日期范围变化后调用 `ensureResults`；有当前结果立即展示，有运行中的新批次时标注“正在更新”但不拿部分结果替换旧批次。结果无覆盖时显示 `reasonCode` 对应中文说明。

- [ ] 8.4 经营趋势和平台贡献暂时继续读取事实数据，标题明确它们是“销售事实视图”；五张 KPI 完成共享口径切换。后续要治理趋势/平台维度时复用同一结果 API 的 dimension 参数，不在本任务扩展。

- [ ] 8.5 删除生产界面对 `summarizeDataCenterSales` 的 KPI 依赖；该函数若仍被产品详情等真实消费者使用则保留，否则连同过时测试删除。更新 durable docs，明确本次只切 5 个 KPI、趋势/贡献仍是事实维度视图。

- [ ] 8.6 运行对账夹具：相同输入下旧摘要与新引擎 5 项值一致；零分母场景允许差异，旧值 0 必须被新值 `null` 取代并在测试中解释。

- [ ] 8.7 验证和提交：

```bash
node --test react-tests/data-center-governed-overview.test.mjs react-tests/data-center-app.test.mjs tests/data-standards-calculation.test.mjs
git add src/features/data-center/DataCenterAppPage.jsx src/features/data-center/DataOverview.jsx src/domain/dataCenter.js src/state/DataStandardsProvider.jsx react-tests/data-center-governed-overview.test.mjs react-tests/data-center-app.test.mjs docs/features/data-center-app/data-standards-design.md
git commit -m "feat(data): drive overview from governed metrics"
```

---

## Task 9：补齐本地边界、兼容和恢复路径

**Files:**

- Modify: `server.mjs`
- Modify: `tests/local-data-center-server.test.mjs`
- Create: `tests/data-standards-compatibility.test.mjs`
- Modify: `docs/features/data-center-app/data-standards-design.md`
- Modify: `docs/features/data-center-app/prd.md`
- Modify: `docs/features/data-center-app/design.md`

- [ ] 9.1 先写失败测试，覆盖：旧 `/api/data-center` 不再写口径表；旧 metadata JSON 带 `metricDefinitions` 时不会覆盖共享定义；缺少 D1 时共享 API 返回 501；本地 Node 服务不伪装为线上共享结果；旧 `#data-metrics` 链接仍可进入“数据口径”。

- [ ] 9.2 在 `server.mjs` 为 `/api/platform/v1/data-standards*` 返回结构化 `DATA_STANDARD_STORAGE_UNAVAILABLE` 501。目录页可以展示内置只读定义，但新增/编辑/计算必须明确提示“本地测试模式没有 D1”；不把本地 JSON 伪装为公司共享口径或共享结果。

- [ ] 9.3 兼容迁移读取旧两项定义，但所有新写入只走共享 API。回滚开关只允许把总览临时切回旧事实摘要，默认关闭，并在页面显著标记“兼容回滚口径”；不得删除新版本、结果和审计。

- [ ] 9.4 更新 PRD 状态为“实施中”，补充本地 501、旧表保留、结果读取切换和生产迁移授权边界。

- [ ] 9.5 验证和提交：

```bash
node --test tests/local-data-center-server.test.mjs tests/data-standards-compatibility.test.mjs tests/data-center-api.test.mjs
git add server.mjs tests/local-data-center-server.test.mjs tests/data-standards-compatibility.test.mjs docs/features/data-center-app/data-standards-design.md docs/features/data-center-app/prd.md docs/features/data-center-app/design.md
git commit -m "fix(data): preserve metric migration boundaries"
```

---

## Task 10：完整验证、视觉验收和交付记录

**Files:**

- Modify: `docs/features/data-center-app/tasks.md`
- Modify: `docs/features/data-center-app/prd.md`
- Modify only files required by verification findings

- [ ] 10.1 逐项核对 11 条验收标准、API 错误、权限矩阵、迁移、容量和回滚。更新 `tasks.md` 的实际提交、测试数和未执行边界；把 PRD 状态改为“已实现，待生产发布”仅限全部本地门禁通过后。

- [ ] 10.2 运行新功能定向测试：

```bash
node --test react-tests/data-standards-domain.test.mjs react-tests/data-standards-api-client.test.mjs react-tests/data-standards-provider.test.mjs react-tests/data-standards-ui.test.mjs react-tests/data-center-governed-overview.test.mjs tests/data-standards-storage.test.mjs tests/data-standards-api.test.mjs tests/data-standards-calculation.test.mjs tests/data-standards-results-api.test.mjs tests/data-standards-compatibility.test.mjs
```

- [ ] 10.3 运行项目 Definition of Done，任何失败都先修复再重跑完整命令：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

- [ ] 10.4 运行文本和差异检查：

```bash
git diff --check
rg -n "指标管理|MetricDefinitionsWorkspace|TODO|TBD|placeholder" src functions docs/features/data-center-app docs/platform tests react-tests
git status --short
```

`指标管理` 和 `MetricDefinitionsWorkspace` 在生产 UI 中应为 0 命中；测试迁移说明中的历史词可以保留，但必须可解释。计划不得残留 `TODO`、`TBD` 或占位实现。

- [ ] 10.5 启动本地页面，分别检查 1440、900、640、390px：层级、间距、对齐、卡片/表格切换、弹窗、键盘、焦点、Esc、空/错/禁用/无权限/版本冲突/计算中/数据未覆盖/重算失败状态、控制台错误和页面横向溢出。记录本地没有 D1 时的 501 是边界，不把它写成生产已接通。

- [ ] 10.6 在有授权的独立发布窗口执行迁移前备份、Preview 迁移、只读对账、Production 迁移、结果生成和读取切换。部署后分别运行：

```bash
npm run verify:production -- --require-platform cloudflare-d1
npm run verify:production -- --require-platform cloudflare-pages
```

无授权时将生产迁移、部署、线上结果写入、钉钉 WebView 验收标记为“未执行”或“受阻”，不能用本地构建代替。

- [ ] 10.7 最终检查只包含本功能文件，提交交付记录：

```bash
git add docs/features/data-center-app/tasks.md docs/features/data-center-app/prd.md
git commit -m "docs(data): record data standards verification"
```

## 实施顺序和检查点

1. Task 1–3 完成后检查点：可治理的定义和版本已经独立于旧 metadata 存储，但总览尚未切换。
2. Task 4–5 完成后检查点：销售 5 项可以通过同一引擎预览、重算、落库和读取；货流 6 项诚实返回数据未覆盖。
3. Task 6–7 完成后检查点：授权用户可以在页面完成 CRUD、版本发布、归档和显式重算。
4. Task 8 完成后检查点：总览五项 KPI 才允许切换；对账未通过则保持读取开关关闭。
5. Task 9–10 完成后检查点：本地、Preview、Production 和钉钉 WebView 分栏报告，不扩大授权范围。
