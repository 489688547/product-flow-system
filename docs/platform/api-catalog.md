# API 目录

当前接口首先服务本应用，统一登记为内部 API。出现多个真实系统调用方后，稳定契约迁移到 `/api/platform/v1/`。

## 共享状态

| 路径 | 用途 | 主要约束 |
| --- | --- | --- |
| `/api/state` | 读取和保存产品全周期共享状态 | 需要公司会话；写操作拒绝只读身份；大状态按 D1 行限制分片 |
| `/api/platform` | 读取和保存公司战略执行实体 | 仅总经办范围；实体分记录存储；写操作需要非只读身份 |
| `/api/brand-content` | 读取品牌内容状态并应用单个领域动作 | 全员登录后可读；品牌、运营和总经办按动作权限写入；独立 D1 状态表；乐观版本冲突返回 409 |
| `/api/supply-chain` | 读取和保存供应链独立状态 | 需要公司会话；按部门裁剪金额和成本字段；写入仅允许所属部门集合 |
| `/api/supply-chain/approvals/sync` | 分批读取钉钉采购和付款审批并写入供应链状态 | 仅总经办、供应链、采购和财务；每次只读取一个流程的一页，客户端先完成采购再完成付款 |
| `/api/sales` | 查询产品销售聚合 | 需要公司会话；时间和平台口径见产品数据定义 |
| `/api/data-center` | 读取和保存数据中心安全元数据 | 指定部门可读；仅总经办和运营部可写；拒绝只读身份；D1 分实体表存储 |
| `/api/data-center/sales` | 按日期读取数据中心销售事实 | 需要公司会话；最长 370 天；订单创建时间；上海时区；排除“其它” |
| `/api/data-center/connectors` | 读取和维护连接器实例与内部保险箱非敏感元数据 | 数据中心授权部门可读；运营可维护连接器；仅总经办维护内部保险箱和归档 |
| `/api/ecommerce-operations` | 读取可见的店铺经营状态 | 需要公司会话和授权部门；D1 分实体存储 |
| `/api/ecommerce-operations/actions` | 提交重点产品、方案、执行、协同和复盘动作 | 服务端校验角色、状态与版本；拒绝只读身份 |
| `/api/ecommerce-operations/ai-review` | 对当前方案给出优化建议 | 服务端字段白名单；AI 不改变审批；无密钥时明确降级为规则检查 |
| `/api/ecommerce-operations/evidence` | 按员工和月份读取已验收经营证据 | 员工只读本人；主管和人事按职责读取；不返回绩效分 |
| `/api/performance-management` | 按角色读取绩效状态 | 员工只读本人；主管看管理范围；人事管理归档 |
| `/api/performance-management/actions` | 自评、终评、复核、冻结和更正 | 角色动作白名单、版本冲突、一次复核、冻结后追加更正 |
| `/api/platform/v1/integrations` | 读取和维护内部平台资料 | 全员可读；仅总经办非只读身份可写；字段白名单；D1 审计只记录字段名 |
| `/api/platform/v1/credential-vault` | 保存和读取加密凭证的脱敏元数据 | 公司会话；动作级权限；普通读取永不返回明文；D1 使用版本化密文 |
| `/api/platform/v1/credential-vault/:id/reveal` | 受控查看或复制单条凭证 | 近期认证、条目范围授权、明确用途、限流、禁止缓存和追加式审计 |
| `/api/platform/v1/credential-vault/:id/task-grants`（计划） | 向指定本地采集器签发短时凭证授权 | 阶段 1 未实现；后续绑定任务、采集器和字段范围，默认一次消费 |
| `/api/platform/v1/collaboration-items` | 查询和创建跨 App 部门协同事项 | 公司会话；普通员工按本人和部门参与范围；游标分页；业务幂等键 |
| `/api/platform/v1/collaboration-items/:id` | 读取、修改和归档单个协同事项 | 参与范围；版本乐观锁；无物理 DELETE |
| `/api/platform/v1/collaboration-items/:id/transitions` | 执行协同状态动作 | 状态机和角色双重校验；动作幂等；追加活动 |
| `/api/platform/v1/collaboration-items/:id/activities` | 读取协同活动记录 | 与事项相同的读取范围；按时间倒序 |
| `/api/platform/v1/collaboration-items/:id/dingtalk` | 同步协同责任到钉钉待办 | 已确认稳定主负责人；平台统一调用；失败不回滚协同状态 |
| `/api/platform/v1/data-standards` | 查询和发布共享数据口径 | 公司会话；按责任部门服务端授权；受控公式；版本快照与乐观锁；无物理删除 |
| `/api/platform/v1/data-standards/:id` | 读取详情或追加口径版本 | 详情含版本、依赖和最近结果；`metricCode` 不可变；元数据随版本快照 |
| `/api/platform/v1/data-standards/:id/archive` | 归档共享数据口径 | 责任部门或总经办；版本检查；保留定义、版本、结果和审计 |
| `/api/platform/v1/data-standards/preview` | 预览受控公式结果 | 与发布相同的责任部门权限；最多 31 天；与正式计算共用编译器和执行器；不持久化业务结果 |
| `/api/platform/v1/data-standards/recalculate` | 建立共享口径计算或显式历史重算批次 | 最多 11 项（含依赖）和 370 天；服务端幂等；202 后台执行；失败不切 current |
| `/api/platform/v1/data-standards/results` | 读取带版本和可信度的口径结果 | 默认只读当前批次；可按 run 轮询；无结果返回原因且不补 0 |
| `/api/platform/v1/environment-readiness` | 读取当前或生产环境脱敏就绪状态 | 员工会话或 read 个人令牌；只返回配置名称与存在性 |
| `/api/platform/v1/production-write-session` | 解锁、查询和锁定跨环境生产写入 | active executive + write 个人令牌；确认短语；15 分钟有效 |
| `/api/platform/v1/production-data/state` | 本地测试实时读取、受控写入和回滚生产公司状态 | Bearer 个人令牌；写入需解锁、基线版本、快照与审计 |

### 数据中心契约

`GET /api/data-center` 返回标准化元数据状态；`POST /api/data-center` 接收 `{ "state": { ... } }`。元数据分别保存到 `data_sources`、`data_runners`、`data_sync_runs`、`data_source_files`、`data_dimension_mappings`、`data_metric_definitions`、`data_quality_issues`、`data_app_subscriptions` 和 `data_audit_logs`，设置与版本保存在 `data_center_meta`。连接实例只保存凭证引用，不接收或返回明文；敏感值由共享 credential-vault API 处理。

### 加密凭证保险箱契约

凭证保险箱是数据连接器、内部系统保险箱和本地采集器共用的平台能力。普通 GET 只返回条目 ID、分类、范围、schema 版本、是否已配置、更新时间和脱敏提示。创建或替换接口接收字段白名单内的敏感 payload，服务端使用 Cloudflare Secret `DATA_CREDENTIAL_MASTER_KEY` 和 AES-256-GCM 加密后写入 D1；请求体、密文和明文均不得进入日志或审计详情。

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

远程只读预览：`wrangler pages dev` 通过 `wrangler.toml` 将 `PRODUCT_FLOW_DB` 绑定到远程 D1。只有请求主机为 `localhost`、`127.0.0.1` 或 `::1` 且显式设置 `LOCAL_LIVE_D1_PREVIEW=1` 时，中间件才注入总经办预览身份；该模式只允许 GET，所有写请求返回 403。非本地主机即使设置同名变量也必须完成正式钉钉登录。数据中心页面可用 `?from=YYYY-MM-DD&to=YYYY-MM-DD#data-overview` 打开指定日期范围，非法或倒序日期回退到默认“当月至昨天”。

`GET /api/data-center/connectors` 返回 `{ connectors, vaultItems }`。财务、产品、供应链和运营只能读取连接器；内部保险箱元数据仅向总经办返回。`PUT` 使用 `{ expectedVersion, instance }` 保存连接器，或由总经办使用 `{ expectedVersion, vaultItem }` 保存内部保险箱条目。敏感值不得出现在请求中，只能提交 `credentialEntryId` 引用；新配置固定为 `pending_validation`，客户端提交 `healthy` 不生效。归档使用 `{ action: "archive", id, expectedVersion }` 且仅总经办可执行。所有修改使用乐观版本并在 `data_audit_logs` 只记录动作和变更字段名。

### 店铺运营与绩效契约

店铺运营状态分别保存在 `ecommerce_operation_records` 和 `ecommerce_operation_meta`；绩效状态分别保存在 `performance_management_records` 和 `performance_management_meta`。两个动作接口都接收 `{ "expectedRevision": 1, "action": { "type": "..." } }`，旧版本写入返回 409。

AI 点评只传输方案中的产品、平台、店铺、现状证据、目标、问题、对策和检测指标，不传账号凭据或绩效数据。生产密钥使用 Cloudflare Secret `OPENAI_API_KEY`；请求设置 `store: false`。未配置或服务异常时响应 `mode: "rule_fallback"`，页面明确显示“智能规则检查”。

绩效考核项可保存只读经营证据引用 `{ sourceAppId, entityType, entityId }`，但经营系统不写绩效分；任务完成也不会自动把考核标记为达标。绩效数据不写浏览器 `localStorage`。

### 环境就绪契约

`GET /api/platform/v1/environment-readiness` 返回 `environment`、`ready`、`checkedAt`、`capabilities[]` 和 `dataAccess`。每个能力仅包含中文说明、关联平台、`ready|warning|blocked` 状态和缺少的变量名、绑定名或表名。响应禁止包含配置值。

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
