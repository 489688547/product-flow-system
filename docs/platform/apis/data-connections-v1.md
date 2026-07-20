# 数据连接 API v1

## 用途与消费者

`/api/platform/v1/data-connections` 管理实例级 provider 连接。数据中心是当前消费者；连接元数据和加密凭据供通用采集平台使用。首期 UI 只开放抖音电商。

## 认证与授权

- GET：有效公司会话，且属于总经办或运营部。
- POST、PUT：上述会话、非只读。
- reveal：上述管理权限，且会话创建不超过 15 分钟。
- 所有权限在服务端校验；页面隐藏不是权限边界。

## 连接模型

连接表保存 `platform_id`、通用 `account_label`、版本化 `credential_schema_id`、`credential_entry_id`、凭据版本、业务状态、乐观锁版本和审计。AES-GCM 密文继续由现有 `credential_vault_entries` 唯一保存。抖音 adapter 将 `loginEmail` 映射为 `account_label`，将 `{ password }` 作为 `email-password-v1` 加密 JSON 写入共享保险箱。

普通响应为了首期 UI 同时返回 `accountLabel` 和抖音兼容字段 `loginEmail`；从不返回 secret、ciphertext、IV 或 grant。

## 请求

`GET /api/platform/v1/data-connections` 无请求体。

抖音首期创建：

```json
{ "loginEmail": "operator@example.com", "password": "secret" }
```

替换凭据：

```json
{ "id": "connection-id", "loginEmail": "operator@example.com", "password": "new-secret", "expectedVersion": 1 }
```

固定后台地址、店铺名称、负责人、账号类型、接入方式和同步数据均不接受客户端输入。PUT 的空密码表示保留旧密码；POST 必须提供密码。

## 响应

```json
{
  "synced": true,
  "canManage": true,
  "connections": [{
    "id": "connection-id",
    "platformId": "douyin-ecommerce",
    "accountLabel": "operator@example.com",
    "credentialSchemaId": "email-password-v1",
    "loginEmail": "operator@example.com",
    "status": "queued",
    "credentialVersion": 1,
    "version": 1,
    "shops": []
  }]
}
```

创建或替换凭据会递增凭据版本，并以 `connectionId + credentialVersion + taskType` 创建幂等验证任务。

## 受控 reveal

`POST /api/platform/v1/data-connections/:id/reveal` 不接收业务字段。成功响应包含抖音当前邮箱和密码，并设置 `Cache-Control: no-store, private`、`Pragma: no-cache` 和 `X-Content-Type-Options: nosniff`。同一连接 15 分钟最多成功五次，每次追加审计；前端 60 秒、失焦、关闭或 Esc 时清空明文。

## 错误

- `AUTH_SESSION_REQUIRED`、`DATA_CONNECTION_READ_DENIED`、`DATA_CONNECTION_WRITE_DENIED`
- `DATA_CONNECTION_FIELDS_INVALID`、`DATA_CONNECTION_EMAIL_INVALID`、`DATA_CONNECTION_PASSWORD_REQUIRED`
- `DATA_CONNECTION_VERSION_CONFLICT`、`DATA_CONNECTION_NOT_FOUND`
- `DATA_CONNECTION_FRESH_SESSION_REQUIRED`、`DATA_CONNECTION_REVEAL_RATE_LIMITED`
- `PLATFORM_CREDENTIAL_KEY_UNAVAILABLE`、`DATA_CONNECTION_STORAGE_UNAVAILABLE`

错误响应不回显请求字段、密文、平台原始响应或底层 SQL。

## 兼容、容量与回滚

- v1 客户端忽略未知字段；新增 provider 通过 registry 和 adapter 扩展，不改变抖音请求契约。
- `data_connections` 每个账号一行，只引用共享保险箱；secret 只在 `credential_vault_entries` 保存一份当前加密 JSON。每次替换生成保险箱审计、连接审计和一个任务，容量主要来自追加任务/审计而非凭据。
- 迁移 `0006_data_connections.sql` 为新增表，不改旧数据中心表。部署前运行 D1 migration；部署后先读接口再保存测试连接。
- 回滚停止新任务并隐藏写入口，保留表和密文；旧版本不会读取新增表。不得通过删除表回滚。

## 契约测试

覆盖匿名、部门越权、只读写入、字段白名单、邮箱归一化、普通响应无 secret、会话新鲜度、no-store、reveal 限流、版本冲突和加密能力缺失。
