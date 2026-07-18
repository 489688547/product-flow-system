# API 目录

当前接口首先服务本应用，统一登记为内部 API。出现多个真实系统调用方后，稳定契约迁移到 `/api/platform/v1/`。

## 共享状态

| 路径 | 用途 | 主要约束 |
| --- | --- | --- |
| `/api/state` | 读取和保存产品全周期共享状态 | 需要公司会话；写操作拒绝只读身份；大状态按 D1 行限制分片 |
| `/api/platform` | 读取和保存公司战略执行实体 | 仅总经办范围；实体分记录存储；写操作需要非只读身份 |
| `/api/sales` | 查询产品销售聚合 | 需要公司会话；时间和平台口径见产品数据定义 |
| `/api/platform/v1/integrations` | 读取和维护内部平台资料 | 全员可读；仅总经办非只读身份可写；字段白名单；D1 审计只记录字段名 |
| `/api/platform/v1/collaboration-items` | 查询和创建跨 App 部门协同事项 | 公司会话；普通员工按本人和部门参与范围；游标分页；业务幂等键 |
| `/api/platform/v1/collaboration-items/:id` | 读取、修改和归档单个协同事项 | 参与范围；版本乐观锁；无物理 DELETE |
| `/api/platform/v1/collaboration-items/:id/transitions` | 执行协同状态动作 | 状态机和角色双重校验；动作幂等；追加活动 |
| `/api/platform/v1/collaboration-items/:id/activities` | 读取协同活动记录 | 与事项相同的读取范围；按时间倒序 |
| `/api/platform/v1/collaboration-items/:id/dingtalk` | 同步协同责任到钉钉待办 | 已确认稳定主负责人；平台统一调用；失败不回滚协同状态 |

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
