# 数据连接 API v1

## 用途与消费者

`/api/platform/v1/data-connections` 仅用于读取和清理已退役的抖音实例级 provider 连接。数据中心 UI 不再调用创建、替换或 reveal；店铺经营改为平台原始文件方向。

## 认证与授权

- GET：有效公司会话，且属于总经办或运营部。
- POST、PUT：已退役，统一返回 `410 DATA_CONNECTION_LOGIN_RETIRED`。
- DELETE：仅 `executive`，且会话创建不超过 15 分钟，必须提供当前版本和精确确认文案。
- reveal：仅为清理前兼容保留，不再有 UI 消费者；凭证销毁后不可读取。
- 所有权限在服务端校验；页面隐藏不是权限边界。

## 连接模型

连接表保存 `platform_id`、通用 `account_label`、版本化 `credential_schema_id`、`credential_entry_id`、凭据版本、业务状态、乐观锁版本和审计。AES-GCM 密文继续由现有 `credential_vault_entries` 唯一保存。抖音 adapter 将 `loginEmail` 映射为 `account_label`，将 `{ password }` 作为 `email-password-v1` 加密 JSON 写入共享保险箱。

普通响应为了首期 UI 同时返回 `accountLabel` 和抖音兼容字段 `loginEmail`；从不返回 secret、ciphertext、IV 或 grant。

## 请求

`GET /api/platform/v1/data-connections` 无请求体。

销毁旧连接：

```json
{ "id": "connection-id", "expectedVersion": 1, "confirmation": "销毁店铺凭证" }
```

成功后共享保险箱密文与 IV 清空，旧连接脱敏为“已销毁”并停用，店铺识别记录删除，活动任务以 `PROVIDER_RETIRED` 结束，一次性 grant 删除。无秘密审计和历史经营事实保留。

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

普通响应不返回 secret、ciphertext、IV 或 grant；已销毁连接不返回原登录邮箱。

## 受控 reveal

`POST /api/platform/v1/data-connections/:id/reveal` 不接收业务字段。成功响应包含抖音当前邮箱和密码，并设置 `Cache-Control: no-store, private`、`Pragma: no-cache` 和 `X-Content-Type-Options: nosniff`。同一连接 15 分钟最多成功五次，每次追加审计；前端 60 秒、失焦、关闭或 Esc 时清空明文。

## 错误

- `AUTH_SESSION_REQUIRED`、`DATA_CONNECTION_READ_DENIED`、`DATA_CONNECTION_DESTROY_DENIED`
- `DATA_CONNECTION_LOGIN_RETIRED`、`DATA_CONNECTION_DESTROY_CONFIRMATION_REQUIRED`
- `DATA_CONNECTION_VERSION_CONFLICT`、`DATA_CONNECTION_NOT_FOUND`
- `DATA_CONNECTION_FRESH_SESSION_REQUIRED`、`DATA_CONNECTION_REVEAL_RATE_LIMITED`
- `PLATFORM_CREDENTIAL_KEY_UNAVAILABLE`、`DATA_CONNECTION_STORAGE_UNAVAILABLE`

错误响应不回显请求字段、密文、平台原始响应或底层 SQL。

## 兼容、容量与回滚

- v1 客户端忽略未知字段；旧客户端尝试保存会收到 410，不能再创建店铺网页登录任务。
- 销毁不可逆；代码回滚不能恢复密文，若未来重新启用必须重新评审并重新取得授权。
- 现有表继续保留无秘密审计与兼容读取，不通过删表掩盖历史。

## 契约测试

覆盖匿名、部门越权、旧写入 410、销毁权限、精确确认、会话新鲜度、密文/IV 清空、任务终止、普通响应无 secret 和版本冲突。
