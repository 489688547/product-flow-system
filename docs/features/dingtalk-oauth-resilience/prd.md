# 钉钉 OAuth 冷启动韧性产品需求

## 问题

生产 Pages Functions 会把业务 API 编译为一个共享 Worker。共享代码增长后，冷实例访问
`/api/auth/dingtalk/start` 曾返回 Cloudflare 1102；同一部署的后续热请求又能成功，导致员工偶发无法进入系统。

## 目标

- 员工访问固定登录地址时不再直接看到 Cloudflare 错误页。
- 登录开始与扫码回调都能吸收冷启动前置失败并自动恢复。
- OAuth state 继续由服务端生成并保存为 HttpOnly、Secure、SameSite=Lax Cookie。
- 生产验收覆盖静态入口、首次 bootstrap 恢复和并发 bootstrap。

## 非目标

- 不改变钉钉应用、回调白名单、员工身份或会话模型。
- 不把应用密钥、OAuth state 或会话令牌写入浏览器存储。
- 不绕过现有 Pages Functions 认证、D1 或钉钉 Provider 适配器。

## 验收

1. `/api/auth/dingtalk/start` 和 `/api/auth/dingtalk/callback` 由 Pages 静态资产承载。
2. 静态页面调用受控 JSON 接口；只对网络、502/503/504 和明确的 Cloudflare 1102 自动重试。
3. 业务校验 4xx、Provider JSON 5xx 不自动重放。
4. 登录开始仍写 HttpOnly state/returnTo Cookie；完成登录仍写服务器会话 Cookie。
5. 部署检查验证静态入口，并在 bootstrap 预热后执行 20 并发请求；每个并发请求按浏览器相同规则有限重试瞬时网络、502/503/504 与 Cloudflare 1102，重试耗尽仍必须失败。
