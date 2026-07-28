# Main / Dev 固定双站 GitOps

## 状态

已实施，2026-07-28。

## 背景

单一 `main` 分支和单一 Pages 项目会让“代码合并”“用户验收”“正式上线”同时发生。临时 Preview
地址不固定，钉钉、公司 Mac 采集器和运维脚本也无法据此建立长期入口。过去的钉钉登录事故进一步
说明：CI 或 Cloudflare 构建成功不能代替固定生产入口的真实请求验收。

## 决策

- `dev` 是固定测试候选分支，`main` 是已验收正式分支。
- 普通功能分支使用 `codex/*`，只允许向 `dev` 提交 PR；正式发布只允许 `dev → main`。
- 固定测试站为 `https://deshan-tiyes-system-dev.pages.dev`，只部署 `dev`。
- 固定正式站为 `https://deshan-tiyes-system.pages.dev`，只部署 `main`。
- 两个 Pages 项目复用同一个 `PRODUCT_FLOW_DB` 与 `DEMO_FLOW_DB`，并要求必要 Secret 名称完整；
  浏览器仍不得直接访问 D1 或 Secret。
- 两站部署后分别验证目标 commit、静态钉钉 OAuth 入口、同源 callback、认证安全状态和 readiness。
  `/api/auth/dingtalk/start` 可以用 `308` 跳到固定同源 `/auth/dingtalk-start`，但 smoke 必须继续读取并
  校验最终静态 HTML；匿名 `/api/auth/session` 可以用 `401` 返回明确的
  `{ authenticated:false, user:null }`，其他跳转目标或认证响应仍失败关闭。
- 测试站使用真实业务数据和真实服务端权限，不是沙箱；试验性写入仍使用本地沙箱。
- 旧项目 `product-flow-system` 已在新双站、钉钉入口和公司 Mac 消费端全部通过后删除；运行时代码
  不再识别旧项目域名或把它作为 OAuth/readiness 入口。

## 发布顺序

1. 功能分支从包含最新 `main` 的 `dev` 创建并向 `dev` 提交 PR。
2. quality 通过并合并后，测试站部署该提交并完成业务验收。
3. 创建唯一合法的发布 PR `dev → main`。
4. 正式站部署后运行独立 smoke/readiness，再宣布上线。
5. 发布完成后确保 `dev` 继续包含 `main`，禁止强制推送或长期分叉。

## 钉钉与 OAuth

- `/api/auth/dingtalk/start` 保持静态 Pages 入口，不在冷路径读取 D1 或凭据保险箱。
- 固定正式站与测试站分别生成同源 callback；临时 branch Preview 只能回到所属固定项目。
- 钉钉移动端/PC 首页指向正式站；安全 redirect/SSO 配置以完整白名单整组维护。
- CI、部署成功和静态页面可访问都不能代替新会话、并发 bootstrap 与真实钉钉登录验收。

## Secret 与数据库

- 不复制业务数据库，不生成新的平台主密钥。
- 新项目只能从受控本地环境复用现有有效 `PLATFORM_CREDENTIAL_MASTER_KEY`；已有保险箱密文时禁止
  自动轮换。
- Secret 值仅通过 Wrangler 标准输入写入 Cloudflare；检查与日志只能输出名称。
- 两项目任一 D1 ID 或必要 Secret 名称漂移时，发布失败关闭。

## 后果

- 开发多一个固定测试站验收阶段，但未经确认的功能不再直接影响正式入口。
- 两站共享真实数据，测试站动作仍可能产生真实业务后果，必须继续遵守服务端授权。
- Cloudflare Pages 项目、GitHub 分支保护、钉钉配置与公司 Mac 消费端成为同一发布链的验收对象。
- 删除旧站是不可逆外部动作；删除前必须保留最后成功 commit 和安全配置摘要，失败时重建项目但不回滚 D1。

## 回滚

- 测试站失败时修复 `dev`，不发布 `main`。
- 正式站失败时使用 Pages 上一成功部署或把修复提交经 `dev → main` 发布。
- 钉钉或采集器异常时恢复已备份配置并继续使用固定正式站；不得重新启用已删除的旧项目域名。
