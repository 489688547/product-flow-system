# 错误结构与错误码

新共享 API 使用统一错误结构。现有接口按路由逐步迁移，迁移期间保持原调用方兼容。

```json
{
  "error": {
    "code": "VALIDATION_REQUIRED_FIELD",
    "message": "请补充必填信息。",
    "requestId": "req_20260717_example",
    "retryable": false
  }
}
```

## 字段

- `code`：稳定、可用于程序判断的错误码。
- `message`：可以安全展示给公司员工的中文说明，不包含密钥或原始外部响应。
- `requestId`：用于服务端日志定位，同一次请求保持一致。
- `retryable`：表示原请求在不修改输入时是否适合重试。

## 前缀

| 前缀 | 范围 | 示例 |
| --- | --- | --- |
| `AUTH_` | 未登录、会话失效、登录回调 | `AUTH_SESSION_REQUIRED` |
| `PERMISSION_` | 部门、角色或写权限不足 | `PERMISSION_WRITE_DENIED` |
| `VALIDATION_` | 参数、状态或业务规则校验 | `VALIDATION_REQUIRED_FIELD` |
| `STATE_` | 共享状态、版本或持久化 | `STATE_SAVE_FAILED` |
| `DINGTALK_` | 钉钉授权和接口调用 | `DINGTALK_PERMISSION_MISSING` |
| `KUAIMAI_` | 快麦配置、签名和拉取 | `KUAIMAI_SYNC_FAILED` |
| `INTEGRATION_` | 平台注册表、内部资料和存储 | `INTEGRATION_PROFILE_INVALID` |
| `DATA_` | 数据中心日期、元数据和存储 | `DATA_DATE_RANGE_INVALID` |
| `ENVIRONMENT_` | 环境能力、生成清单和生产就绪 | `ENVIRONMENT_READINESS_FAILED` |
| `PRODUCTION_` | 跨环境生产数据令牌、解锁、冲突、快照和回滚 | `PRODUCTION_WRITE_LOCKED` |
| `EXTERNAL_` | 测试环境外部副作用隔离 | `EXTERNAL_ACTION_DISABLED_IN_TEST` |
| `INTERNAL_` | 未预期服务端错误 | `INTERNAL_UNEXPECTED` |

内部平台资料 API 使用：

- `AUTH_SESSION_REQUIRED`：没有有效公司会话。
- `PERMISSION_WRITE_DENIED`：当前用户不能维护内部资料。
- `INTEGRATION_PROFILE_INVALID`：字段、URL、日期、平台 ID 或敏感内容校验失败。
- `INTEGRATION_STORAGE_UNAVAILABLE`：缺少 D1 绑定，公开资料仍可降级展示。
- `VALIDATION_METHOD_NOT_ALLOWED`：请求方法不受支持。

数据中心 API 使用：

- `AUTH_SESSION_REQUIRED`：没有有效公司会话。
- `PERMISSION_VIEW_DENIED`：当前部门无权查看数据中心。
- `PERMISSION_WRITE_DENIED`：当前身份不能维护数据中心元数据。
- `DATA_STATE_INVALID`：提交的元数据状态结构无效。
- `DATA_DATE_RANGE_INVALID`：日期缺失、倒置或跨度超过 370 天。
- `DATA_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。

生产数据与环境 API 使用：

- `PRODUCTION_TOKEN_REQUIRED` / `PRODUCTION_TOKEN_INVALID`：个人令牌缺失、无效、过期或已撤销。
- `PRODUCTION_ROLE_REQUIRED`：令牌对应的钉钉稳定身份不再是 active executive。
- `PRODUCTION_CAPABILITY_REQUIRED`：个人令牌没有所需的 read 或 write 能力。
- `PRODUCTION_WRITE_LOCKED`：写入未解锁、解锁已过期或已撤销，HTTP 423。
- `PRODUCTION_DATA_VERSION_CONFLICT`：基线版本落后于线上数据，HTTP 409。
- `PRODUCTION_SNAPSHOT_NOT_FOUND` / `PRODUCTION_ROLLBACK_NOT_AVAILABLE`：写前快照不存在或不可回滚。
- `ENVIRONMENT_READINESS_FAILED`：环境能力检查失败。
- `EXTERNAL_ACTION_DISABLED_IN_TEST`：本地测试试图执行真实外部平台写操作。

## HTTP 状态

- 400：请求或业务状态不合法。
- 401：没有有效公司会话。
- 403：已登录但没有操作权限。
- 404：资源不存在或对当前用户不可见。
- 409：版本、重复操作或状态冲突。
- 423：资源已锁定，生产写入需要重新解锁。
- 429：达到接口限流。
- 500：未预期服务端错误。
- 501：当前部署缺少必需的平台能力或数据库绑定。
- 502/503/504：外部依赖失败、不可用或超时。

## 日志与展示

服务端日志记录 request ID、路由、耗时、结果码和安全的依赖摘要。客户端优先展示 `message`，并在需要支持人员协助时展示 request ID。禁止把堆栈、Cookie、Token、手机号或完整外部响应返回给浏览器。
