# 架构决策：本地代码使用真实线上账号与平台能力

## 状态

已接受；2026-08-07 由 ECS 核心开发者个人文件方案修订，原 Cloudflare remote Worker
与一次性传输密钥实现不再使用。

## 背景

项目当前只有一名开发者，线上尚无其他业务用户。旧本地实现同时存在硬编码最高权限身份、只读远程 D1 预览和阻断外部动作的 Node 模拟 API，导致本地与部署后的身份、数据、路由和提供商行为不同，功能必须上线后才能完整验证。

产品负责人明确授权自己的本地开发账号按线上最高权限账号使用，包括生产 D1 读写、钉钉待办与日历、快麦同步等真实动作。唯一允许的运行差异是代码是否已经部署。

## 决策

- `npm start` 读取固定的仓库外个人文件；文件不存在时运行零 Secret 本地 SQLite
  沙箱，存在且通过 0600/所有者/HTTPS 校验时运行核心开发模式。
- 核心开发模式只启动 8127 Vite。本机 Node 代理把 `/api` 转发到已部署 ECS 正式 API，
  注入个人 `core_developer` Token 并删除浏览器 Origin/Referer；Token 不进入 React、响应或日志。
- ECS 中间件对每个请求重新校验 Token 哈希、read/write 能力以及 active 的稳定
  `userId/unionId`。核心能力获得 effective executive 数据角色，同时保留实际组织角色。
- 所有数据及外部动作继续经过已部署后的相同路由、版本、幂等、审计和 Provider 权限。
  平台凭据查看和授权仍要求各自的近期登录及最高权限，不因核心开发 Token 放宽。
- `npm run start:sandbox` 始终强制本地 Functions 与 SQLite。未部署的后端改动必须在
  沙箱或固定 ECS 测试环境验证，核心模式只能验证本地前端与已部署后端。
- 既有生产数据网关保留为运维修复旁路，其 15 分钟解锁、版本、快照、审计和回滚规则不变。

## 备选方案

1. 继续使用只读本地预览：无法验证写入和外部动作，已拒绝。
2. 为本地单独实现钉钉和快麦代理：会形成第二套 API 与权限，长期必然漂移，已拒绝。
3. 让浏览器持有个人令牌：暴露面过大，已拒绝。
4. 复制生产数据到测试库：不满足当前实时开发与直接修正的效率目标，未采用。

## 后果

收益是核心成员无需配置数据库或共享 Secret，即可用本地前端验证正式数据链路。限制是
未部署后端代码不会进入该链路。风险是本地前端可直接改变生产数据；通过个人文件、稳定
身份、服务端 Token、Origin 防护以及业务原有版本与审计规则控制。自动化测试不得在核心
模式创建无业务意义的正式数据或外部对象。

2026-07-25 的补充决策移除了线上模式中的 Miniflare 远程 D1 代理。生产 Pages 和 D1 健康而本地代理间歇断连时，不再通过客户端重试掩盖运行时缺陷；启动器只有在远程 API 连续通过真实会话检查后才开放页面。

## 回滚

撤销 `production_data_access_tokens` 中的个人令牌或删除个人 `developer.env` 可立即关闭
本地身份。应用回滚时恢复旧启动器与中间件；没有数据迁移需要回退。

## 关联

- PRD：`docs/features/environment-parity-production-data/prd.md`
- 设计书：`docs/features/environment-parity-production-data/design.md`
- 环境能力：`docs/platform/environment-capabilities.json`
- 中间件：`docs/platform/middleware.md`
- 集成边界：`docs/platform/integrations.md`
