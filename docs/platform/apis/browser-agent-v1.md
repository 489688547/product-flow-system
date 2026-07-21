# 浏览器采集 Agent API v1

## 用途与边界

`/api/platform/v1/browser-agent/*` 是公司采集设备执行通用 provider 任务的协议。普通公司会话不能调用这些接口；业务 App 不能直接访问 agent。

## 设备认证

设备使用服务端只保存 SHA-256 哈希的 Bearer Token。令牌必须是 active，并显式包含任务 `platformId`。请求日志不得记录 Authorization。设备令牌不授予用户接口或外部平台写操作权限。

## 领取任务

`GET /api/platform/v1/browser-agent/tasks` 返回最多五个已领取任务：

```json
{
  "tasks": [{
    "id": "task-id",
    "type": "douyin_login_verification",
    "resourceType": "connection_identity",
    "schemaVersion": "v1",
    "cursor": "",
    "platformId": "douyin-ecommerce",
    "loginUrl": "https://fxg.jinritemai.com/login/common?channel=zhaoshang",
    "grant": "bat_once-only",
    "grantExpiresAt": "2026-07-20T08:05:00.000Z"
  }]
}
```

响应不含账户或 secret。claim 五分钟到期后可重新领取；相同任务更新使用条件写，避免多个 agent 同时获得有效 claim。

## 领取任务凭据

`POST /api/platform/v1/browser-agent/tasks/:id/credential` 使用一次性 grant 作为 Bearer Token。grant 绑定 task、runner、connection 和 credentialVersion，五分钟过期，原子消费后不能再次使用。

```json
{
  "platformId": "douyin-ecommerce",
  "accountLabel": "operator@example.com",
  "credentialSchemaId": "email-password-v1",
  "credentials": { "password": "secret" },
  "loginUrl": "https://fxg.jinritemai.com/login/common?channel=zhaoshang"
}
```

响应使用 private no-store。provider adapter 必须校验 platform、credential schema 和固定允许域名后才能打开浏览器。

## 回写结果

`POST /api/platform/v1/browser-agent/tasks/:id/result` 使用设备 Bearer Token。状态只允许 `waiting_human_verification`、`recognizing`、`succeeded`、`failed`。成功 payload 由 `providerId + resourceType + schemaVersion` 对应的 writer 校验并写入标准表。

抖音身份结果：

```json
{
  "status": "succeeded",
  "shops": [{ "shopId": "shop-id", "shopName": "品牌旗舰店", "shopAvatarUrl": "https://..." }]
}
```

结果入口拒绝 password、Cookie、Token、验证码、完整 HTML、截图和未登记字段。店铺按平台 ID 去重，不按名称去重。

## Provider registry

provider 必须声明凭据 schema、固定登录 URL/允许 origin、任务类型、资源类型和 schemaVersion。任务领取、凭据发放和结果 writer 都按注册表默认拒绝。ERP 等平台新增订单、商品或库存时复用 API，但需要独立 adapter、资源 schema 和事实表 writer。

## 错误与重试

- `AUTH_RUNNER_TOKEN_REQUIRED`、`AUTH_RUNNER_TOKEN_INVALID`
- `BROWSER_AGENT_SCOPE_DENIED`、`BROWSER_AGENT_GRANT_INVALID`
- `BROWSER_AGENT_TASK_NOT_FOUND`、`BROWSER_AGENT_TASK_FINISHED`
- `BROWSER_AGENT_RESULT_INVALID`、`BROWSER_AGENT_RESULT_SENSITIVE`
- adapter 业务错误：`HUMAN_VERIFICATION_TIMEOUT`、`PROVIDER_SCHEMA_CHANGED`

服务端不自动重放已消费 grant。页面改版或人工验证超时保留最后成功结果，通过新 claim 重试。

## 兼容、容量与回滚

- v1 客户端忽略未知任务字段；任务/resource 语义变化通过 `schemaVersion` 演进。
- task、grant 和 audit 为追加数据；运行维护应按合规保留期归档已结束任务和已消费 grant，不清理连接或事实。
- 回滚可暂停 agent 和任务创建；未执行任务、连接密文和最后成功事实保留。恢复后过期 claim/grant 自动失效并重新领取。

## 契约测试与生产验收

CI 使用假设备、固定 DOM 和响应夹具覆盖 scope、一次性 grant、凭据版本、no-store、敏感结果拒绝、人工验证和固定域名。真实 Chrome 登录、验证码接管、页面结构、公司 Mac 在线状态和生产 D1 必须单独验收，不能用 CI 成功替代。
