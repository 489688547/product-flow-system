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
| `PRODUCT_CATALOG_` | 商品目录校验、权限和存储 | `PRODUCT_CATALOG_STORAGE_UNAVAILABLE` |
| `INTEGRATION_` | 平台注册表、内部资料和存储 | `INTEGRATION_PROFILE_INVALID` |
| `COLLABORATION_` | 跨 App 部门协同、状态、版本和存储 | `COLLABORATION_VERSION_CONFLICT` |
| `DATA_` | 数据中心日期、元数据和存储 | `DATA_DATE_RANGE_INVALID` |
| `USER_INSIGHTS_` | 用户洞察未预期处理错误 | `USER_INSIGHTS_UNEXPECTED` |
| `GOODS_FLOW_` | 货流事实、库存、盘点、账期和 CCC | `GOODS_FLOW_VERSION_CONFLICT` |
| `CREDENTIAL_` | 加密凭证、密钥、查看和采集器授权 | `CREDENTIAL_KEY_UNAVAILABLE` |
| `WEB_COLLECTION_` | 公司 Mac 网页采集设备、任务、状态、游标和通知 | `WEB_COLLECTION_TRANSITION_INVALID` |

## 快麦 ERP 本地归档

- `ERP_COLLECTION_RUNNER_TOKEN_REQUIRED` / `ERP_COLLECTION_RUNNER_TOKEN_INVALID`：采集器钥匙串令牌缺失、无效、停用或范围不符。
- `ERP_COLLECTION_RUNNER_REGISTER_DENIED`：非总经办用户尝试登记采集器。
- `ERP_COLLECTION_ARCHIVE_INVALID` / `ERP_COLLECTION_ARCHIVE_HASH_MISMATCH` / `ERP_COLLECTION_ARCHIVE_PATH_INVALID`：归档清单、哈希或相对路径不合法。
- `KUAIMAI_ARCHIVE_DISK_SPACE_LOW` / `KUAIMAI_ARCHIVE_COPY_HASH_MISMATCH` / `KUAIMAI_ARCHIVE_MANIFEST_INVALID`：本地磁盘、复制校验或 manifest 恢复失败；不得移动或删除来源文件。

## 公司网页数据采集

- `WEB_COLLECTION_RUNNER_TOKEN_REQUIRED` / `WEB_COLLECTION_RUNNER_TOKEN_INVALID`：公司 Mac 钥匙串令牌缺失、失效、停用或 scope 不符。
- `WEB_COLLECTION_RUNNER_REGISTER_DENIED` / `WEB_COLLECTION_VIEW_DENIED`：当前公司身份无权登记设备或查看采集状态。
- `WEB_COLLECTION_TRIGGER_DENIED`：当前公司身份为只读或不属于总经办、数据中心、运营，不能触发采集。
- `WEB_COLLECTION_TRIGGER_INVALID`：用户触发请求不是已登记的快麦订单商品明细与有效业务日期。
- `WEB_COLLECTION_JOB_INVALID`：provider、resource、业务日期、范围、幂等键无效，或任务试图携带 URL、选择器、脚本和凭据。
- `WEB_COLLECTION_JOB_NOT_FOUND` / `WEB_COLLECTION_JOB_OWNER_MISMATCH`：任务不存在或不属于当前领取设备。
- `WEB_COLLECTION_STATE_CONFLICT` / `WEB_COLLECTION_TRANSITION_INVALID`：任务已被更新、租约恢复或状态跳转不合法。
- `WEB_COLLECTION_RUN_INVALID` / `WEB_COLLECTION_NOTIFICATION_INVALID`：完成记录或通知去重信息不符合安全契约。
- `WEB_COLLECTION_STORAGE_UNAVAILABLE` / `WEB_COLLECTION_INTERNAL_ERROR`：D1 控制面不可用或发生未预期错误；响应不暴露浏览器和文件内容。
| `DATA_CONNECTION_` | 实例级数据连接错误 | `DATA_CONNECTION_UNEXPECTED` |
| `BROWSER_AGENT_` | 公司 Mac 采集任务错误 | `BROWSER_AGENT_TASK_FAILED` |
| `ENVIRONMENT_` | 环境能力、生成清单和生产就绪 | `ENVIRONMENT_READINESS_FAILED` |
| `PRODUCTION_` | 跨环境生产数据令牌、解锁、冲突、快照和回滚 | `PRODUCTION_WRITE_LOCKED` |
| `LOCAL_ONLINE_` | 本地线上账号配置、数据库与运行时 | `LOCAL_ONLINE_TOKEN_REQUIRED` |
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
- `PLATFORM_CREDENTIAL_REVEAL_INVALID`：灵算凭据查看用途、确认语或请求字段不合法，HTTP 400。
- `PLATFORM_CREDENTIAL_REVEAL_UNAVAILABLE`：没有当前启用的灵算保险箱版本，或请求试图查看环境变量/其他平台，HTTP 404。
- `PLATFORM_CREDENTIAL_REVEAL_RATE_LIMITED`：同一连接 15 分钟内已经成功查看 5 次，HTTP 429。
- `CREDENTIAL_REVEAL_DENIED`：当前身份不是最高权限账号，HTTP 403。
- `CREDENTIAL_REAUTH_REQUIRED`：查看明文需要 15 分钟内重新登录，HTTP 401。

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
- `DATA_SERVICE_DATE_RANGE_INVALID`：销售数据服务只收到一个日期，或日期非法、倒置、超出服务上限。
- `DATA_SERVICE_QUERY_FAILED`：销售数据服务读取或聚合 D1 失败，可重试。
- `DATA_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。
- `DATA_STORAGE_TEMPORARILY_UNAVAILABLE`：D1 远程读取链路暂时中断；不暴露 Miniflare 或 D1 底层错误，GET 客户端可自动重试一次。
- `SALES_REPAIR_DATE_INVALID`：自动补拉日期不是合法自然日。
- `SALES_REPAIR_SCHEDULE_FAILED`：修复任务未能安全建立，可重试；原销售事实未修改。
- `SALES_REPAIR_PROVIDER_NOT_CONFIGURED` / `SALES_REPAIR_PROVIDER_FAILED`：快麦配置缺失或调用失败，原销售事实保留。
- `SALES_REPAIR_PAGINATION_INCOMPLETE`：快麦分页未到 `hasNext=false`，禁止写入。
- `SALES_REPAIR_RICH_FACTS_PROTECTED`：当天存在退款明细，API 不覆盖，需重新导入官方文件。
- `SALES_REPAIR_STILL_INCOMPLETE` / `SALES_REPAIR_ROWS_INVALID`：补拉后仍低于基准或行数据不满足安全写入条件，原事实保留。
- `DATA_CONNECTOR_INVALID`：连接器 ID、字段、URL、保险箱类型或敏感字段边界不合法。
- `DATA_CONNECTOR_NOT_FOUND`：连接实例不存在、已归档或对当前身份不可见。
- `DATA_CONNECTOR_VERSION_CONFLICT`：连接实例或保险箱条目版本已经更新，HTTP 409。

共享数据口径 API 使用：

- `DATA_STANDARD_INVALID`：请求字段、日期、公式结构或不可变 `metricCode` 不合法。
- `DATA_STANDARD_FIELD_UNKNOWN`：公式或来源引用未登记事实字段。
- `DATA_STANDARD_CYCLE`：指标依赖形成循环。
- `DATA_STANDARD_UNIT_MISMATCH`：声明单位与公式推导单位不一致。
- `DATA_STANDARD_VERSION_CONFLICT`：提交版本落后或 `metricCode` 已存在，HTTP 409。
- `DATA_STANDARD_EFFECTIVE_DATE_CONFLICT`：新版本生效日期未严格递增或同日重复，HTTP 409。
- `DATA_STANDARD_DEPENDENCY_ARCHIVED`：新版本依赖已归档口径。
- `DATA_STANDARD_QUERY_RANGE_INVALID`：指标数量、依赖深度、自然日期或计算范围超过契约限制。
- `DATA_STANDARD_CALCULATION_FAILED`：后台口径计算失败；旧的当前结果继续有效。
- `DATA_STANDARD_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。

数据口径的稳定错误、责任部门授权、版本快照和重试语义见 `docs/platform/apis/data-standards-v1.md`。

加密凭证 API 使用：

- `CREDENTIAL_ENTRY_INVALID`：凭证类型、字段 schema、范围或敏感 payload 不合法。
- `CREDENTIAL_ENTRY_NOT_FOUND`：条目不存在或对当前身份不可见。
- `CREDENTIAL_VERSION_CONFLICT`：提交的凭证版本已经过期，HTTP 409，刷新后重新操作。
- `CREDENTIAL_RATE_LIMITED`：同一条目短时间明文查看次数过多，HTTP 429。
- `CREDENTIAL_ENCRYPT_FAILED`：服务端未能完成加密；响应不包含输入值或底层异常。
- `CREDENTIAL_KEY_UNAVAILABLE`：加密主密钥或对应密钥版本未配置，不能保存或取用凭证。
- `CREDENTIAL_DECRYPT_FAILED`：密文校验或解密失败；响应不包含密文、字段值或底层异常。
- `CREDENTIAL_REAUTH_REQUIRED`：查看或复制明文需要近期重新认证。
- `CREDENTIAL_REVEAL_DENIED`：当前身份没有该条目的明文查看权限。
- `CREDENTIAL_TASK_GRANT_INVALID`：采集器、任务、字段范围或授权状态不合法。
- `CREDENTIAL_TASK_GRANT_EXPIRED`：短时授权已过期、已消费或已吊销。
- `CREDENTIAL_STORAGE_UNAVAILABLE`：D1 绑定或凭证表不可用。

用户洞察共享 API 使用：

- `AUTH_RUNNER_TOKEN_REQUIRED` / `AUTH_RUNNER_TOKEN_INVALID`：采集设备令牌缺失、无效或已停用。
- `PERMISSION_RULE_WRITE_DENIED`：当前部门不能修改目标 App 的规则。
- `PERMISSION_CATEGORY_UNCONFIRMED`：平台类目尚未人工确认，采集批次被拒绝。
- `PERMISSION_RUNNER_SCOPE_DENIED`：批次平台或店铺超出设备授权范围。
- `VALIDATION_RULE_INVALID` / `VALIDATION_INGEST_INVALID`：规则或采集批次字段不完整。
- `VALIDATION_COMPETITOR_TRANSITION`：候选确认、驳回或停用缺少原因或状态无效。
- `CATEGORY_CONFIRMATION_REQUIRED`：手动重试前尚未确认当前平台类目。
- `VERSION_CONFLICT`：规则、类目或竞品版本已变化，HTTP 409。
- `STORAGE_D1_UNAVAILABLE`：当前部署缺少用户洞察所需的 D1 绑定或表。

货流平台 API 使用：

- `GOODS_FLOW_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 或货流表。
- `GOODS_FLOW_REQUEST_INVALID`：请求字段、日期、数值或业务幂等键不合法。
- `GOODS_FLOW_IDEMPOTENCY_KEY_REQUIRED`：写入请求缺少 `Idempotency-Key`，HTTP 400。
- `GOODS_FLOW_ACTION_DENIED`：当前部门不能执行盘点、账期、重算或冻结动作。
- `GOODS_FLOW_WRITE_DENIED`：只读账号尝试执行货流写入，HTTP 403。
- `GOODS_FLOW_VERSION_CONFLICT`：盘点、账期或 CCC 的读取版本已过期，HTTP 409。
- `GOODS_FLOW_IDEMPOTENCY_CONFLICT`：同一来源引用或业务幂等键指向不同内容，HTTP 409。
- `GOODS_FLOW_SKU_MAPPING_REQUIRED`：商品或库存单位编码不能确定性映射，记录进入异常队列。
- `GOODS_FLOW_COMPONENT_MAPPING_REQUIRED`：组合商品的库存组成、比例或叶子库存单位不完整，本条销量不计入库存消耗。
- `GOODS_FLOW_PURCHASE_LINK_REQUIRED`：付款没有可验证的采购关联，不计入货流金额。
- `GOODS_FLOW_TERM_OVERLAP`：同一平台账期生效区间重叠，HTTP 409。
- `GOODS_FLOW_METRIC_INCOMPLETE`：计算来源覆盖不足，指标不可冻结。
- `GOODS_FLOW_SOURCE_PARTIAL`：导入部分成功，失败行进入异常队列，HTTP 207。
- `GOODS_FLOW_MONTH_INVALID`：CCC 重算月份不是 `YYYY-MM`，HTTP 400。
- `GOODS_FLOW_STOCKTAKE_INVALID`：盘点任务、仓库、日期或明细不完整，HTTP 400。
- `GOODS_FLOW_STOCKTAKE_NOT_FOUND`：盘点任务不存在，HTTP 404。
- `GOODS_FLOW_STOCKTAKE_TRANSITION_INVALID`：盘点操作不在允许状态机内，HTTP 400。
- `GOODS_FLOW_STOCKTAKE_STATE_CONFLICT`：当前盘点状态不能执行请求动作，HTTP 409。

公司统一 AI API 使用：

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
- `AI_FEATURE_NOT_REGISTERED`：业务 App 或功能没有进入服务端注册表；在 Provider 调用前失败，不能由客户端临时补充归属。
- `AI_USAGE_RANGE_INVALID`：AI 用量查询缺少日期、日期倒序或超过 366 天。
- `AI_USAGE_ACCESS_DENIED`：当前身份没有数据中心读取权限，HTTP 403。
- `AI_USAGE_QUERY_FAILED`：AI 用量聚合读取失败；可按 `retryable` 手动重试，响应不包含 SQL 或 Provider 原始错误。

商品主数据 API 使用：

- `PRODUCT_CATALOG_STORAGE_UNAVAILABLE`：缺少 `PRODUCT_FLOW_DB` 或商品目录表不可用。
- `PRODUCT_CATALOG_IMPORT_INVALID` / `PRODUCT_CATALOG_IMPORT_EMPTY`：导入内容缺少有效商品身份或为空。
- `PRODUCT_CATALOG_WRITE_DENIED`：当前身份不是总经办或运营部维护人，或账号为只读。
- `KUAIMAI_CONFIG_MISSING`：部署缺少快麦商品读取配置。
- `KUAIMAI_PRODUCT_SYNC_INCOMPLETE`：分页保护触发，本批没有写入。
- `KUAIMAI_PRODUCT_SYNC_CURSOR_STALE`：续传游标存在但共享商品目录为空；客户端应从游标 0 重新刷新商品列表。
- `KUAIMAI_PRODUCT_SYNC_FAILED`：快麦拒绝、超时或返回失败，可按 `retryable` 判断重试。
生产数据与环境 API 使用：

- `PRODUCTION_TOKEN_REQUIRED` / `PRODUCTION_TOKEN_INVALID`：个人令牌缺失、无效、过期或已撤销。
- `PRODUCTION_ROLE_REQUIRED`：令牌对应的钉钉稳定身份不再是 active executive。
- `PRODUCTION_CAPABILITY_REQUIRED`：个人令牌没有所需的 read 或 write 能力。
- `PRODUCTION_WRITE_LOCKED`：写入未解锁、解锁已过期或已撤销，HTTP 423。
- `PRODUCTION_DATA_VERSION_CONFLICT`：基线版本落后于线上数据，HTTP 409。
- `PRODUCTION_SNAPSHOT_NOT_FOUND` / `PRODUCTION_ROLLBACK_NOT_AVAILABLE`：写前快照不存在或不可回滚。
- `ENVIRONMENT_READINESS_FAILED`：环境能力检查失败。
- `LOCAL_ONLINE_TOKEN_REQUIRED`：本地线上账号模式缺少服务端个人令牌。
- `LOCAL_ONLINE_DATABASE_REQUIRED`：本地线上账号模式缺少生产 D1 绑定。
- `LOCAL_ONLINE_AUTH_FAILED`：本地线上账号验证出现未预期错误。
- `LOCAL_ONLINE_RUNTIME_REQUIRED`：使用了旧的不完整 Node 预览接口，应通过标准 `npm start` 运行 Pages Functions。

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
