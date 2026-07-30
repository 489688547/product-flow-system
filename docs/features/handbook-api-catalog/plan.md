# 说明书 API 目录实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有说明书中交付按 App 组织、包含真实契约示例、仅允许白名单 `GET` 安全实测的 API 目录。

**Architecture:** 扩展现有说明书能力，不建设平行文档系统。`docs/platform/api-registry.json` 保存可校验的目录元数据，`docs/platform/apis/*.md` 保存完整契约；纯领域模块负责校验、筛选和脱敏，状态模块只执行登记过的同源 `GET`，专用 React 工作区负责呈现。

**Tech Stack:** React、Vite `import.meta.glob`、Node.js ESM、原生 `fetch`/`AbortController`、Node test runner、现有说明书设计系统。

## 全局约束

- 顶部顺序固定为“使用手册 → 产品与设计 → 平台能力 → API 目录”。
- 未知 App、重复 `method + path`、失效契约、敏感示例和非 `GET` 实测配置必须 fail closed。
- 静态示例只取自当前路由、契约测试或 `docs/platform/apis/*.md`，不得猜测字段。
- 页面不得执行 `POST`、`PUT`、`PATCH` 或 `DELETE`。
- 真实测试只访问登记过的同源路径，不接受自定义 URL、Header 或请求体。
- 响应数组最多 20 项，预览最多 100 KiB，默认超时 15 秒。
- 不新增 D1 表、Secret、服务端路由或外部平台调用。
- 所有新增页面状态覆盖键盘、焦点、空、错误、无权限、禁用、超时、窄屏和钉钉 WebView。

---

## 架构方案

### 数据边界

`docs/platform/api-registry.json` 提供目录索引、App 归属、状态、示例来源和实测白名单。完整权限、分页、幂等、兼容和错误说明继续由 `docs/platform/apis/*.md` 负责。登记表不复制真实生产响应，也不包含凭据或个人业务数据。

### 依赖方向

```text
ApiCatalogWorkspace
  → src/domain/apiCatalog.js
  → src/state/apiCatalogApi.js
  → 当前同源 API 路由

handbookCatalog.js
  → docs/platform/api-registry.json
  → docs/platform/apis/*.md
```

### 兼容策略

- 现有 `platform/api-catalog` 深链保留，内容改为 App 级概览和新目录说明。
- 现有三类说明书文档、外部平台地图、环境就绪面板和 Markdown 渲染保持原路径。
- `docs/platform/apis/*.md` 使用 `api/<name>` 稳定 slug，避免与 `docs/platform/*.md` 冲突。

## 文件职责

- `docs/platform/api-registry.json`：唯一机器目录和只读实测白名单。
- `src/domain/apiCatalog.js`：登记表校验、筛选、请求构造、递归脱敏和预览限制。
- `src/state/apiCatalogApi.js`：使用当前会话执行固定同源 `GET`，返回结构化测试结果。
- `src/domain/handbook.js`：增加 `api` 顶部分类。
- `src/features/handbook/handbookCatalog.js`：加载 API 契约文档和登记表。
- `src/features/handbook/ApiCatalogWorkspace.jsx`：组合筛选、列表、详情、复制和实测状态。
- `src/features/handbook/api-catalog.css`：API 工作区响应式与状态样式。
- `src/features/handbook/HandbookPage.jsx`：在 `api` 分类挂载专用工作区。
- `docs/platform/api-catalog.md`：按 App 的人工阅读概览。
- `tests/api-registry.test.mjs`：机器目录、契约来源、示例和安全白名单检查。
- `react-tests/api-catalog.test.mjs`：领域、状态客户端和 React 工作区行为。
- `react-tests/handbook.test.mjs`：说明书分类、深链和文档加载回归。

## 接口与契约

### `validateApiRegistry`

```js
validateApiRegistry(input) => {
  version: 1,
  apps: Array<{ id: string, label: string, order: number }>,
  endpoints: Array<ApiEndpoint>
}
```

无效输入抛出带稳定 `code` 的错误：

- `API_REGISTRY_INVALID`
- `API_APP_UNKNOWN`
- `API_ENDPOINT_DUPLICATE`
- `API_CONTRACT_MISSING`
- `API_EXAMPLE_INVALID`
- `API_LIVE_TEST_FORBIDDEN`

### `filterApiEndpoints`

```js
filterApiEndpoints(endpoints, {
  query: string,
  appId: string,
  method: string,
  status: string
}) => ApiEndpoint[]
```

空筛选返回全部；关键词匹配标题、摘要、方法、路径和登记错误码。

### `sanitizeApiPreview`

```js
sanitizeApiPreview(value, {
  maxArrayItems: 20,
  maxBytes: 102400
}) => {
  body: unknown,
  truncated: boolean
}
```

敏感字段值替换为 `"[已遮罩]"`；输出不得包含原始敏感值。

### `runApiLiveTest`

```js
runApiLiveTest({
  endpoint,
  params,
  fetchImpl,
  now,
  timeoutMs
}) => Promise<{
  testedAt: string,
  status: number,
  durationMs: number,
  requestId: string | null,
  dataEnvironment: string | null,
  body: unknown,
  truncated: boolean
}>
```

函数再次校验 `endpoint.method === "GET"`、`liveTest.enabled === true`、同源固定路径和查询白名单；响应使用 `sanitizeApiPreview` 后返回。

## 数据迁移

- 无数据库迁移和历史回填。
- 现有 API 总目录内容按 App 重写，但 Git 历史保留旧内容。
- 新登记表首版仅登记有真实契约依据的接口；证据不足项显式标记 `contract_pending`。
- 删除独立 API 分类即可回滚 UI；契约文档和登记表保留不会影响业务 API。

## 风险与回滚

1. **目录与路由漂移**：`tests/api-registry.test.mjs` 校验契约文件、示例和已知路由；失败阻止合并。
2. **真实响应过大**：读取后立即脱敏限量，不写缓存或持久化；超限显示截断标记。
3. **误执行写请求**：领域和状态模块双重拒绝非 `GET`；UI 对写方法不渲染执行按钮。
4. **说明书页面变重**：API 工作区按 `api` 分类才挂载；响应只保留当前选中接口。
5. **生产接口暂时失败**：目录和静态契约仍可阅读；测试结果显示真实错误和重试入口。

## 验证命令

```bash
node --test tests/api-registry.test.mjs
node --test react-tests/handbook.test.mjs react-tests/api-catalog.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
npx wrangler pages functions build
```

UI 还需在 `1440 × 900`、`1024 × 768`、`390 × 844` 和钉钉 WebView 中检查分类、筛选、长路径、代码复制、403、超时、响应截断和写接口禁用。

## 任务顺序

1. 建立机器目录和纯领域安全规则。
2. 增加 API 分类与契约文档加载。
3. 实现专用目录工作区和静态契约详情。
4. 接入安全只读实测。
5. 写回 App 级概览，完成全量与实页验收。
