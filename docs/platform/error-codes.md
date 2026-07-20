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
| `PLATFORM_` | 公司级平台连接、验证、版本和安全存储 | `PLATFORM_CONNECTION_VALIDATION_FAILED` |
| `INTEGRATION_` | 平台注册表、内部资料和存储 | `INTEGRATION_PROFILE_INVALID` |
| `COLLABORATION_` | 跨 App 部门协同、状态、版本和存储 | `COLLABORATION_VERSION_CONFLICT` |
| `DATA_` | 数据中心日期、元数据和存储 | `DATA_DATE_RANGE_INVALID` |
| `GOODS_FLOW_` | 货流事实、库存、盘点、账期和 CCC | `GOODS_FLOW_VERSION_CONFLICT` |
| `ENVIRONMENT_` | 环境能力、生成清单和生产就绪 | `ENVIRONMENT_READINESS_FAILED` |
| `PRODUCTION_` | 跨环境生产数据令牌、解锁、冲突、快照和回滚 | `PRODUCTION_WRITE_LOCKED` |
| `EXTERNAL_` | 测试环境外部副作用隔离 | `EXTERNAL_ACTION_DISABLED_IN_TEST` |
| `AI_` | 公司 AI 总助、数据权限、Provider 和流式响应 | `AI_PROVIDER_RATE_LIMITED` |
| `INTERNAL_` | 未预期服务端错误 | `INTERNAL_UNEXPECTED` |

内部平台资料 API 使用：

- `AUTH_SESSION_REQUIRED`：没有有效公司会话。
- `PERMISSION_WRITE_DENIED`：当前用户不能维护内部资料。
- `INTEGRATION_PROFILE_INVALID`：字段、URL、日期、平台 ID 或敏感内容校验失败。
- `INTEGRATION_STORAGE_UNAVAILABLE`：缺少 D1 绑定，公开资料仍可降级展示。
- `VALIDATION_METHOD_NOT_ALLOWED`：请求方法不受支持。

平台连接 API 使用：

- `PLATFORM_CONNECTION_INVALID`：平台、字段或请求结构不符合该平台契约。
- `PLATFORM_CONNECTION_NOT_FOUND`：要停用的保险箱连接不存在。
- `PLATFORM_CONNECTION_VERSION_CONFLICT`：读取版本已经过期，候选连接未切换，HTTP 409。
- `PLATFORM_CONNECTION_VALIDATION_FAILED`：候选配置未通过只读平台验证，原连接不受影响，HTTP 422。
- `PLATFORM_CREDENTIAL_KEY_UNAVAILABLE`：当前部署缺少有效的加密主密钥。
- `PLATFORM_CONNECTION_STORAGE_UNAVAILABLE`：当前部署缺少 D1 绑定或保险箱表不可用。

部门协同 API 使用：

- `PERMISSION_READ_DENIED`：当前身份不能读取请求范围。
- `PERMISSION_WRITE_DENIED`：当前身份不能执行写操作或状态动作。
- `COLLABORATION_ITEM_INVALID`：字段、身份、来源、时间或证据不符合契约。
- `COLLABORATION_TRANSITION_INVALID`：当前状态或角色不能执行请求动作。
- `COLLABORATION_ITEM_NOT_FOUND`：事项不存在或对当前用户不可见。
- `COLLABORATION_VERSION_CONFLICT`：读取版本已经过期，写入未执行。
- `COLLABORATION_IDEMPOTENCY_CONFLICT`：同一幂等键与现有业务来源不一致。
- `COLLABORATION_STORAGE_UNAVAILABLE`：缺少 D1 绑定或协同表写入不可用。
- `DINGTALK_TODO_SYNC_FAILED`：协同状态已保存，但钉钉待办同步失败。

数据中心 API 使用：

- `AUTH_SESSION_REQUIRED`：没有有效公司会话。
- `PERMISSION_VIEW_DENIED`：当前部门无权查看数据中心。
- `PERMISSION_WRITE_DENIED`：当前身份不能维护数据中心元数据。
- `DATA_STATE_INVALID`：提交的元数据状态结构无效。
- `DATA_DATE_RANGE_INVALID`：日期缺失、倒置或跨度超过 370 天。
- `DATA_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。

货流平台 API 使用：

- `GOODS_FLOW_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 或货流表。
- `GOODS_FLOW_REQUEST_INVALID`：请求字段、日期、数值或业务幂等键不合法。
- `GOODS_FLOW_ACTION_DENIED`：当前部门不能执行盘点、账期、重算或冻结动作。
- `GOODS_FLOW_VERSION_CONFLICT`：盘点、账期或 CCC 的读取版本已过期，HTTP 409。
- `GOODS_FLOW_IDEMPOTENCY_CONFLICT`：同一来源引用或业务幂等键指向不同内容，HTTP 409。
- `GOODS_FLOW_SKU_MAPPING_REQUIRED`：商品、SKU 或 69 码不能确定性映射，记录进入异常队列。
- `GOODS_FLOW_PURCHASE_LINK_REQUIRED`：付款没有可验证的采购关联，不计入货流金额。
- `GOODS_FLOW_TERM_OVERLAP`：同一平台账期生效区间重叠，HTTP 409。
- `GOODS_FLOW_METRIC_INCOMPLETE`：计算来源覆盖不足，指标不可冻结。
- `GOODS_FLOW_SOURCE_PARTIAL`：导入部分成功，失败行进入异常队列，HTTP 207。

公司 AI 总助 API 使用：

- `AI_DISABLED`：公司 AI 总助功能开关关闭。
- `AI_SESSION_REQUIRED`：没有有效公司会话。
- `AI_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。
- `AI_PROVIDER_NOT_REGISTERED`：Provider 不在服务端白名单。
- `AI_PROVIDER_SECRET_MISSING`：新的服务端 Secret 尚未配置。
- `AI_PROVIDER_MANAGE_DENIED`：当前身份不能修改 Provider 元数据。
- `AI_PROVIDER_TEST_DENIED`：当前身份不能执行合成连接测试。
- `AI_PROVIDER_AUTH_FAILED`：Provider 拒绝服务端凭据。
- `AI_PROVIDER_RATE_LIMITED`：Provider 返回 429，适合稍后手动重试。
- `AI_PROVIDER_TIMEOUT`：Provider 在 45 秒内未响应。
- `AI_PROVIDER_UNAVAILABLE`：Provider 网络或 5xx 故障。
- `AI_PROVIDER_STREAM_FAILED`：流式响应失败或中断；已生成内容可保留但不得当作完整回答。
- `AI_PROVIDER_SKILLS_UNSUPPORTED`：Provider 未完成纯合成 Function Calling 测试；状态标记原生能力不可用，总助改用受控服务端只读 Skills，未命中 Skill 的问题才使用摘要模式。
- `AI_PROVIDER_INVALID_TOOL_ARGUMENTS`：Provider 在合成能力测试中返回无效工具参数。
- `AI_PROVIDER_NOT_READY`：Provider 未启用或服务端 Secret 未就绪。
- `AI_MESSAGES_INVALID`：消息数量、角色、长度或顺序不符合契约。
- `AI_FINANCE_TRANSFER_BLOCKED`：消息包含具体财务值，当前 Provider 未通过外发审核。
- `AI_REQUEST_IN_FLIGHT`：当前用户已有一个回答正在生成，HTTP 409。
- `AI_CONTEXT_EMPTY`：当前身份没有可用且可外发的公司数据上下文。
- `AI_SKILL_UNKNOWN` / `AI_SKILL_DENIED`：Provider 请求了未登记或当前会话无权使用的只读 Skill。
- `AI_SKILL_ARGUMENTS_INVALID`：Skill 参数不符合服务端固定 Schema。
- `AI_SKILL_TIMEOUT`：单个只读 Skill 查询超过 8 秒。
- `AI_SKILL_DUPLICATE`：同一回答内出现相同 Skill 和参数，服务端拒绝重复读取。
- `AI_SKILL_CALL_LIMIT` / `AI_SKILL_LOOP_LIMIT`：单次回答超过六次调用或两轮工具循环，服务端停止生成。
- `AI_STREAM_CANCELLED`：客户端主动停止回答，租约已释放且审计标记未完成。
- `AI_LOCAL_PREVIEW_READ_ONLY`：本地 Node 预览只展示脱敏状态，不调用 Provider 或修改配置。
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
- 422：请求结构正确，但候选平台连接未通过验证。
- 423：资源已锁定，生产写入需要重新解锁。
- 429：达到接口限流。
- 500：未预期服务端错误。
- 501：当前部署缺少必需的平台能力或数据库绑定。
- 502/503/504：外部依赖失败、不可用或超时。

## 日志与展示

服务端日志记录 request ID、路由、耗时、结果码和安全的依赖摘要。客户端优先展示 `message`，并在需要支持人员协助时展示 request ID。禁止把堆栈、Cookie、Token、手机号或完整外部响应返回给浏览器。
