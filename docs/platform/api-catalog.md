# API 目录

当前接口首先服务本应用，统一登记为内部 API。出现多个真实系统调用方后，稳定契约迁移到 `/api/platform/v1/`。

## 共享状态

| 路径 | 用途 | 主要约束 |
| --- | --- | --- |
| `/api/state` | 读取和保存产品全周期共享状态 | 需要公司会话；写操作拒绝只读身份；大状态按 D1 行限制分片 |
| `/api/platform` | 读取和保存公司战略执行实体 | 仅总经办范围；实体分记录存储；写操作需要非只读身份 |
| `/api/brand-content` | 读取品牌内容状态并应用单个领域动作 | 全员登录后可读；品牌、运营和总经办按动作权限写入；独立 D1 状态表；乐观版本冲突返回 409 |
| `/api/sales` | 查询产品销售聚合 | 需要公司会话；时间和平台口径见产品数据定义 |
| `/api/data-center` | 读取和保存数据中心安全元数据 | 指定部门可读；仅总经办和运营部可写；拒绝只读身份；D1 分实体表存储 |
| `/api/data-center/sales` | 按日期读取数据中心销售事实 | 需要公司会话；最长 370 天；订单创建时间；上海时区；排除“其它” |
| `/api/platform/v1/integrations` | 读取和维护内部平台资料 | 全员可读；仅总经办非只读身份可写；字段白名单；D1 审计只记录字段名 |
| `/api/platform/v1/collaboration-items` | 查询和创建跨 App 部门协同事项 | 公司会话；普通员工按本人和部门参与范围；游标分页；业务幂等键 |
| `/api/platform/v1/collaboration-items/:id` | 读取、修改和归档单个协同事项 | 参与范围；版本乐观锁；无物理 DELETE |
| `/api/platform/v1/collaboration-items/:id/transitions` | 执行协同状态动作 | 状态机和角色双重校验；动作幂等；追加活动 |
| `/api/platform/v1/collaboration-items/:id/activities` | 读取协同活动记录 | 与事项相同的读取范围；按时间倒序 |
| `/api/platform/v1/collaboration-items/:id/dingtalk` | 同步协同责任到钉钉待办 | 已确认稳定主负责人；平台统一调用；失败不回滚协同状态 |

### 数据中心契约

`GET /api/data-center` 返回标准化元数据状态；`POST /api/data-center` 接收 `{ "state": { ... } }`。元数据分别保存到 `data_sources`、`data_runners`、`data_sync_runs`、`data_source_files`、`data_dimension_mappings`、`data_metric_definitions`、`data_quality_issues`、`data_app_subscriptions` 和 `data_audit_logs`，设置与版本保存在 `data_center_meta`。来源记录只包含网页地址、采集方式、负责人、状态和口径，不接收凭据。

`GET /api/data-center/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` 读取现有 `product_sales_daily`，响应包含 `rows` 和以下口径元数据：

```json
{
  "meta": {
    "from": "2026-07-01",
    "to": "2026-07-17",
    "timeBasis": "create_time",
    "timezone": "Asia/Shanghai",
    "excludeOther": true,
    "lastSuccessfulSyncAt": "2026-07-18T00:10:00.000Z"
  }
}
```

兼容策略：数据中心不复制销售事实，继续复用 `product_sales_daily`。本地开发没有 D1 时，元数据写入 `.local-data/data-center-state.json`，销售读取返回 501 并由前端降级到现有浏览器销售仓库；销售行不会写入 `localStorage`。

### 内部平台资料契约

`GET /api/platform/v1/integrations` 返回：

```json
{
  "synced": true,
  "profiles": [
    {
      "platformId": "dingtalk",
      "consoleUrl": "https://example.internal-console.invalid/",
      "accountSubject": "公司主体",
      "resourceNames": ["产品全周期应用"],
      "environments": [{ "name": "生产", "url": "https://example.invalid/", "notes": "钉钉工作台" }],
      "owner": "平台管理员",
      "permissionGuide": "按公司权限流程申请",
      "runbook": "公司知识库中的运行手册",
      "verifiedAt": "2026-07-17",
      "updatedAt": "2026-07-17T09:00:00.000Z",
      "updatedBy": "平台管理员"
    }
  ]
}
```

`PUT /api/platform/v1/integrations` 接收单个平台资料，字段与上例相同但不接收 `updatedAt` 和 `updatedBy`。平台 ID 必须存在于公开注册表；URL 必须使用 HTTPS；最近验证日期使用 `YYYY-MM-DD`。额外字段、敏感参数和疑似凭据会返回 400。

兼容策略：该接口是新增的 `v1` 契约，不改变现有 API。前端在 GET 失败时降级为公开注册表；写入失败不修改本地公开状态。D1 未绑定返回 501，运维应补充 `PRODUCT_FLOW_DB` 后重新部署。

可观测性：错误响应包含稳定 `error.code`、安全中文说明、`requestId` 和 `retryable`；审计记录平台 ID、动作、变更字段名、操作者和时间，不记录资料值。

### 部门协同契约

完整请求、响应、权限、错误、幂等、分页和契约测试见 `docs/platform/apis/collaboration-items-v1.md`。该接口使用独立 D1 表，不读取或覆盖 `/api/platform` 的战略整包状态。业务 App 只构造协同草稿；平台负责持久化、状态、审计和钉钉同步。

### 品牌内容协同契约

`GET /api/brand-content` 返回独立的品牌内容状态、整数版本、更新时间和更新人。D1 尚无品牌记录时返回 `200`、`synced: false`、`state: null` 和 `version: 0`，不会把本地演示内容写入生产数据库。

`POST /api/brand-content` 接收：

```json
{
  "version": 3,
  "action": {
    "type": "transition_content",
    "id": "BC-260718-001",
    "nextStatus": "editing",
    "reason": "脚本已确认"
  }
}
```

允许动作包括创建内容、推进生产状态、登记 NAS 素材元数据、维护发布记录、确认补充决策和更新非敏感设置。操作者和服务端时间以当前钉钉会话为准，客户端不能覆盖。只读账号和非品牌协同范围写入返回 403；负责人动作、剪辑素材动作和运营发布动作分别校验角色。

兼容策略：接口当前是品牌功能内部 API，不是数据中心共享契约。每次写入必须携带上次读取的 `version`；版本落后返回 `409 BRAND_CONTENT_VERSION_CONFLICT`，客户端重新读取后由用户重试，服务端不静默覆盖。回滚时可隐藏品牌 App 并停止写入，`brand_content_state` 记录继续保留。

主要错误码：`AUTH_SESSION_REQUIRED`、`BRAND_CONTENT_STORAGE_UNAVAILABLE`、`BRAND_CONTENT_WRITE_DENIED`、`BRAND_CONTENT_ACTION_DENIED`、`BRAND_CONTENT_ACTION_INVALID`、`BRAND_CONTENT_VERSION_INVALID`、`BRAND_CONTENT_VERSION_CONFLICT`、`BRAND_CONTENT_STATE_CORRUPT`。错误响应包含 `requestId` 和 `retryable`，不包含凭据、平台原始响应或 NAS 路径外的本地敏感信息。

## 认证

- `/api/auth/session`：读取当前公共会话模型。
- `/api/auth/dingtalk/start`：启动浏览器钉钉登录。
- `/api/auth/dingtalk/callback`：校验 state 并建立公司员工会话。
- `/api/auth/dingtalk/embedded`：钉钉内嵌免登。
- `/api/auth/logout`：撤销当前服务端会话并清理 Cookie。

## 钉钉

- `/api/dingtalk/org/status|sync|users`：组织同步状态、同步和成员读取。
- `/api/dingtalk/todo/create|list|sync`：个人待办创建、读取和幂等同步。
- `/api/dingtalk/calendar/create|events`：日历事件创建和查询。
- `/api/dingtalk/doc/read`：读取已授权钉钉文档。
- `/api/dingtalk/meeting/minutes`：读取可匹配的会议纪要。
- `/api/dingtalk/config` 与 `/api/dingtalk/login`：登录配置和兼容登录入口。

## 快麦

- `/api/kuaimai/pull`：按日期分页拉取订单并聚合。
- `/api/kuaimai/refresh`：刷新配置范围数据。
- `/api/kuaimai/status`：读取同步配置和数据状态。

## 版本与变更

现有路径保持兼容。新多系统契约必须建立 API 文档、负责人、调用方、认证权限、错误码、可观测性和契约测试。破坏性变化通过新版本路径提供，并给调用方迁移时间。
