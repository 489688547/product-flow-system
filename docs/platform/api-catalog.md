# API 目录

当前接口首先服务本应用，统一登记为内部 API。出现多个真实系统调用方后，稳定契约迁移到 `/api/platform/v1/`。

## 共享状态

`GET /api/state` 返回 `{ synced, state, version, updatedAt, updatedBy }`。客户端只有在成功读取带 `updatedAt` 的共享状态后才允许保存；浏览器脏缓存和代码默认状态不得在启动时自动上传。若本机存在未同步缓存，客户端只能保留本机恢复副本，并以线上状态为当前事实源。

`POST /api/state` 接收 `{ state, baseUpdatedAt }`，操作者由当前公司会话确定，客户端提交的 `updatedBy` 不可信。缺少基线返回 `409 SHARED_STATE_BASE_REQUIRED`，基线落后或在写入期间被并发推进返回 `409 SHARED_STATE_VERSION_CONFLICT`，线上尚未初始化返回 `409 SHARED_STATE_NOT_INITIALIZED`；三种情况均不得修改状态。版本比较与推进、旧分片删除和新分片插入在同一个 D1 原子批次完成。成功写入前保存完整写前快照并创建待完成审计，写入后完成审计，响应增加 `auditId` 和新的 `updatedAt`。客户端规范化业务状态没有变化时不得 POST。旧客户端因为不携带基线而只能读取，刷新到新版本后恢复写入。

| 路径 | 用途 | 主要约束 |
| --- | --- | --- |
| `/api/state` | 读取和保存产品全周期共享状态 | 需要公司会话；写操作拒绝只读身份；先读后写；原子比较并推进 `baseUpdatedAt`；无变化不写；写前快照与审计；大状态按 D1 行限制分片 |
| `/api/platform` | 读取和保存公司战略执行实体 | 仅总经办范围；实体分记录存储；写操作需要非只读身份 |
| `/api/brand-content` | 读取品牌内容状态并应用单个领域动作 | 全员登录后可读；品牌、运营和总经办按动作权限写入；独立 D1 状态表；乐观版本冲突返回 409 |
| `/api/supply-chain` | 读取和保存供应链独立状态，并承接已清洗的钉钉供应链文件快照 | 需要公司会话；按部门裁剪金额和成本字段；写入仅允许所属部门集合；文件快照只允许供应商、库存盘点、成品库存、原辅料库存和异常库存集合 |
| `/api/supply-chain/approvals/sync` | 分批读取钉钉采购和付款审批并写入供应链状态 | 仅总经办、供应链、采购和财务；每次只读取一个流程的一页，客户端先完成采购再完成付款 |
| `/api/platform/v1/goods-flow/dashboard` | 读取 CCC、断货率、库存周转、库存资金和例外投影 | 公司会话；金额按部门裁剪；响应包含来源时间、覆盖率和计算版本 |
| `/api/platform/v1/goods-flow/inventory` | 按日期、SKU 和仓库读取账面、实盘与校准库存 | 公司会话；支持截止日期过滤；未盘点和过期来源必须显式标记 |
| `/api/platform/v1/goods-flow/imports` | 幂等导入 ERP 库存、钉钉审批、销售和兼容盘点事实 | 数据中心、供应链、财务或总经办；服务端读取共享商品目录展开组合消耗；部分成功返回 207；浏览器不直连 ERP |
| `/api/platform/v1/goods-flow/stocktakes` | 查询或创建月度盘点任务 | 仓库维护实存；供应链确认差异；金额调整由财务确认 |
| `/api/platform/v1/goods-flow/stocktakes/:id/transitions` | 按乐观版本推进盘点确认或追加更正 | 仓库录数、供应链确认差异、财务确认金额；写入需要 `Idempotency-Key` |
| `/api/platform/v1/goods-flow/receivable-terms` | 查询或版本化维护平台固定账期 | 全部货流角色可读；仅财务和总经办可写；区间不可重叠 |
| `/api/platform/v1/goods-flow/ccc` | 查询月度 CCC 版本 | 公司会话；缺少库存、成本、账期或应付日期时返回覆盖不足 |
| `/api/platform/v1/goods-flow/ccc/:month/recalculate` | 生成月度 CCC 新计算版本 | 财务、供应链或总经办；同一幂等键返回同一版本 |
| `/api/platform/v1/goods-flow/ccc/:month/freeze` | 冻结覆盖完整的月度 CCC 版本 | 仅财务或总经办；覆盖不足或版本过期返回 409 |
| `/api/sales` | 查询产品销售聚合 | 需要公司会话；时间和平台口径见产品数据定义 |
| `/api/data-center` | 读取和保存数据中心安全元数据 | 指定部门可读；仅总经办和运营部可写；拒绝只读身份；D1 分实体表存储 |
| `/api/data-center/sales` | 按日期读取数据中心销售事实 | 需要公司会话；最长 370 天；订单创建时间；上海时区；排除“其它” |
| `/api/platform/v1/data-services/sales` | 发现销售数据覆盖范围并按日期读取经营汇总 | 需要公司会话；无日期时返回可用月份；完整日期时返回单行汇总；订单创建时间；上海时区；排除“其它” |
| `/api/data-center/connectors` | 读取和维护连接器实例与内部保险箱非敏感元数据 | 数据中心授权部门可读；运营可维护非店铺连接器；仅总经办维护内部保险箱、归档并销毁已退役店铺凭证 |
| `/api/ecommerce-operations` | 读取可见的店铺经营状态 | 需要公司会话和授权部门；D1 分实体存储 |
| `/api/ecommerce-operations/actions` | 提交重点产品、方案、执行、协同和复盘动作 | 服务端校验角色、状态与版本；拒绝只读身份 |
| `/api/ecommerce-operations/ai-review` | 对当前方案给出优化建议 | 服务端字段白名单；AI 不改变审批；无密钥时明确降级为规则检查 |
| `/api/ecommerce-operations/evidence` | 按员工和月份读取已验收经营证据 | 员工只读本人；主管和人事按职责读取；不返回绩效分 |
| `/api/performance-management` | 按角色读取绩效状态 | 员工只读本人；主管看管理范围；人事管理归档 |
| `/api/performance-management/actions` | 自评、终评、复核、冻结和更正 | 角色动作白名单、版本冲突、一次复核、冻结后追加更正 |
| `/api/platform/v1/integrations` | 读取和维护内部平台资料 | 全员可读；仅总经办非只读身份可写；字段白名单；D1 审计只记录字段名 |
| `/api/platform/v1/platform-connections` | 读取脱敏连接状态，验证、保存或停用公司级平台连接 | 全员登录后可读；仅最高权限管理员可写；只读验证成功后切换；不返回密钥；版本冲突返回 409 |
| `/api/platform/v1/platform-connections/:platformId/reveal` | 临时查看灵算保险箱中当前启用的凭据 | 仅最高权限且 15 分钟内登录；用途和确认语必填；15 分钟最多 5 次；环境变量不返回；响应 `private, no-store` |
| `/api/platform/v1/data-connections` | 读取或销毁旧抖音 provider 连接 | 旧连接只读；POST/PUT 返回 410；DELETE 仅最高权限管理员、15 分钟内会话、精确确认和版本锁；销毁密文并结束任务 |
| `/api/platform/v1/data-connections/:id/reveal` | 兼容读取尚未销毁的旧连接凭证 | 不再由 UI 调用；清理后返回不存在；不得用于新建店铺网页登录 |
| `/api/platform/v1/browser-agent/tasks` | 公司 Mac 领取通用 provider 采集任务 | 设备 Bearer 令牌；明确 platform scope；返回一次性五分钟 grant，不返回凭证 |
| `/api/platform/v1/browser-agent/tasks/:id/credential` | 领取单个任务所需登录凭证 | task/device/credentialVersion 绑定的一次性 grant；消费后失效；no-store |
| `/api/platform/v1/browser-agent/tasks/:id/result` | 回写等待人工、识别、成功或失败结果 | 设备 Bearer；provider/resource writer 白名单；拒绝密码、验证码、Cookie、HTML 和截图 |
| `/api/platform/v1/user-insights` | 查询多平台用户、商品、视频、直播事实和参考建议；发起人工重试 | 总经办、产品、运营按范围读取；建议固定仅供参考；重试需要已确认类目 |
| `/api/platform/v1/user-insights/category-mappings` | 登记、确认和停用平台类目 | 产品或运营人工确认；未确认类目不能采集 |
| `/api/platform/v1/user-insights/rules` | 维护 App 归属的版本化洞察和竞品规则 | 产品与运营只能维护本 App；跨 App 只读复制，不覆盖来源 |
| `/api/platform/v1/user-insights/competitors` | 管理核心和候选竞品 | 系统发现只生成候选；人工带原因确认后才能成为核心 |
| `/api/platform/v1/user-insights/collector` | 登记采集设备或读取已确认任务 | 登记仅总经办；设备令牌只显示一次、服务端只保存哈希 |
| `/api/platform/v1/user-insights/ingest` | 写入浏览器采集批次和标准事实 | 设备 Bearer 令牌、范围、类目、结构版本和幂等校验；不接收会话或完整页面 |
| `/api/platform/v1/credential-vault` | 保存和读取加密凭证的脱敏元数据 | 公司会话；动作级权限；普通读取永不返回明文；D1 使用版本化密文 |
| `/api/platform/v1/credential-vault/:id/reveal` | 受控查看或复制单条凭证 | 近期认证、条目范围授权、明确用途、限流、禁止缓存和追加式审计 |
| `/api/platform/v1/credential-vault/:id/task-grants`（计划） | 向指定本地采集器签发短时凭证授权 | 阶段 1 未实现；后续绑定任务、采集器和字段范围，默认一次消费 |
| `/api/platform/v1/collaboration-items` | 查询和创建跨 App 部门协同事项 | 公司会话；普通员工按本人和部门参与范围；游标分页；业务幂等键 |
| `/api/platform/v1/collaboration-items/:id` | 读取、修改和归档单个协同事项 | 参与范围；版本乐观锁；无物理 DELETE |
| `/api/platform/v1/collaboration-items/:id/transitions` | 执行协同状态动作 | 状态机和角色双重校验；动作幂等；追加活动 |
| `/api/platform/v1/collaboration-items/:id/activities` | 读取协同活动记录 | 与事项相同的读取范围；按时间倒序 |
| `/api/platform/v1/collaboration-items/:id/dingtalk` | 同步协同责任到钉钉待办 | 已确认稳定主负责人；平台统一调用；失败不回滚协同状态 |
| `/api/platform/v1/product-catalog` | 读取共享 ERP 商品、库存单位、组合关系与同步元数据 | 全员登录后可读；产品/品牌等非授权部门不返回采购成本 |
| `/api/platform/v1/product-catalog/import` | 导入数据中心确认后的 ERP 商品文件 | 仅总经办、运营部非只读身份；幂等合并，不保存原始整行 |
| `/api/platform/v1/product-catalog/sync/kuaimai` | 分页读取快麦商品及组合详情并合并共享目录 | 仅总经办、运营部非只读身份；请求体可传详情游标；客户端续跑至完成；不反向修改快麦 |
| `/api/platform/v1/data-standards` | 查询和发布共享数据口径 | 公司会话；按责任部门服务端授权；受控公式；版本快照与乐观锁；无物理删除 |
| `/api/platform/v1/data-standards/:id` | 读取详情或追加口径版本 | 详情含版本、依赖和最近结果；`metricCode` 不可变；元数据随版本快照 |
| `/api/platform/v1/data-standards/:id/archive` | 归档共享数据口径 | 责任部门或总经办；版本检查；保留定义、版本、结果和审计 |
| `/api/platform/v1/data-standards/preview` | 预览受控公式结果 | 与发布相同的责任部门权限；最多 31 天；与正式计算共用编译器和执行器；不持久化业务结果 |
| `/api/platform/v1/data-standards/recalculate` | 建立共享口径计算或显式历史重算批次 | 最多 11 项（含依赖）和 370 天；服务端幂等；202 后台执行；失败不切 current |
| `/api/platform/v1/data-standards/results` | 读取带版本和可信度的口径结果 | 默认只读当前批次；可按 run 轮询；无结果返回原因且不补 0 |
| `/api/platform/v1/environment-readiness` | 读取当前或生产环境脱敏就绪状态 | 员工会话或 read 个人令牌；只返回配置名称与存在性 |
| `/api/platform/v1/production-write-session` | 解锁、查询和锁定跨环境生产写入 | active executive + write 个人令牌；确认短语；15 分钟有效 |
| `/api/platform/v1/production-data/state` | 本地测试实时读取、受控写入和回滚生产公司状态 | Bearer 个人令牌；写入需解锁、基线版本、快照与审计 |
| `/api/platform/v1/production-data/store-connections` | 读取并不可恢复清理已退役店铺网页登录记录 | Bearer 个人令牌；仅 active executive；写入需 15 分钟解锁、精确确认、清理前计数快照与审计；不返回凭据值 |
| `GET /api/platform/v1/ai/status` | 读取公司 AI 总助和当前用户数据域状态 | 钉钉会话；全员可读；只返回脱敏状态 |
| `GET /api/platform/v1/ai/provider` | 读取 AI Provider 安全状态 | 钉钉会话；全员可读；外发策略仅总经办可见 |
| `PUT /api/platform/v1/ai/provider` | 更新白名单内 Provider 元数据和启用状态 | 钉钉会话；仅非只读总经办；不接收 Secret、URL 或任意 Header |
| `POST /api/platform/v1/ai/provider/test` | 使用合成内容测试 Provider 连接 | 钉钉会话；仅非只读总经办；不加载公司上下文 |
| `POST /api/platform/v1/ai/chat` | 基于服务端可信公司数据流式生成只读分析建议 | 钉钉会话；按数据域权限与外发策略；单用户单并发；SSE |
| `GET /api/platform/v1/ai/usage` | 按日期读取 App、功能、模型与 Skill 聚合用量 | 数据中心读取权限；最多 366 天；不返回个人、提示词、回答或 Skill 参数 |

### 数据中心契约

`GET /api/data-center` 返回标准化元数据状态；`POST /api/data-center` 接收 `{ "state": { ... } }`。元数据分别保存到 `data_sources`、`data_runners`、`data_sync_runs`、`data_source_files`、`data_dimension_mappings`、`data_metric_definitions`、`data_quality_issues`、`data_app_subscriptions` 和 `data_audit_logs`，设置与版本保存在 `data_center_meta`。连接实例只保存凭证引用，不接收或返回明文；敏感值由共享 credential-vault API 处理。

### 加密凭证保险箱契约

凭证保险箱是数据连接器、内部系统保险箱和本地采集器共用的平台能力。普通 GET 只返回条目 ID、分类、范围、schema 版本、是否已配置、更新时间和脱敏提示。创建或替换接口接收字段白名单内的敏感 payload，服务端使用 Cloudflare Secret `PLATFORM_CREDENTIAL_MASTER_KEY` 和 AES-256-GCM 加密后写入 D1；迁移期兼容旧名 `DATA_CREDENTIAL_MASTER_KEY`，请求体、密文和明文均不得进入日志或审计详情。

OTP、短信验证码、二维码内容、滑块答案和当次人工验证结果不属于凭证 payload。明文查看/复制使用独立 reveal 动作；本地采集器未来使用绑定任务、机器和字段范围的短时 task grant，阶段 1 不实现该路径。完整请求、响应、权限、错误、密钥轮换和兼容契约见 `docs/platform/apis/credential-vault-v1.md`；当前代码完成不代表已经部署生产。

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

`GET /api/platform/v1/data-services/sales` 是业务 App 共用的只读销售数据服务。无 `from/to` 时返回最早日期、最新日期、总记录数和按月记录数；同时提供完整 `from/to` 时在 D1 内聚合记录数、净销量、净销售额、平台数和实际覆盖日期。只提供一个日期、非法或倒序日期返回 `DATA_SERVICE_DATE_RANGE_INVALID`。接口不返回订单明细、客户信息或数据库凭据。

完整认证、授权、请求、响应、兼容、错误和回滚契约见 `docs/platform/apis/data-services-sales-v1.md`。

本地线上账号：`npm start` 使用 8127 Vite 热更新，并把全部 `/api/*` 代理给 8132 `wrangler pages dev`；`wrangler.toml` 将 `PRODUCT_FLOW_DB` 绑定到远程生产 D1。只有请求主机为 `localhost`、`127.0.0.1` 或 `::1`、`LOCAL_ONLINE_ACCOUNT_MODE=1`、服务端个人令牌有效且对应 active executive 时，中间件才注入真实组织会话。GET/HEAD 要求 `read`，其他方法要求 `write`；通过后所有业务数据和钉钉、快麦动作继续执行各自正式路由权限。非本地主机即使误配开关和令牌也必须完成正式钉钉登录。数据中心页面可用 `?from=YYYY-MM-DD&to=YYYY-MM-DD#data-overview` 打开指定日期范围，非法或倒序日期回退到默认“当月至昨天”。

用户洞察作为数据中心、产品全周期和电商店铺运营的共享能力，使用 `/api/platform/v1/user-insights*`。完整认证、权限、类目确认、规则版本、竞品确认、采集设备、幂等、错误和兼容契约见 `docs/platform/apis/user-insights-v1.md`；公司 Mac 浏览器采集边界见 `docs/platform/browser-market-collection.md`。

通用数据采集使用 `/api/platform/v1/data-connections*` 与 `/api/platform/v1/browser-agent*`。完整连接、reveal、设备任务、provider registry、迁移和回滚契约见 `docs/platform/apis/data-connections-v1.md` 与 `docs/platform/apis/browser-agent-v1.md`。

### 公司统一 AI 契约

AI 路由统一使用 `/api/platform/v1/ai/*`，沿用公司钉钉会话。状态与 Provider 响应只包含功能开关、是否就绪、是否已配置服务端 Secret、固定模型元数据、连接测试状态及当前身份可使用或被外发策略阻止的数据域；任何响应不得包含 Secret、Secret 尾号、内部 Header 或 Provider 原始错误。

Provider 更新只接受 `providerId`、`model`、`reasoningEffort` 和 `enabled`，实际域名、Responses 路径、`store:false` 与 Header 白名单由服务端固定。连接测试输入固定为“返回 ok”，不读取 D1 业务事实。写入安全元数据后由数据中心 D1 表持久化；公司级密钥优先从平台连接保险箱解析，旧 Cloudflare Secret 仅作为迁移回退。

每个业务 AI 功能必须先进入服务端功能注册表，再使用固定 App 与功能 ID 调用统一执行器；浏览器不能声明审计归属。未知功能返回 `AI_FEATURE_NOT_REGISTERED` 且不得请求 Provider。非流式能力统一处理 Provider 配置、超时、Token、一次审计与规则降级；公司总助聊天继续使用同一注册归属和流式编排。业务路由不得持有模型地址、Secret、Authorization Header 或低层 Responses 适配器。

聊天请求只接受最多 12 条 `{ role, content }` 文本消息和弱 `appHint.screen` 路由提示；客户端提交的身份、部门、数据权限和公司状态字段全部忽略。单条用户消息最多 4,000 字符、助手历史最多 8,000 字符、总计最多 24,000 字符，最后一条必须是用户消息。包含明确财务关键词和具体金额/比例的手工粘贴内容在 Provider 调用前返回 `AI_FINANCE_TRANSFER_BLOCKED`。

成功响应使用 SSE：`meta` 声明 request ID 和允许/阻止域，`text_delta` 返回正文增量，`sources` 返回 App、数据域、更新时间和记录数，`usage` 返回 token，`error` 返回稳定安全错误，`done` 声明回答是否完整。每个用户同一时间只允许一个生成请求；取消、失败和完成都会释放租约。审计只保存数据域、记录数、更新时间、token、耗时和结果码，不保存消息、回答或上下文。

聊天 SSE 在原有 `meta`、`text_delta`、`sources`、`usage`、`error`、`done` 之外，增加 `skill_started`、`skill_completed`、`skill_failed`。事件只包含 request/call/Skill/App 标识、记录数、耗时和安全结果码，不返回查询参数或业务结果；旧客户端可继续忽略未知事件。

`GET /api/platform/v1/ai/usage?from=YYYY-MM-DD&to=YYYY-MM-DD` 使用上海时区包含首尾日期，最长 366 天。响应仅包含 `range`、公司级 `summary`、按 App/功能/Provider/模型聚合的 `features` 与按调用方/Skill/来源 App 聚合的 `skills`；已登记但没有记录的功能以 0 补齐。身份只保留在受限审计中用于追责，接口不返回 actor、部门、员工排行、消息、回答、上下文、Skill 参数或 Provider 原始错误。

兼容策略：`AI_ASSISTANT_ENABLED` 默认关闭，关闭时状态接口返回 `enabled:false`，聊天接口返回 `AI_DISABLED`，不要求 D1 或 Provider Secret。Provider 未通过 Function Calling 合成测试时，服务端从当前身份已授权的注册表按问题路由最多三个只读 Skill；命中时 `meta.skillsEnabled=true`、`meta.skillMode=server`，未命中时使用服务端摘要并标记 `summary`。原生工具模式标记为 `provider`。回滚只需关闭开关；AI 元数据、外发策略和无内容审计表保留，不影响其他业务 App。电商运营方案点评已迁移至共享执行器，仍返回原 `ai/rule_fallback` 合同且不改变审批。

旧 Node 预览只保留为非完整兼容工具，不属于支持的业务开发入口。标准 `npm start` 运行 Pages Functions，因此 AI 状态、Provider 和聊天按真实线上会话与现有功能开关执行；本地环境变量值仍不得进入响应。部署后的生产链路必须另行验收，不能用本地成功替代。

### 商品主数据契约

`GET /api/platform/v1/product-catalog` 返回 `{ items, runs, meta }`。`items[].skus[]` 是产品全周期、供应链、供应商管理和货流共同消费的库存单位；`items[].components[]` 为向后兼容新增的组合关系，包含库存单位编码和正整数组合比例。采购成本（包括组件成本）仅对总经办、财务、供应链和采购范围返回。`meta` 包含商品、库存单位、内部唯一码、组合商品、组件关系及最后成功同步时间、来源和方式。

商品经营读取使用 `GET /api/platform/v1/product-catalog?from=YYYY-MM-DD&to=YYYY-MM-DD&platform=<平台>`。`from` 与 `to` 必须同时提交、包含边界日期且最多 370 天；`platform` 省略时排除空值、`其它`、`其他`、`未知` 和 `未知平台`。服务端在 D1 先按 `code × platform` 聚合 `product_sales_daily`，再用目录 SKU 条码/规格商家编码确定性关联商品，避免把明细或任意 SQL 暴露给浏览器。

带销量范围时每个商品增加 `{ sales: { quantity, netSales, matchedCodeCount, platforms } }`；`meta.sales` 返回 `from`、`to`、`platform`、`availablePlatforms`、`totalQuantity`、`totalNetSales`、`coveredProducts`、`unmatchedRowCount`、`latestDataDate`、`timeBasis=create_time`、`timezone=Asia/Shanghai` 和销售事实最后入库时间。销量基础字段对现有商品目录读者可见，采购成本裁剪规则不变。旧客户端不带日期参数时不扫描销售表且响应保持兼容；商品 GET 只读已治理 D1 表，不在读取请求中执行建表或改表。

`POST /api/platform/v1/product-catalog/import` 接收 `{ source, fileName, items, errors }`。客户端只提交已标准化商品与异常摘要，不提交原始文件内容；服务端按主商家编码和规格商家编码幂等合并。`POST /api/platform/v1/product-catalog/sync/kuaimai` 接收可选 `{ cursor }`：游标 0 完整读取 `item.list.query` 并先归并为唯一商品，后续游标复用已落库共享目录，不重复拉取和重写整表；组合候选按稳定 ERP 商品身份排序，每批最多读取 30 个 `item.single.get` 详情，详情请求最多 5 路并发，返回 `complete`、`nextCursor`、`progress` 和安全失败摘要。成功详情按父商品成组替换组件；失败详情保留旧关系。

快麦 API 与商品档案导出覆盖范围不同，自动同步不把 API 未返回的文件补齐商品标记为删除。订单日同步按快麦官方 `timeType=created` 查询并用响应 `created` 归日。回滚销量视图不删除目录或 `product_sales_daily`；旧产品 `skuCodes` 和供应关系 `productId` 继续兼容。销量查询按日期、编码和平台聚合，最大范围 370 天，不新增销售复制表。主要错误码：`PRODUCT_CATALOG_STORAGE_UNAVAILABLE`、`PRODUCT_CATALOG_SALES_RANGE_INVALID`、`PRODUCT_CATALOG_IMPORT_INVALID`、`PRODUCT_CATALOG_WRITE_DENIED`、`KUAIMAI_CONFIG_MISSING`、`KUAIMAI_PRODUCT_SYNC_INCOMPLETE`、`KUAIMAI_PRODUCT_SYNC_CURSOR_STALE`、`KUAIMAI_PRODUCT_SYNC_FAILED`。

`GET /api/data-center/connectors` 返回 `{ connectors, vaultItems }`。财务、产品、供应链和运营只能读取连接器；内部保险箱元数据仅向总经办返回。`PUT` 使用 `{ expectedVersion, instance }` 保存连接器，或由总经办使用 `{ expectedVersion, vaultItem }` 保存内部保险箱条目。敏感值不得出现在请求中，只能提交 `credentialEntryId` 引用；新配置固定为 `pending_validation`，客户端提交 `healthy` 不生效。归档使用 `{ action: "archive", id, expectedVersion }` 且仅总经办可执行。所有修改使用乐观版本并在 `data_audit_logs` 只记录动作和变更字段名。

### 店铺运营与绩效契约

店铺运营状态分别保存在 `ecommerce_operation_records` 和 `ecommerce_operation_meta`；绩效状态分别保存在 `performance_management_records` 和 `performance_management_meta`。两个动作接口都接收 `{ "expectedRevision": 1, "action": { "type": "..." } }`，旧版本写入返回 409。

AI 点评只传输方案中的产品、平台、店铺、现状证据、目标、问题、对策和检测指标，不传账号凭据或绩效数据。路由使用共享 `invokeAiFeature` 和灵算连接配置；模型未配置、超时或服务异常时响应 `mode: "rule_fallback"`，页面明确显示“智能规则检查”。每次成功或降级只写一条无内容审计。

绩效考核项可保存只读经营证据引用 `{ sourceAppId, entityType, entityId }`，但经营系统不写绩效分；任务完成也不会自动把考核标记为达标。绩效数据不写浏览器 `localStorage`。

### 环境就绪契约

### 快麦 ERP 本地归档与采集契约

`POST /api/platform/v1/erp-collection/runners` 仅允许总经办真实公司会话登记固定范围采集器，令牌明文只返回一次并写入 macOS 钥匙串，D1 只保存 SHA-256 哈希。`POST /api/platform/v1/erp-collection/ingest` 接受授权公司会话或有效采集令牌，按文件哈希幂等写入归档清单、批次、脱敏最小索引和共享业务投影。`GET /api/platform/v1/erp-collection/archives` 返回归档状态、相对路径和批次，不返回本机绝对路径。

完整原始文件只保存在 `~/Desktop/公司数据中心/快麦ERP/`，不进入 D1、日志、Git 或前端。订单归日使用 `Asia/Shanghai` 的订单创建时间；正常经营判断排除“其它/其他/未知”。认证、请求、响应、错误、兼容、容量和回滚见 `docs/platform/apis/erp-collection-v1.md`。

`GET /api/platform/v1/environment-readiness` 返回 `environment`、`ready`、`checkedAt`、`capabilities[]` 和 `dataAccess`。每个能力仅包含中文说明、关联平台、`ready|warning|blocked` 状态和缺少的变量名、绑定名或表名。响应禁止包含配置值。

### 平台连接契约

完整请求、响应、权限、候选验证、版本冲突、停用、受控查看和回退规则见 `docs/platform/apis/platform-connections-v1.md`。普通接口仅返回平台、来源、已配置字段名、状态和更新时间等脱敏信息。只有灵算专用 reveal POST 在最高权限、近期登录、用途、确认语、限流、禁缓存和无秘密审计全部满足时临时返回当前启用的保险箱值；环境变量回退值永不返回。钉钉、快麦和灵算适配器统一优先读取保险箱中的有效版本，未保存或停用时兼容旧环境变量。

### 生产数据契约

个人令牌通过 `Authorization: Bearer` 提交，原始值只存在于本地 `.env`。`POST /api/platform/v1/production-write-session` 输入 `reason` 和固定确认短语，成功后把解锁令牌只返回给本地 Node 服务。`POST /api/platform/v1/production-data/state` 还需要 `X-PFS-Production-Unlock`，输入公司 `state` 与最近读取的 `baseUpdatedAt`；冲突返回 409。输入 `action=rollback`、`auditId` 和确认短语时恢复该审计的写前快照，并生成新的审计。

兼容策略：生产数据网关继续作为本地测试和事故修复的旁路能力。普通 `/api/state` 与网关共用版本、快照和审计底线，但普通业务会话不需要个人令牌或短时解锁；旧 `/api/state` 客户端缺少 `baseUpdatedAt` 时写入被拒绝。撤销个人令牌即可关闭跨环境网关，不影响正常在线业务写入。

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

### 共享数据口径契约

完整认证、责任部门授权、查询与写入白名单、版本元数据快照、安全预览、错误、并发、兼容和审计约束见 `docs/platform/apis/data-standards-v1.md`。该接口复用 `PRODUCT_FLOW_DB`，不新增变量、Secret 或绑定；页面编辑态不是服务端授权边界。当前代码完成不代表已执行生产迁移或部署。

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
