# 钉钉 OAuth 使用静态韧性入口

## 背景

Pages 文件式 Functions 会生成共享 Worker。生产在 2026-07-28 再次出现
`/api/auth/dingtalk/start` 冷请求 Cloudflare 1102、后续热请求 302 的现象。只移除 start 路由中的
D1 查询无法阻止共享 Worker 继续增长，也不能保护扫码返回的 callback。

## 决策

- `/api/auth/dingtalk/start` 与 `/api/auth/dingtalk/callback` 作为静态 Pages 路由，不启动共享 Worker。
- 静态页调用 `/bootstrap` 与 `/complete` JSON 路由；浏览器只对明确的基础设施前置失败进行有限重试。
- state、returnTo 与 session Cookie 全部继续由服务端生成，保持 HttpOnly。
- 保留旧 start/callback Function 作为本地开发与快速回滚兼容，不作为生产公开入口。
- 生产就绪检查在要求 `dingtalk` 时验证静态入口、一次冷启动恢复和默认 20 并发 bootstrap。

## 后果

员工不再直接看到共享 Worker 的冷启动错误页。业务校验或钉钉 Provider 错误仍原样呈现，不会被错误重放。
若未来拆分独立认证 Worker，可以保持静态页面契约，仅替换 JSON 服务实现。
