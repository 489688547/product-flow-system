# 用户洞察共享 API v1

## 用途与消费者

该契约为数据中心、产品全周期和电商店铺运营提供同一份多平台市场事实、类目映射、部门规则、竞品候选和参考建议。业务 App 不能直接读取平台后台或调用浏览器采集器。

## 认证与授权

- 普通查询使用现有钉钉公司会话，仅总经办、产品部和运营部可访问。
- 类目确认由非只读总经办、产品或运营执行。
- `product-flow` 规则只允许产品部维护；`ecommerce-operations` 规则只允许运营部维护；总经办可维护全局范围。
- 规则跨 App 只读和复制，复制产生新 ID 与版本，不能覆盖来源。
- 采集设备使用一次返回、服务端仅保存 SHA-256 哈希的 Bearer 令牌。设备令牌不能调用普通用户接口，用户会话不能调用 ingest。
- 查询和写入同时校验 App、部门、平台、店铺、产品、SKU、已确认类目和只读状态。

## 查询

`GET /api/platform/v1/user-insights`

查询参数：`viewType=shop|product`、`platform`、`shopId`、`productId`、`skuId`、`categoryId`、`from`、`to`。省略参数表示在当前授权范围内查询，不代表跨平台指标可以合并。

响应：

```json
{
  "synced": true,
  "advisoryOnly": true,
  "scope": { "viewType": "product", "platform": "抖音", "productId": "p-1", "categoryId": "cat-1" },
  "actor": { "departments": ["产品部"], "readonly": false },
  "data": {
    "categoryMappings": [],
    "snapshots": [],
    "entities": [],
    "ruleSets": [],
    "ruleHistory": [],
    "competitors": [],
    "suggestions": [],
    "syncRuns": []
  }
}
```

快照包含平台、范围、维度、结构版本、覆盖率、质量和最后成功时间。建议固定 `advisoryOnly=true`，并包含证据、规则版本、覆盖率、置信度、新鲜度与限制。

## 类目映射

`GET|POST|PATCH /api/platform/v1/user-insights/category-mappings`

- `POST { mapping, action: "upsert" }`：登记系统建议或人工录入的后台类目。
- `POST { mapping, action: "confirm", expectedVersion }`：人工确认后进入采集范围。
- `PATCH { mapping, action: "disable", reason, expectedVersion }`：带原因停用。

确认保存确认人、部门、时间和版本。未确认映射不能出现在采集任务中。

## 规则

`GET|POST|PATCH /api/platform/v1/user-insights/rules`

- 新增/更新：`{ rule, action: "upsert|publish|disable", expectedVersion }`。
- 跨 App 复制：`{ action: "copy", sourceRuleId, target: { id, consumerAppId, ownerDepartment } }`。

规则必须包含 ID、消费 App、负责部门和平台；可限定店铺、产品、SKU、类目、竞品条件、建议模板、权重与最低覆盖率。创建、复制、发布和停用写入 `ruleHistory`；版本冲突返回 409，源规则不变。

## 竞品

`GET|POST|PATCH /api/platform/v1/user-insights/competitors`

- `POST { competitor }` 新增的系统发现或人工对象默认只能是 `candidate`。
- `PATCH { id, status: "candidate|core|rejected|disabled", reason, expectedVersion }` 需要负责部门人工确认和原因，可将停用对象恢复为候选。

采集完成后，服务端用当前已发布规则匹配商品实体并创建候选。候选不会自动成为核心竞品。

## 手动重试

`POST /api/platform/v1/user-insights`，请求 `{ action: "retry", scope }`。只有已确认的平台类目可进入 `queued`；操作写入同步运行与审计。刷新页面只读数据，不触发采集。

## 采集设备

`POST /api/platform/v1/user-insights/collector` 仅总经办，用于登记设备名称和允许的平台/店铺范围。原始令牌只在 201 响应中显示一次，服务端只保存哈希。

`GET /api/platform/v1/user-insights/collector` 使用设备 Bearer 令牌，返回允许范围内、状态为 `confirmed` 的类目任务及安全的提取配置。响应不包含 Cookie、凭证或浏览器会话。

## Ingest

`POST /api/platform/v1/user-insights/ingest` 使用设备 Bearer 令牌：

```json
{
  "action": "complete",
  "idempotencyKey": "platform:shop:category:dimension:day:schema:hash",
  "run": { "id": "run-id", "platform": "抖音", "shopId": "shop-1", "categoryId": "cat-1", "dimension": "product", "status": "healthy" },
  "snapshot": { "id": "snapshot-id", "coverage": 1, "metrics": {} },
  "entities": []
}
```

服务端校验令牌范围、人工确认映射、维度、幂等键和字段白名单。重复幂等键返回 200 与 `duplicate:true`；失败批次保留同步记录但不替换最后成功快照。单批最多 2,000 个实体。

## 错误

统一返回 `{ synced:false, message, error:{ code, message, retryable } }`：

- `AUTH_SESSION_REQUIRED`、`AUTH_RUNNER_TOKEN_REQUIRED`、`AUTH_RUNNER_TOKEN_INVALID`
- `PERMISSION_READ_DENIED`、`PERMISSION_RULE_WRITE_DENIED`、`PERMISSION_CATEGORY_UNCONFIRMED`、`PERMISSION_RUNNER_SCOPE_DENIED`
- `VALIDATION_RULE_INVALID`、`VALIDATION_COMPETITOR_TRANSITION`、`VALIDATION_INGEST_INVALID`
- `CATEGORY_CONFIRMATION_REQUIRED`、`VERSION_CONFLICT`、`STORAGE_D1_UNAVAILABLE`

登录失效、页面结构变化和数据不完整不是伪成功：采集运行分别使用 `login_required`、`schema_changed` 和 `partial`，页面保留最后成功快照。

## 兼容、弃用与回滚

- v1 只新增字段；客户端必须忽略未知字段。字段删除或语义变化需要新 API 版本。
- `/api/data-center` 和 `/api/data-center/sales` 不变；产品与运营 App 可渐进迁移到共享洞察查询。
- 回滚关闭导航和采集计划，API 可转只读；新增表保留，不删除历史规则或审计。
- 当前没有弃用路径。未来弃用必须在平台目录标明替代接口和至少一个发布周期。

## 可观测性与测试

- 审计记录类目确认、规则复制/发布、竞品确认、设备登记和手动重试，不保存原始页面或敏感字段。
- 同步运行记录平台、范围、维度、结构版本、内容哈希、状态、错误和最后成功时间。
- CI 只使用固定页面/导出/响应夹具，覆盖认证、授权、版本、幂等、登录页、结构变化和缺失字段；不登录真实平台。
- 生产验收独立记录已授权平台、类目、页面结构版本和结果。
