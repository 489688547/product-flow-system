# 平台连接 API 契约

## 基本信息

- 负责人：总经办平台管理员
- 调用方：数据接入平台连接页、AI 大模型设置、环境就绪检查、钉钉、快麦和灵算服务端适配器
- 版本：v1
- 方法与路径：`GET|PUT|DELETE /api/platform/v1/platform-connections`；`POST /api/platform/v1/platform-connections/:platformId/reveal`

## 用途与边界

接口维护公司级外部平台连接，返回脱敏元数据，并在候选凭据通过只读验证后原子替换当前连接。普通接口不返回明文、不保存验证码和浏览器会话、不执行外部写操作。灵算专用 reveal 路由是唯一例外，只临时返回当前启用的保险箱版本；环境变量、已停用版本和其他平台均不可查看。

## 认证与权限

- GET：有效公司员工会话。
- PUT、DELETE：有效会话、非只读，且当前身份为总经办最高权限账号（`role=executive`）。
- POST reveal：同样要求 `role=executive`，且会话创建时间不超过 15 分钟；总经办普通成员不能查看。
- 适配器不经 HTTP 读取凭据，只调用服务端共享解析器。

## 请求

### PUT

```json
{
  "platformId": "dingtalk",
  "expectedVersion": 1,
  "fields": {
    "appKey": "new-value",
    "appSecret": "new-value"
  }
}
```

`fields` 只允许平台注册字段；空字符串忽略并保持原值。首次保存必须在合并后具备全部必填字段。

### DELETE

```json
{ "platformId": "dingtalk", "expectedVersion": 2 }
```

DELETE 只停用当前连接，密文和审计继续保留。

### POST reveal

```json
{
  "purpose": "核对公司 AI 连接配置",
  "confirmation": "查看灵算凭据"
}
```

当前只接受 `platformId=lingsuan-ai-gateway`。`purpose` 必填且不超过 200 字；确认语必须完全一致。每个连接 15 分钟最多成功查看 5 次；额度判断与成功审计必须通过同一条条件写入原子完成，并发请求不得突破上限。

## 响应

```json
{
  "synced": true,
  "canManage": true,
  "connections": [
    {
      "platformId": "dingtalk",
      "status": "connected",
      "enabled": true,
      "configuredFields": ["appKey", "appSecret"],
      "version": 2,
      "verifiedAt": "2026-07-19T08:00:00.000Z",
      "verifiedBy": "平台管理员",
      "source": "vault"
    }
  ]
}
```

响应禁止包含 `fields` 值、密文、IV、主密钥、外部 access token 和完整平台响应。

reveal 成功响应是上述规则的受控例外：

```json
{
  "synced": true,
  "platformId": "lingsuan-ai-gateway",
  "fields": { "apiKey": "temporary-value", "actorAuthorization": "temporary-value" },
  "revealedAt": "2026-07-22T10:00:00.000Z",
  "expiresAt": "2026-07-22T10:05:00.000Z"
}
```

成功与错误响应都固定使用 `Cache-Control: private, no-store` 和 `Pragma: no-cache`。响应只允许包含当前平台定义中登记的字段，旧密文中的遗留字段不得返回。浏览器只能保存在 React 内存中，并在 5 分钟、设置收起、页面隐藏、保存、停用或卸载时清除；清除事件还必须中止或作废进行中的请求，晚到响应不得重新写入明文状态。

`status` 取值：`connected` 已连接、`needs_attention` 已保存但密钥不可用或密文无法解密、`incomplete` 环境变量不完整、`not_connected` 未连接、`coming_soon` 暂未开放。`needs_attention` 必须在页面提示管理员重新保存连接，不能作为环境就绪依据。

## 错误码

- `PLATFORM_CONNECTION_INVALID`：平台、字段或必填配置不合法，400。
- `PLATFORM_CONNECTION_VERSION_CONFLICT`：版本落后，409。
- `PLATFORM_CONNECTION_VALIDATION_FAILED`：只读连接测试失败，422/502/504。
- `PLATFORM_CREDENTIAL_KEY_UNAVAILABLE`：主密钥缺失或非法，503。
- `PLATFORM_CONNECTION_STORAGE_UNAVAILABLE`：D1 不可用，501。
- `PERMISSION_WRITE_DENIED`：当前身份不能修改，403。
- `CREDENTIAL_REVEAL_DENIED`：不是最高权限账号，403。
- `CREDENTIAL_REAUTH_REQUIRED`：会话超过 15 分钟，需要重新登录，401。
- `PLATFORM_CREDENTIAL_REVEAL_INVALID`：用途、确认语或字段不合法，400。
- `PLATFORM_CREDENTIAL_REVEAL_UNAVAILABLE`：不是灵算、没有启用的保险箱版本或仅有环境变量回退，404。
- `PLATFORM_CREDENTIAL_REVEAL_RATE_LIMITED`：15 分钟成功查看已达到 5 次，429。

## 幂等与分页

GET 无分页。PUT 和 DELETE 使用 `expectedVersion` 防止覆盖；连接测试可能重复申请临时 token，但不产生业务写副作用。

## 超时、重试与限流

- 外部验证超时为 8 秒。
- 服务端不自动重试凭据验证或 reveal，避免放大限流；用户可在页面重试。
- 失败响应通过 `retryable` 标记网络、限流和临时平台错误。

## 可观测性

每次请求生成 `requestId`。审计记录平台、动作、字段名、操作者、用途、结果和 requestId；reveal 的字段名固定记为空数组，日志和审计禁止记录请求体、凭据、完整 URL 查询参数和平台原始响应。

## 兼容与废弃

旧环境变量保留并作为回退，但永不允许 reveal。迁移 `0010_platform_credential_reveal.sql` 只为审计增加 `purpose` 列；应用回滚时保留该列，旧代码会忽略它。

## 契约测试

- GET 匿名 401、员工脱敏读取、总经办最高权限账号 `canManage=true`。
- PUT 普通员工 403、未知字段 400、首次缺少必填 400。
- 验证失败不改变版本和密文；验证成功递增版本。
- DELETE 冲突 409、成功后适配器回退环境变量。
- 所有响应和审计不包含测试凭据。
- reveal 覆盖最高权限、总经办普通成员、旧会话、确认语、用途、环境回退、成功与错误 no-store、并发 5 次限流、字段白名单和无秘密审计。
- UI 暂态测试覆盖进行中请求在折叠、页面隐藏、保存、停用或卸载后的中止/失效，证明晚到结果不能重新写入状态。
