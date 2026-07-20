# 中间件目录

中间件负责跨路由一致的认证、校验、错误、日志和外部调用策略。业务路由只处理自己的输入、权限和领域操作。

## 当前认证中间件

`functions/api/_middleware.js` 处理 OPTIONS、公共认证路径和公司会话读取。受保护接口没有有效会话时返回 401，并把有效会话放入 `context.data.session`。

本地线上账号认证顺序固定为：回环主机 → `LOCAL_ONLINE_ACCOUNT_MODE=1` → 服务端个人令牌存在 → 生产 D1 可用 → 令牌哈希有效 → 按 HTTP 方法具备 `read` 或 `write` → `userId/unionId` 匹配 active executive → 注入完整组织会话。成功会话标记 `loginMode=local-online-account`，随后进入与生产相同的业务路由。任一校验失败都返回稳定错误，不回退硬编码身份；非本地主机完全跳过这段逻辑。

公共路径包含登录启动、回调、嵌入登录、会话查询、退出、登录配置，以及使用独立 Bearer 令牌认证的生产数据网关和环境就绪接口。公共路径不等于匿名访问：生产数据路由必须在路由内部验证个人令牌哈希、钉钉稳定身份和能力。新增公共接口必须进行安全评审，不能因为页面调用方便而绕过认证。

## 会话能力

`functions/api/auth/_shared/session.js` 管理 Cookie 会话、令牌哈希、员工身份和有效期。原始会话令牌不能持久化或写入日志。

## 外部平台共享适配

- `functions/api/dingtalk/_shared/dingtalk.js`：钉钉 Token、组织、待办、日历、文档和会议数据的共同请求与响应处理。
- `functions/api/kuaimai/_shared/kuaimai.js`：快麦签名、分页、订单标准化和日聚合。
- `functions/api/platform/_shared/environmentReadiness.js`：环境识别、变量/绑定/表存在性检查和脱敏响应；无外部副作用，不重试。
- `functions/api/platform/_shared/productionDataAccess.js`：共享个人令牌哈希、能力与组织身份校验，并为运维修复网关提供短时解锁、快照和审计；写入前置于业务状态写入，失败时业务写入不得继续。

生产数据访问顺序固定为：D1 可用 → 个人令牌哈希有效 → 钉钉 `userId/unionId` 仍为 active executive → 能力存在 → 写入解锁有效 → 基线版本一致 → 快照与 pending 审计成功 → 业务写入 → 审计完成。令牌校验不自动重试；相同基线版本冲突返回 409，由用户刷新后重新操作。

## 新中间件要求

每个中间件只承担一种横切责任，并记录输入、输出、执行顺序、副作用、超时、重试、幂等和日志字段。中间件不得包含具体页面或产品阶段判断。

## 目标能力

后续逐步统一请求 ID、错误结构、服务端日志、输入校验和写操作幂等。迁移按路由分批完成，不要求现有接口一次性改写。
