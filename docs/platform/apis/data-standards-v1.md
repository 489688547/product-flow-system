# 共享数据口径 API 契约

## 基本信息

- 负责人：经营执行平台 / 数据中心负责人
- 调用方：数据中心；后续经营驾驶舱、供应链和公司 AI 通过同一只读契约接入
- 版本：v1
- 集合：`GET|POST /api/platform/v1/data-standards`
- 单项：`GET|PUT /api/platform/v1/data-standards/:id`
- 归档：`POST /api/platform/v1/data-standards/:id/archive`
- 预览：`POST /api/platform/v1/data-standards/preview`
- 存储：`PRODUCT_FLOW_DB` 中的版本化数据口径表

该 API 是数据口径定义、版本、依赖和最近有效结果的共享边界。它不接收任意 SQL 或 JavaScript，不执行外部平台动作，也不替代结果查询、预览和重算的后续独立契约。

## 认证与授权

- 所有方法要求有效公司会话；缺失会话返回 `401 AUTH_SESSION_REQUIRED`。
- 总经办、运营部、财务部、产品部和供应链部可以读取。`供应链`、`供应链团队`、`采购部` 在服务端统一规范为 `供应链部`。
- `readonly` 会话可以读取授权范围，任何写操作返回 `403 PERMISSION_WRITE_DENIED`。
- 运营部、财务部和供应链部只能创建、发布和归档本部门负责的口径。责任部门按服务端会话锁定，不能由请求伪造；即使一个非总经办身份同时属于多个治理部门，也不能把既有口径转移到另一个部门。
- 总经办可以跨部门创建口径，并可在新版本中调整名称、分类、责任部门、单位和周期。
- 产品部和其他只读范围没有定义写权限。页面按钮和默认编辑态不是授权边界，所有单条口径写权限在 API 再次校验。
- 操作者 ID、姓名、部门和服务端时间来自当前会话。请求中的 `actor`、`createdBy`、`createdAt`、`updatedBy`、`updatedAt`、`publishedAt`、`archivedAt`、`archivedBy` 和 `audit` 被丢弃，不能覆盖审计身份或时间。

## 请求

### GET 集合

可选查询参数：

| 参数 | 类型 | 约束 |
| --- | --- | --- |
| `category` | string | 最多 40 字符 |
| `ownerDepartment` | string | 最多 40 字符；供应链别名规范为 `供应链部` |
| `status` | string | `active | archived` |

未知查询参数或非法状态返回 `400 DATA_STANDARD_INVALID`。不传筛选时返回全部当前定义；该接口不分页，首期口径目录保持小规模。

### POST 创建并发布 v1

```json
{
  "metricCode": "sales.order_value",
  "name": "订单金额",
  "category": "sales",
  "ownerDepartment": "运营部",
  "unit": "CNY",
  "period": "day",
  "effectiveFrom": "2026-07-21",
  "displayFormula": "净销售额求和",
  "formulaAst": {
    "type": "aggregate",
    "operation": "sum",
    "input": { "type": "field", "field": "sales.net_sales" },
    "filters": []
  },
  "sourceFields": ["sales.net_sales"]
}
```

只接受 `metricCode`、`name`、`category`、`ownerDepartment`、`unit`、`period`、`effectiveFrom`、`displayFormula`、`formulaAst`、`sourceFields` 和 `expectedVersion`，以及上节列出的会被丢弃的客户端审计字段。其他未知字段返回 400。创建成功返回 201。

`metricCode` 必须全局唯一。重复提交不是幂等命中，返回 `409 DATA_STANDARD_VERSION_CONFLICT`；调用方需要使用稳定业务代码并在重试前读取现有定义。

### PUT 发布新版本

PUT 使用与创建相同的字段白名单，并且必须提交整数 `expectedVersion`。调用方可以只提交本次变化字段、`effectiveFrom`、公式和来源；未提交的名称、分类、责任部门、单位和周期由服务端从当前定义合并，不能被清空。

- `metricCode` 发布后永久不变；提交不同值返回 `400 DATA_STANDARD_INVALID`。
- `name`、`category`、`ownerDepartment`、`unit` 和 `period` 随每个版本保存不可变快照。
- 生效日期必须晚于现有最新版本，且同一口径同一天只能有一个版本。
- `expectedVersion` 落后时不写版本、不写审计、不修改当前定义，返回 409。
- `expectedVersion` 必须是大于 0 的 JSON 整数；缺失、`null`、小数、字符串或非正数先返回 `400 DATA_STANDARD_INVALID`，只有格式合法且落后的整数返回 409。
- 部门管理员不能把责任部门转移给其他部门；总经办可以调整。
- 服务端允许受控的 `goods_flow` 定义使用 `formulaAst: null` 发布为 `executable: false`、`coverageStatus: DATA_NOT_COVERED`，并允许后续元数据版本继续继承该状态。客户端不能提交可信开关，`sales` 空公式仍返回 400。

### POST 归档

```json
{ "expectedVersion": 2 }
```

归档使用乐观版本检查，只把当前定义状态改为 `archived`。版本、依赖、历史结果和审计记录全部保留，不提供物理 DELETE。

### POST 安全预览

预览使用与创建相同的口径字段，并增加 `from`、`to`。日期范围按上海时区解释，首尾均包含，最多连续 31 天。权限与发布一致；财务、运营、供应链只能预览自己责任部门的口径。

预览和正式计算共用受控 AST 编译器与执行器。表名、列名、聚合和过滤只能来自服务端 registry，日期和值使用 D1 bound parameters；请求不能提交 SQL、JavaScript 或任意列名。销售事实固定读取 `product_sales_daily`，按 `create_time` 日聚合并排除“其它/其他/未知/未知平台”。

成功响应返回 `result`，包含 `value`（可为 `null`）、`unit`、`version`、`coverageRate`、`confidence`、`estimated`、`status`、`reasonCode` 和 `dataCutoffAt`。分母为零或事实缺失不补零；尚未覆盖的货流口径返回 `data_not_covered / DATA_NOT_COVERED`，不生成模拟值。预览不写 `data_metric_results`，但成功和失败均追加脱敏审计，只记录口径引用、范围、操作者和结果动作。

## 响应

所有响应包含 `requestId`、`retryable`，并设置 `Cache-Control: no-store`。

集合成功：

```json
{
  "synced": true,
  "definitions": [
    {
      "id": "standard_example",
      "metricCode": "sales.order_value",
      "currentVersion": 2,
      "status": "active",
      "ownerDepartment": "运营部"
    }
  ],
  "requestId": "req_example",
  "retryable": false
}
```

详情成功返回 `definition`，其中 `versions` 按版本倒序，当前 `dependencies` 来自当前版本，`recentResults` 最多返回最近 10 条当前有效结果。每个版本包含名称、分类、责任部门、单位、周期、生效日、公式、来源字段和依赖快照。

错误结构：

```json
{
  "synced": false,
  "message": "口径版本已更新，请刷新后重试。",
  "requestId": "req_example",
  "retryable": false,
  "error": {
    "code": "DATA_STANDARD_VERSION_CONFLICT",
    "message": "口径版本已更新，请刷新后重试。",
    "requestId": "req_example",
    "retryable": false,
    "details": { "currentVersion": 2 }
  }
}
```

## 稳定错误码

| 错误码 | HTTP | 可重试 | 含义 |
| --- | --- | --- | --- |
| `AUTH_SESSION_REQUIRED` | 401 | 否 | 缺少公司会话 |
| `PERMISSION_VIEW_DENIED` | 403 | 否 | 当前部门无读取权限 |
| `PERMISSION_WRITE_DENIED` | 403 | 否 | 只读身份、非责任部门或越权转移 |
| `DATA_STANDARD_INVALID` | 400；资源不存在时 404 | 否 | 请求、字段、日期、公式结构或不可变代码无效 |
| `DATA_STANDARD_FIELD_UNKNOWN` | 400 | 否 | 公式或来源引用未知事实字段 |
| `DATA_STANDARD_CYCLE` | 400 | 否 | 指标依赖形成循环 |
| `DATA_STANDARD_UNIT_MISMATCH` | 400 | 否 | 声明单位与公式推导单位不一致 |
| `DATA_STANDARD_VERSION_CONFLICT` | 409 | 否 | 版本落后或 `metricCode` 已存在 |
| `DATA_STANDARD_EFFECTIVE_DATE_CONFLICT` | 409 | 否 | 生效日不递增或同日重复 |
| `DATA_STANDARD_DEPENDENCY_ARCHIVED` | 400 | 否 | 新版本依赖已归档口径 |
| `DATA_STANDARD_STORAGE_UNAVAILABLE` | 501 | 是 | 缺少 D1 绑定 |
| `INTERNAL_UNEXPECTED` | 500 | 是 | 未预期服务端失败 |

v1 不向调用方暴露数据库约束、SQL、堆栈、Cookie、Token 或底层响应。方法不受支持时使用 `405 DATA_STANDARD_INVALID`，避免新增契约外错误代码。

## 幂等、并发和一致性

- POST 创建不接受客户端幂等键；`metricCode` 唯一约束阻止重复定义，重复请求返回 409。
- PUT 与归档使用 `expectedVersion` 乐观锁。
- 新版本快照、最小审计和当前定义元数据更新在同一个 guarded D1 batch 中完成；并发失败方不能留下孤立版本或审计。
- 同一口径的 `effectiveFrom` 唯一且严格递增。API 不自动覆盖、合并或重放失败写入。
- 客户端只能在重新读取最新版本并由用户确认后重试冲突写入。

## 超时、重试与可观测性

路由只访问 D1，不调用钉钉、快麦或其他外部平台。服务端不进行自动重试，也不在超时后继续业务写入；由 Cloudflare 请求期限终止未完成调用。只有存储不可用和未预期服务错误标记 `retryable: true`。

服务端日志只允许记录 request ID、路由、方法、耗时、状态、错误码、定义 ID 和版本。日志、响应与审计禁止记录完整公式 AST、来源业务事实、计算结果、客户端伪造身份或原始请求体。

审计只追加动作、操作者服务端身份、定义版本、变更字段名和服务端时间；不复制名称、公式、结果或其他业务事实值。

## 兼容、弃用与回滚

- 这是新增的 `/api/platform/v1/` 契约，不改变旧 `/api/data-center` 的响应和写入行为。
- 旧 `metricDefinitions` 仅作为迁移输入保留；共享 API 是新写入的唯一入口，不做双写。
- `0004_data_standards.sql` 在生产执行前增加版本元数据快照列；首批和 legacy v1 均写入完整快照。
- v1 新增可选响应字段保持兼容；删除、改名、改变字段语义或放宽身份边界需要新 API 版本和迁移窗口。
- 当前没有弃用日期。回滚可停止新路由调用并恢复旧读取开关，但不删除已生成版本、结果或审计。
- 本地测试通过不代表生产已迁移或部署；生产迁移、部署和写入需要单独授权。

## 契约测试

- `tests/data-standards-api.test.mjs`：认证、部门授权、字段白名单、版本、依赖、归档、响应和错误结构。
- `tests/data-standards-storage.test.mjs`：迁移快照、原子版本追加、并发冲突和历史保留。
- `react-tests/permissions.test.mjs`：数据中心默认编辑态；具体定义权限仍由本 API 决定。
