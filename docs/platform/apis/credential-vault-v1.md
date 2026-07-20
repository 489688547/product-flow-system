# Credential Vault v1 API

## 状态与范围

- 状态：阶段 1 已实现，尚未部署生产。
- 调用方：数据中心经营连接器、内部系统保险箱。
- 不在阶段 1：本地采集器机器身份和 task grant；对应路径不得调用或显示为可用。
- 存储：D1 `credential_vault_entries`、`credential_vault_permissions`、`credential_vault_audit`。
- 加密：Cloudflare Secret `PLATFORM_CREDENTIAL_MASTER_KEY`，AES-256-GCM，随机 96 位 IV，当前 `keyVersion=1`；服务端兼容读取旧名 `DATA_CREDENTIAL_MASTER_KEY`，主名称存在时优先使用主名称。

普通响应不包含明文、密文、IV、密码长度、Token 前缀或可复用会话片段。OTP、短信验证码、二维码内容、滑块答案和当次人工验证结果不允许写入。

## 认证与权限

所有路径需要有效公司钉钉会话。

| 动作 | 总经办非只读 | 运营部非只读 | 其他部门 / readonly |
| --- | --- | --- | --- |
| 读取凭证脱敏元数据 | 允许 | 只允许 `scopeType=connector` | 拒绝 |
| 创建连接器凭证 | 允许 | 允许 | 拒绝 |
| 替换连接器凭证 | 允许 | 允许 | 拒绝 |
| 创建/替换内部保险箱凭证 | 允许 | 拒绝 | 拒绝 |
| 归档 | 允许 | 拒绝 | 拒绝 |
| reveal 明文 | 允许，且登录会话创建不超过 15 分钟 | 拒绝 | 拒绝 |

阶段 1 的 `credential_vault_permissions` 已建表但不开放条目授权 UI；细粒度权限在采集器阶段前增加，不能提前伪装为生效。

## 数据类型

`CredentialMetadata`：

```json
{
  "id": "7f7b9db7-cd71-44a1-85a5-d90482239723",
  "scopeType": "connector",
  "scopeId": "douyin-shop-1",
  "category": "douyin-ecommerce",
  "name": "抖音官旗登录",
  "schemaVersion": 1,
  "keyVersion": 1,
  "version": 2,
  "hasSecret": true,
  "createdAt": "2026-07-19T03:00:00.000Z",
  "createdBy": "平台管理员",
  "updatedAt": "2026-07-19T03:10:00.000Z",
  "updatedBy": "平台管理员",
  "archivedAt": ""
}
```

`scopeType` 仅允许 `connector` 或 `internal`。`secretPayload` 只接受连接器或保险箱 schema 白名单中的字符串字段；每项最多 4096 字符，总字段数最多 40。

## GET `/api/platform/v1/credential-vault`

查询参数：

- `scopeType=connector|internal`：可选；运营部即使省略也只能读取 `connector`。
- `scopeId`：阶段 1 不对外开放，由后续条目授权契约加入。

成功响应：

```json
{
  "synced": true,
  "entries": []
}
```

该路径不需要解密主密钥，因此 Secret 暂缺时仍可读取脱敏元数据；D1 缺失时返回 501。

## POST `/api/platform/v1/credential-vault`

请求：

```json
{
  "scopeType": "connector",
  "scopeId": "douyin-shop-1",
  "category": "douyin-ecommerce",
  "name": "抖音官旗登录",
  "schemaVersion": 1,
  "secretPayload": {
    "loginEmail": "person@example.invalid",
    "password": "example-only-not-a-real-password"
  }
}
```

服务端生成条目 ID、版本、操作者和时间。客户端提交 `id`、状态、密文、IV、密钥版本、操作者或时间会返回 400。成功响应为 `{ "synced": true, "entry": CredentialMetadata }`。

## PUT `/api/platform/v1/credential-vault/:id`

替换请求：

```json
{
  "expectedVersion": 2,
  "name": "抖音官旗登录",
  "schemaVersion": 1,
  "secretPayload": {
    "password": "example-replacement-only"
  }
}
```

省略 `secretPayload` 表示仅修改名称或 schema 版本，不触发解密。提交敏感值时生成新 IV 和密文。`expectedVersion` 与当前版本不同返回 HTTP 409，写入不执行。

归档请求：

```json
{
  "expectedVersion": 3,
  "action": "archive"
}
```

归档是逻辑删除；默认列表不返回归档条目，密文和审计继续保留。

## POST `/api/platform/v1/credential-vault/:id/reveal`

请求：

```json
{
  "purpose": "排查指定公司电脑的登录失效",
  "confirmation": "查看加密凭证"
}
```

成功响应：

```json
{
  "synced": true,
  "entry": {},
  "secretPayload": {
    "password": "example-only"
  },
  "revealedAt": "2026-07-19T03:20:00.000Z"
}
```

要求总经办非只读身份、登录会话创建不超过 15 分钟、非空用途和精确确认短语。响应设置：

```text
Cache-Control: no-store, private
Pragma: no-cache
X-Content-Type-Options: nosniff
```

前端只在内存中短暂显示，并在关闭、失焦或 60 秒超时后清空。该响应不能用于本地采集器；采集器必须等待独立 task-grant 协议。

## 错误

统一结构：

```json
{
  "synced": false,
  "message": "安全中文说明",
  "error": {
    "code": "CREDENTIAL_VERSION_CONFLICT",
    "message": "安全中文说明",
    "requestId": "request-id",
    "retryable": false
  }
}
```

| code | HTTP | 含义 | 可原请求重试 |
| --- | --- | --- | --- |
| `AUTH_SESSION_REQUIRED` | 401 | 没有有效公司会话 | 否 |
| `CREDENTIAL_REAUTH_REQUIRED` | 401 | reveal 需要重新登录 | 否 |
| `PERMISSION_WRITE_DENIED` | 403 | 不能创建、替换或归档 | 否 |
| `CREDENTIAL_REVEAL_DENIED` | 403 | 不能查看明文 | 否 |
| `CREDENTIAL_ENTRY_INVALID` | 400 | 字段、范围、确认或 payload 不合法 | 否 |
| `CREDENTIAL_ENTRY_NOT_FOUND` | 404 | 条目不存在或不可见 | 否 |
| `CREDENTIAL_VERSION_CONFLICT` | 409 | `expectedVersion` 已过期 | 否，需刷新 |
| `CREDENTIAL_RATE_LIMITED` | 429 | 同一条目 15 分钟内已成功 reveal 5 次 | 是，等待窗口结束 |
| `CREDENTIAL_STORAGE_UNAVAILABLE` | 501 | D1 绑定或表不可用 | 是，环境修复后 |
| `CREDENTIAL_KEY_UNAVAILABLE` | 503 | 主密钥缺失、格式错误或版本不可用 | 是，环境修复后 |
| `CREDENTIAL_DECRYPT_FAILED` | 500 | 密文认证失败 | 否，需安全处理 |

错误响应和日志不包含请求体、字段值、密文、IV 或 Web Crypto 底层异常。

## 审计与可观测性

每次创建、替换、归档和 reveal 写入追加式审计：条目 ID、动作、字段类别、操作者、用途、结果、request ID 和时间。审计不保存请求体或值。服务日志只记录路由、状态码、错误码、request ID 和耗时。

阶段 1 没有外部网络调用。reveal 按条目限制为 15 分钟内最多 5 次成功请求；后续 task grant 必须独立限流，并记录采集器身份和任务范围。

## 兼容、轮换与回滚

- API 为新增 `v1` 契约，不改变 `/api/data-center`、`/api/data-center/sales` 或 `/api/sales`。
- 修改请求使用乐观版本；未知字段一律拒绝，避免旧客户端把敏感信息写入元数据列。
- 密钥轮换必须新增 key version、重加密、验证、切换活动版本后再撤销旧密钥；不能直接覆盖 Secret。
- 回滚时停用路由并保留 D1 密文和审计；不得删除主密钥或物理删除条目。
