# 中间件目录

中间件负责跨路由一致的认证、校验、错误、日志和外部调用策略。业务路由只处理自己的输入、权限和领域操作。

## 当前认证中间件

`functions/api/_middleware.js` 处理 OPTIONS、公共认证路径和公司会话读取。受保护接口没有有效会话时返回 401，并把有效会话放入 `context.data.session`。

本地线上账号认证顺序固定为：回环主机 → `LOCAL_ONLINE_ACCOUNT_MODE=1` → 服务端个人令牌存在 → 生产 D1 可用 → 令牌哈希有效 → 按 HTTP 方法具备 `read` 或 `write` → `userId/unionId` 匹配 active executive → 注入完整组织会话。成功会话标记 `loginMode=local-online-account`，随后进入与生产相同的业务路由。任一校验失败都返回稳定错误，不回退硬编码身份；非本地主机完全跳过这段逻辑。

业务权限判断以明确的 `executive` 角色优先于部门展示字符串。一个人在钉钉中属于多个部门时，组织缓存可能以“部门 A / 部门 B”保存；最高权限账号不能因为该展示字段不是单一“总经办”而被供应链、数据中心或店铺运营 API 拒绝。

公共路径包含登录启动、回调、嵌入登录、会话查询、退出、登录配置，以及使用独立 Bearer 令牌认证的生产数据网关和环境就绪接口。公共路径不等于匿名访问：生产数据路由必须在路由内部验证个人令牌哈希、钉钉稳定身份和能力。新增公共接口必须进行安全评审，不能因为页面调用方便而绕过认证。

## 数据环境路由

认证完成后，`functions/api/_middleware.js` 调用共享数据环境路由，向普通业务请求注入 `controlDb`、`businessDb` 和 `{ id, version, versionRequired }`。顺序固定为：正式控制库读取会话 → active executive 解析 HttpOnly 环境授权 → 校验展示状态与版本 → 选择业务 D1 → 非只读请求校验 `X-Data-Environment-Version` → 进入业务路由。没有有效授权时使用正式业务库；展示库维护、失败、禁用、缺绑定或版本落后时直接失败，不回退正式库。

数据环境中间件不改变业务权限，也不接受浏览器提交的 binding、数据库 ID 或目标库。业务存储只能使用注入的 `businessDb`；认证、凭证、环境控制、采集控制任务、生产修复与 AI 控制审计等 allowlist 路径继续显式使用 `controlDb`。响应只增加安全的环境 ID 与版本头，不记录 Cookie、授权原值、D1 ID 或业务内容。

采集写入在控制库任务中固化目标环境和版本，再把标准事实写入选定业务库；展示版本过期则拒绝。外部写动作在展示环境进入共享模拟器，模拟器仍执行输入、权限和幂等校验，但不得解析 Provider 凭据或发出网络写请求。AI 配置、租约和用量写控制库，Context 与业务 Skill 读取 `businessDb`。

## 会话能力

`functions/api/auth/_shared/session.js` 管理 Cookie 会话、令牌哈希、员工身份和有效期。原始会话令牌不能持久化或写入日志。

`functions/api/platform/_shared/credentialVaultAuthorization.js` 只判断凭证动作、业务范围和 reveal 的 15 分钟近期登录要求；不读取密文、不执行加解密、不写审计。`credentialVaultHttp.js` 只构造禁止缓存的安全响应和稳定错误结构，不记录请求体。

## 外部平台共享适配

- `functions/api/dingtalk/_shared/dingtalk.js`：钉钉 Token、组织、待办、日历、文档和会议数据的共同请求与响应处理。
- `functions/api/kuaimai/_shared/kuaimai.js`：快麦签名、订单与商品分页、组合详情和日聚合。商品列表最多 200 条/页，组合详情每批最多 30 条并返回游标；任一列表页失败时不返回完整标记，平台目录不得提交半批。订单库存单位编码只校验非空和长度，不按 69 码格式过滤内部唯一码。
- `functions/api/platform/v1/product-catalog/_shared/http.js`：商品目录会话、维护权限、成本字段裁剪和统一错误响应。执行顺序为公司会话 → 维护权限（写请求）→ D1 能力 → 输入/提供商读取 → 幂等写入；只记录安全错误码，不记录文件原行或快麦原始响应。
- `functions/api/platform/_shared/environmentReadiness.js`：环境识别、变量/绑定/表存在性检查和脱敏响应；无外部副作用，不重试。
- `functions/api/platform/_shared/productionDataAccess.js`：共享个人令牌哈希、能力与组织身份校验，并为运维修复网关提供短时解锁、快照和审计；写入前置于业务状态写入，失败时业务写入不得继续。

生产数据访问顺序固定为：D1 可用 → 个人令牌哈希有效 → 钉钉 `userId/unionId` 仍为 active executive → 能力存在 → 写入解锁有效 → 基线版本一致 → 快照与 pending 审计成功 → 业务写入 → 审计完成。令牌校验不自动重试；相同基线版本冲突返回 409，由用户刷新后重新操作。

## 新中间件要求

每个中间件只承担一种横切责任，并记录输入、输出、执行顺序、副作用、超时、重试、幂等和日志字段。中间件不得包含具体页面或产品阶段判断。

## 目标能力

后续逐步统一请求 ID、错误结构、服务端日志、输入校验和写操作幂等。迁移按路由分批完成，不要求现有接口一次性改写。

`/api/platform/v1/browser-agent/*`、用户洞察 collector 和 ingest 在会话中间件中允许进入路由，由路由使用设备 Bearer Token 完成最终认证。普通公司会话不能代替设备令牌；task credential 只接受一次性 grant。顺序固定为：解析 Bearer → SHA-256 比对 active 设备 → platform scope → 领取任务 → grant 哈希/到期/消费/credentialVersion 校验 → 解密单个连接 → no-store 响应。日志不得记录 Authorization、grant、邮箱、密码或页面内容。
