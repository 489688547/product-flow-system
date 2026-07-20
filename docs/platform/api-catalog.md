# API 目录

当前接口首先服务本应用，统一登记为内部 API。出现多个真实系统调用方后，稳定契约迁移到 `/api/platform/v1/`。

## 共享状态

| 路径 | 用途 | 主要约束 |
| --- | --- | --- |
| `/api/state` | 读取和保存产品全周期共享状态 | 需要公司会话；写操作拒绝只读身份；大状态按 D1 行限制分片 |
| `/api/platform` | 读取和保存公司战略执行实体 | 仅总经办范围；实体分记录存储；写操作需要非只读身份 |
| `/api/brand-content` | 读取品牌内容状态并应用单个领域动作 | 全员登录后可读；品牌、运营和总经办按动作权限写入；独立 D1 状态表；乐观版本冲突返回 409 |
| `/api/supply-chain` | 读取和保存供应链独立状态，并承接已清洗的钉钉供应链文件快照 | 需要公司会话；按部门裁剪金额和成本字段；写入仅允许所属部门集合；文件快照只允许供应商、库存盘点、成品库存、原辅料库存和异常库存集合 |
| `/api/supply-chain/approvals/sync` | 分批读取钉钉采购和付款审批并写入供应链状态 | 仅总经办、供应链、采购和财务；每次只读取一个流程的一页，客户端先完成采购再完成付款 |
| `/api/platform/v1/goods-flow/dashboard` | 读取 CCC、断货率、库存周转、库存资金和例外投影 | 公司会话；金额按部门裁剪；响应包含来源时间、覆盖率和计算版本 |
| `/api/platform/v1/goods-flow/inventory` | 按日期、SKU 和仓库读取账面、实盘与校准库存 | 公司会话；支持截止日期过滤；未盘点和过期来源必须显式标记 |
| `/api/platform/v1/goods-flow/imports` | 幂等导入 ERP 库存、钉钉审批、销售和兼容盘点事实 | 数据中心、供应链、财务或总经办；部分成功返回 207；浏览器不直连 ERP |
| `/api/platform/v1/goods-flow/stocktakes` | 查询或创建月度盘点任务 | 仓库维护实存；供应链确认差异；金额调整由财务确认 |
| `/api/platform/v1/goods-flow/stocktakes/:id/transitions` | 按乐观版本推进盘点确认或追加更正 | 仓库录数、供应链确认差异、财务确认金额；写入需要 `Idempotency-Key` |
| `/api/platform/v1/goods-flow/receivable-terms` | 查询或版本化维护平台固定账期 | 全部货流角色可读；仅财务和总经办可写；区间不可重叠 |
| `/api/platform/v1/goods-flow/ccc` | 查询月度 CCC 版本 | 公司会话；缺少库存、成本、账期或应付日期时返回覆盖不足 |
| `/api/platform/v1/goods-flow/ccc/:month/recalculate` | 生成月度 CCC 新计算版本 | 财务、供应链或总经办；同一幂等键返回同一版本 |
| `/api/platform/v1/goods-flow/ccc/:month/freeze` | 冻结覆盖完整的月度 CCC 版本 | 仅财务或总经办；覆盖不足或版本过期返回 409 |
| `/api/sales` | 查询产品销售聚合 | 需要公司会话；时间和平台口径见产品数据定义 |
| `/api/data-center` | 读取和保存数据中心安全元数据 | 指定部门可读；仅总经办和运营部可写；拒绝只读身份；D1 分实体表存储 |
| `/api/data-center/sales` | 按日期读取数据中心销售事实 | 需要公司会话；最长 370 天；订单创建时间；上海时区；排除“其它” |
| `/api/ecommerce-operations` | 读取可见的店铺经营状态 | 需要公司会话和授权部门；D1 分实体存储 |
| `/api/ecommerce-operations/actions` | 提交重点产品、方案、执行、协同和复盘动作 | 服务端校验角色、状态与版本；拒绝只读身份 |
| `/api/ecommerce-operations/ai-review` | 对当前方案给出优化建议 | 服务端字段白名单；AI 不改变审批；无密钥时明确降级为规则检查 |
| `/api/ecommerce-operations/evidence` | 按员工和月份读取已验收经营证据 | 员工只读本人；主管和人事按职责读取；不返回绩效分 |
| `/api/performance-management` | 按角色读取绩效状态 | 员工只读本人；主管看管理范围；人事管理归档 |
| `/api/performance-management/actions` | 自评、终评、复核、冻结和更正 | 角色动作白名单、版本冲突、一次复核、冻结后追加更正 |
| `/api/platform/v1/integrations` | 读取和维护内部平台资料 | 全员可读；仅总经办非只读身份可写；字段白名单；D1 审计只记录字段名 |
| `/api/platform/v1/platform-connections` | 读取脱敏连接状态，验证、保存或停用公司级平台连接 | 全员登录后可读；仅最高权限管理员可写；只读验证成功后切换；不返回密钥；版本冲突返回 409 |
| `/api/platform/v1/user-insights` | 查询多平台用户、商品、视频、直播事实和参考建议；发起人工重试 | 总经办、产品、运营按范围读取；建议固定仅供参考；重试需要已确认类目 |
| `/api/platform/v1/user-insights/category-mappings` | 登记、确认和停用平台类目 | 产品或运营人工确认；未确认类目不能采集 |
| `/api/platform/v1/user-insights/rules` | 维护 App 归属的版本化洞察和竞品规则 | 产品与运营只能维护本 App；跨 App 只读复制，不覆盖来源 |
| `/api/platform/v1/user-insights/competitors` | 管理核心和候选竞品 | 系统发现只生成候选；人工带原因确认后才能成为核心 |
| `/api/platform/v1/user-insights/collector` | 登记采集设备或读取已确认任务 | 登记仅总经办；设备令牌只显示一次、服务端只保存哈希 |
| `/api/platform/v1/user-insights/ingest` | 写入浏览器采集批次和标准事实 | 设备 Bearer 令牌、范围、类目、结构版本和幂等校验；不接收会话或完整页面 |
| `/api/platform/v1/collaboration-items` | 查询和创建跨 App 部门协同事项 | 公司会话；普通员工按本人和部门参与范围；游标分页；业务幂等键 |
| `/api/platform/v1/collaboration-items/:id` | 读取、修改和归档单个协同事项 | 参与范围；版本乐观锁；无物理 DELETE |
| `/api/platform/v1/collaboration-items/:id/transitions` | 执行协同状态动作 | 状态机和角色双重校验；动作幂等；追加活动 |
| `/api/platform/v1/collaboration-items/:id/activities` | 读取协同活动记录 | 与事项相同的读取范围；按时间倒序 |
| `/api/platform/v1/collaboration-items/:id/dingtalk` | 同步协同责任到钉钉待办 | 已确认稳定主负责人；平台统一调用；失败不回滚协同状态 |
| `/api/platform/v1/environment-readiness` | 读取当前或生产环境脱敏就绪状态 | 员工会话或 read 个人令牌；只返回配置名称与存在性 |
| `/api/platform/v1/production-write-session` | 解锁、查询和锁定跨环境生产写入 | active executive + write 个人令牌；确认短语；15 分钟有效 |
| `/api/platform/v1/production-data/state` | 本地测试实时读取、受控写入和回滚生产公司状态 | Bearer 个人令牌；写入需解锁、基线版本、快照与审计 |
| `GET /api/platform/v1/ai/status` | 读取公司 AI 总助和当前用户数据域状态 | 钉钉会话；全员可读；只返回脱敏状态 |
| `GET /api/platform/v1/ai/provider` | 读取 AI Provider 安全状态 | 钉钉会话；全员可读；外发策略仅总经办可见 |
| `PUT /api/platform/v1/ai/provider` | 更新白名单内 Provider 元数据和启用状态 | 钉钉会话；仅非只读总经办；不接收 Secret、URL 或任意 Header |
| `POST /api/platform/v1/ai/provider/test` | 使用合成内容测试 Provider 连接 | 钉钉会话；仅非只读总经办；不加载公司上下文 |
| `POST /api/platform/v1/ai/chat` | 基于服务端可信公司数据流式生成只读分析建议 | 钉钉会话；按数据域权限与外发策略；单用户单并发；SSE |

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

本地线上账号：`npm start` 使用 8127 Vite 热更新，并把全部 `/api/*` 代理给 8132 `wrangler pages dev`；`wrangler.toml` 将 `PRODUCT_FLOW_DB` 绑定到远程生产 D1。只有请求主机为 `localhost`、`127.0.0.1` 或 `::1`、`LOCAL_ONLINE_ACCOUNT_MODE=1`、服务端个人令牌有效且对应 active executive 时，中间件才注入真实组织会话。GET/HEAD 要求 `read`，其他方法要求 `write`；通过后所有业务数据和钉钉、快麦动作继续执行各自正式路由权限。非本地主机即使误配开关和令牌也必须完成正式钉钉登录。数据中心页面可用 `?from=YYYY-MM-DD&to=YYYY-MM-DD#data-overview` 打开指定日期范围，非法或倒序日期回退到默认“当月至昨天”。

用户洞察作为数据中心、产品全周期和电商店铺运营的共享能力，使用 `/api/platform/v1/user-insights*`。完整认证、权限、类目确认、规则版本、竞品确认、采集设备、幂等、错误和兼容契约见 `docs/platform/apis/user-insights-v1.md`；公司 Mac 浏览器采集边界见 `docs/platform/browser-market-collection.md`。

### 公司 AI 总助契约

AI 路由统一使用 `/api/platform/v1/ai/*`，沿用公司钉钉会话。状态与 Provider 响应只包含功能开关、是否就绪、是否已配置服务端 Secret、固定模型元数据、连接测试状态及当前身份可使用或被外发策略阻止的数据域；任何响应不得包含 Secret、Secret 尾号、内部 Header 或 Provider 原始错误。

Provider 更新只接受 `providerId`、`model`、`reasoningEffort` 和 `enabled`，实际域名、Responses 路径、`store:false` 与 Header 白名单由服务端固定。连接测试输入固定为“返回 ok”，不读取 D1 业务事实。写入安全元数据后由数据中心 D1 表持久化；密钥仍只存在 Cloudflare Secret。

聊天请求只接受最多 12 条 `{ role, content }` 文本消息和弱 `appHint.screen` 路由提示；客户端提交的身份、部门、数据权限和公司状态字段全部忽略。单条用户消息最多 4,000 字符、助手历史最多 8,000 字符、总计最多 24,000 字符，最后一条必须是用户消息。包含明确财务关键词和具体金额/比例的手工粘贴内容在 Provider 调用前返回 `AI_FINANCE_TRANSFER_BLOCKED`。

成功响应使用 SSE：`meta` 声明 request ID 和允许/阻止域，`text_delta` 返回正文增量，`sources` 返回 App、数据域、更新时间和记录数，`usage` 返回 token，`error` 返回稳定安全错误，`done` 声明回答是否完整。每个用户同一时间只允许一个生成请求；取消、失败和完成都会释放租约。审计只保存数据域、记录数、更新时间、token、耗时和结果码，不保存消息、回答或上下文。

聊天 SSE 在原有 `meta`、`text_delta`、`sources`、`usage`、`error`、`done` 之外，增加 `skill_started`、`skill_completed`、`skill_failed`。事件只包含 request/call/Skill/App 标识、记录数、耗时和安全结果码，不返回查询参数或业务结果；旧客户端可继续忽略未知事件。

兼容策略：`AI_ASSISTANT_ENABLED` 默认关闭，关闭时状态接口返回 `enabled:false`，聊天接口返回 `AI_DISABLED`，不要求 D1 或 Provider Secret。Provider 未通过 Function Calling 合成测试时，服务端从当前身份已授权的注册表按问题路由最多三个只读 Skill；命中时 `meta.skillsEnabled=true`、`meta.skillMode=server`，未命中时使用服务端摘要并标记 `summary`。原生工具模式标记为 `provider`。回滚只需关闭开关；AI 元数据、外发策略和无内容审计表保留，不影响其他业务 App。电商运营旧 AI 点评本期保持原路由和规则降级，不属于该共享 API 的调用方。

旧 Node 预览只保留为非完整兼容工具，不属于支持的业务开发入口。标准 `npm start` 运行 Pages Functions，因此 AI 状态、Provider 和聊天按真实线上会话与现有功能开关执行；本地环境变量值仍不得进入响应。部署后的生产链路必须另行验收，不能用本地成功替代。

### 店铺运营与绩效契约

店铺运营状态分别保存在 `ecommerce_operation_records` 和 `ecommerce_operation_meta`；绩效状态分别保存在 `performance_management_records` 和 `performance_management_meta`。两个动作接口都接收 `{ "expectedRevision": 1, "action": { "type": "..." } }`，旧版本写入返回 409。

AI 点评只传输方案中的产品、平台、店铺、现状证据、目标、问题、对策和检测指标，不传账号凭据或绩效数据。生产密钥使用 Cloudflare Secret `OPENAI_API_KEY`；请求设置 `store: false`。未配置或服务异常时响应 `mode: "rule_fallback"`，页面明确显示“智能规则检查”。

绩效考核项可保存只读经营证据引用 `{ sourceAppId, entityType, entityId }`，但经营系统不写绩效分；任务完成也不会自动把考核标记为达标。绩效数据不写浏览器 `localStorage`。

### 环境就绪契约

`GET /api/platform/v1/environment-readiness` 返回 `environment`、`ready`、`checkedAt`、`capabilities[]` 和 `dataAccess`。每个能力仅包含中文说明、关联平台、`ready|warning|blocked` 状态和缺少的变量名、绑定名或表名。响应禁止包含配置值。

### 平台连接契约

完整请求、响应、权限、候选验证、版本冲突、停用和回退规则见 `docs/platform/apis/platform-connections-v1.md`。接口仅返回平台、来源、已配置字段名、状态和更新时间等脱敏信息；浏览器不能读取已保存密钥。钉钉和快麦适配器统一优先读取保险箱中的有效版本，未保存或停用时兼容旧环境变量。

### 生产数据契约

个人令牌通过 `Authorization: Bearer` 提交，原始值只存在于本地 `.env`。`POST /api/platform/v1/production-write-session` 输入 `reason` 和固定确认短语，成功后把解锁令牌只返回给本地 Node 服务。`POST /api/platform/v1/production-data/state` 还需要 `X-PFS-Production-Unlock`，输入公司 `state` 与最近读取的 `baseUpdatedAt`；冲突返回 409。输入 `action=rollback`、`auditId` 和确认短语时恢复该审计的写前快照，并生成新的审计。

兼容策略：生产前端和现有 `/api/state` 保持不变；生产网关是本地测试的旁路能力。撤销个人令牌即可关闭通道，不需要删除新增 D1 表。

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

### 供应链审批同步契约

`POST /api/supply-chain/approvals/sync` 接收固定的 `startTime`、`endTime` 和批次参数：

```json
{
  "startTime": 1784304000000,
  "endTime": 1786895999000,
  "batch": { "kind": "purchase", "cursor": 0, "size": 18 }
}
```

`kind` 只允许 `purchase` 或 `payment`，`size` 最大为 20。响应通过 `continuation.nextCursor` 指示下一页；前端在同一时间范围内先耗尽采购申请页，再耗尽付款申请页，避免付款在采购尚未写入时被误判为非供应链记录。单个 Worker 调用只读取一个流程的一页，确保钉钉详情请求不超过 Cloudflare 子请求上限。每批成功后立即写入 D1，重复同步按审批实例 ID 幂等更新。

### 供应链文件快照导入契约

钉钉供应链文件由受授权的桌面读取适配器解析为 `dingtalk-supply-snapshot-v1` JSON。生产页面在现有公司会话和供应链部门写权限下将记录通过 `/api/supply-chain` 保存，不在浏览器中调用钉钉开放接口，也不新增跨环境数据库写入口。

允许导入的集合只有 `suppliers`、`inventorySnapshots`、`materialInventorySnapshots`、`inventoryRisks`、`inventoryBatches` 和 `syncRuns`。每条记录必须带稳定 ID 和允许的钉钉来源标识；其他集合、手工来源和空快照被忽略或拒绝。供应商只保留名称、类别、供货范围和来源证据，银行卡号、手机号、身份证附件、收款资料及原始整行内容不得生成到快照。供应商表中的“对接供应商”分段标题会重置类别上下文，分段内再按供货范围映射包材或原料，不能继承上一分段的服务类别。重复导入按稳定来源行 ID 幂等覆盖，失败不删除既有成功数据。

当前文件读取是钉钉用户授权会话下的受控快照，不标记为后台自动同步。回滚方式是在写入前保留生产状态快照，或按同一来源稳定 ID 导入上一版安全快照。

### 货流平台 Phase 0 契约

`/api/platform/v1/goods-flow/*` 是供应链管理、产品全周期、数据中心、经营驾驶舱和公司 AI 的稳定只读货流边界。写动作仍按业务职责限定在仓库、供应链、财务和总经办。React 页面只调用平台 API，不直接调用钉钉、快麦、ERP 或 D1。

事件使用 `source + sourceReference + sourceVersion` 幂等。ERP 日库存、月度盘点和计算版本分别写入独立表；盘点确认新增盘盈或盘亏事件，不覆盖 ERP 快照。冻结 CCC 后补录来源只能生成新版本，旧版本继续可查。

快麦当前仅登记订单、会话刷新和销售日聚合。货流平台可以读取该销售聚合用于销售成本，但在库存接口、权限、字段和生产结果独立验证完成前，不得把快麦登记为库存自动同步来源。ERP 与盘点文件继续标记为文件快照或人工校准。

所有响应包含安全 request ID；数据响应包含更新时间、覆盖率、可信等级和版本。缺数据不补零。外部超时保留上次成功投影，部分导入返回成功数、失败数和异常队列引用。完整权限、错误码、迁移和回滚规则见 `docs/features/supply-chain-goods-flow-phase-0/` 与 `docs/platform/error-codes.md`。

`POST /api/platform/v1/goods-flow/ccc/:month/recalculate` 的请求体只用于命令封装，不接收指标事实。服务端按月份读取 `goods_flow_events`、`goods_flow_inventory_daily` 和有效平台账期后生成计算输入；浏览器提交的库存、销售、采购、付款或金额字段一律忽略。盘点金额确认会追加 `inventory_adjustment_confirmed` 事件并重建受影响的校准库存投影；追加更正创建新盘点记录，原确认记录不改写。

本地 Node 测试页复用相同路由、授权和响应契约，数据仅写入被忽略的 `.local-data/goods-flow-preview.json`，不连接生产 D1，也不触发真实钉钉、快麦或 ERP 动作。本地、Preview 和 Production 必须分别验收，不能用本地结果替代已部署验证。

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
