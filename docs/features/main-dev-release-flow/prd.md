# Main / Dev 双站发布流程 PRD

## 文档状态

- 状态：已评审
- 负责人：总经办 / 产品负责人
- 对应研发待办：DEV-000010
- 开发分支：`codex/main-dev-release-flow`
- 最近更新：2026-07-28

## 背景与问题

当前 GitHub `main` 的每次合并都会直接触发唯一的 Cloudflare Pages 项目
`product-flow-system` 上线。功能分支也会生成大量临时 Preview 地址，用户很难判断
哪个网址代表正式版、哪个提交正在测试。过去一小时内正式项目连续产生多次部署，
任一尚未验收的合并都可能立刻影响正式入口。

用户确认采用固定双站发布：

- 正式站：`https://deshan-tiyes-system.pages.dev`，只部署 `main`。
- 测试站：`https://deshan-tiyes-system-dev.pages.dev`，只部署 `dev`。
- 功能分支先合并到 `dev`；用户在固定测试站验收后，只有 `dev` 可以合并到 `main`。
- 两站共享真实 `PRODUCT_FLOW_DB`、独立展示 `DEMO_FLOW_DB`、平台连接保险箱和真实外部
  Provider 路由，不新建测试业务数据库。
- 旧站 `https://product-flow-system.pages.dev` 在新站、钉钉入口和采集器全部验证后直接停用，
  不保留长期跳转。

## 目标

- 建立不会混淆的固定正式站和固定测试站。
- 未经测试站验收的代码不能进入 `main`。
- `main` 只保存已验收的最新正式版本，构建失败时不替换上一个成功部署。
- `dev` 的每次有效更新自动部署到测试站，不依赖人工上传。
- 两站读取和写入同一套真实业务数据，并通过相同认证、授权、幂等和 Provider 适配器执行真实动作。
- 自动检查两站首页、OAuth 启动、认证、D1、钉钉和受影响平台 readiness。
- 清除运行时、钉钉应用、本机采集器和服务器配置对旧网址的依赖后停用旧项目。

## 非目标

- 不新增测试数据库，不复制生产业务数据。
- 不把展示数据库当测试环境。
- 不允许功能分支直接部署正式站。
- 不用 Wrangler 直接上传代替 GitHub 与 Cloudflare Git 集成。
- 不修改快麦、钉钉或其他 Provider 的业务授权规则。
- 不删除历史验收文档中作为证据保存的旧部署 URL。

## 用户与权限

- 产品负责人在测试站完成业务验收，并决定是否允许 `dev → main`。
- 开发者通过 `codex/*` 功能分支向 `dev` 提交 Pull Request。
- `main` 和 `dev` 均受 GitHub 分支保护、自动质量检查和 Cloudflare 部署检查约束。
- Cloudflare 项目、D1 绑定、Secret 和钉钉开放平台配置只由现有授权管理身份修改。
- 测试站仍要求真实钉钉登录；数据和外部动作权限完全由服务端真实会话决定。

## 当前流程

1. 功能分支直接向 `main` 提交 PR。
2. 合并后 Cloudflare 立即更新 `product-flow-system.pages.dev`。
3. 用户常在生产部署后才发现页面打不开、配置不一致或功能未验收。
4. 分支 Preview 地址不固定，且可能使用不同 Secret 配置。
5. 钉钉工作台、OAuth、本机采集器和默认脚本都依赖旧网址。

## 目标流程

1. 功能分支从最新 `dev` 创建，且 `dev` 必须包含最新 `main`。
2. 功能 PR 只能以 `dev` 为 base；质量检查通过后合并。
3. Cloudflare 自动把 `dev` 部署到 `deshan-tiyes-system-dev.pages.dev`。
4. 用户在测试站使用真实账号、真实 D1 和真实 Provider 路由验收。
5. 验收通过后创建唯一允许的发布 PR：`dev → main`。
6. `main` 保护检查确认来源分支、质量、Cloudflare 构建和测试站冒烟证据。
7. 合并后 Cloudflare 自动把同一提交部署到 `deshan-tiyes-system.pages.dev`。
8. 正式站部署后执行独立冒烟和 readiness；成功后 `dev` 与 `main` 再次同步。

## 业务规则

- `main` 表示最新已验收正式版本，不表示所有尚未验收开发提交。
- `dev` 必须始终包含当前 `main`，不得长期分叉或强制推送。
- 普通 PR 的 base 必须是 `dev`；base 为 `main` 时 head 必须精确等于 `dev`。
- `main` 和 `dev` 禁止直接推送、强制推送和删除。
- 正式站项目只构建 `main`，测试站项目只构建 `dev`；其他分支不由这两个固定项目自动部署。
- 两个 Pages 项目的 `PRODUCT_FLOW_DB` 和 `DEMO_FLOW_DB` 数据库 ID 必须分别一致。
- 两个 Pages 项目的必要 Secret 名称必须一致，值只通过 Cloudflare Secret 管理。
- 测试站不自动阻止真实外部动作；所有动作必须继续通过与正式站相同的服务端授权和适配器。
- 新站完成前不修改钉钉入口；钉钉真实登录完成前不停止旧站。
- Cloudflare Pages 没有“保留项目但关闭 `pages.dev` 地址”的等价开关；本方案中的“停用旧站”
  指在最终验收后删除旧 Pages 项目。删除前必须保存安全配置摘要和最后成功 commit，不导出 Secret。
- 旧站删除后不做静默回退；任何残留依赖必须在删除前清零。

## 数据定义

- 正式业务/控制数据库：`PRODUCT_FLOW_DB`，现有数据库 ID 不变。
- 展示业务数据库：`DEMO_FLOW_DB`，现有数据库 ID 不变且与正式库不同。
- 正式代码分支：`main`。
- 测试候选分支：`dev`。
- 功能分支：`codex/*`。
- 正式 Pages 项目：`deshan-tiyes-system`。
- 测试 Pages 项目：`deshan-tiyes-system-dev`。
- 旧 Pages 项目：`product-flow-system`，迁移完成后停用。
- 发布提交：同时存在于 `dev` 与 `main`、并在两个固定站点分别通过验收的同一 Git commit。

## 已发现的旧网址依赖

### 必须迁移的运行时依赖

- 钉钉“产品全流程”应用移动端与 PC 首页均为
  `https://product-flow-system.pages.dev/?corpId=$CORPID$`。
- 钉钉登录重定向 URL 与端内免登 URL 需通过开放平台安全配置切换；DWS 当前只支持整组覆盖，
  因此切换时必须显式登记正式站和测试站所需完整列表。
- `functions/api/auth/dingtalk/start.js` 固定正式 Origin，并识别旧项目 Preview 域名。
- `functions/api/platform/_shared/environmentReadiness.js` 用旧域名判断 production/preview。
- `package.json`、`scripts/check-deployed-readiness.mjs` 默认验证旧站。
- `.env.example`、共享 `.env`、`server.mjs` 和 `scripts/data-connection-agent/index.mjs`
  默认把生产数据 API 指向旧站。
- `scripts/check-pages-environment-parity.mjs` 与
  `scripts/configure-pages-environment-parity.mjs` 固定旧 Pages 项目名称。
- 公司 Mac 正在运行的 `com.company.web-data-collector` LaunchAgent 以旧站为 `--base-url`；
  `com.company.kuaimai-erp-collector` 及其备份 plist 也保存旧站。
- `CLOUDFLARE_PAGES.md` 的部署、钉钉工作台和本地 API 说明使用旧站。

### 已核查但未发现运行依赖

- 生产 `/api/state`、`/api/data-center`、`/api/platform/v1/platform-connections`
  的当前响应没有旧网址。
- GitHub Actions Variables 与 Secrets 没有已登记项目级变量。
- Cloudflare 下载配置包含 D1 绑定，但没有保存旧网址变量。

### 保留的历史证据

- 已上线功能的 `tasks.md` 和历史实施计划中的 hash 部署地址属于验收证据，不作为运行配置；
  不批量改写这些历史记录。
- 单元测试中的示例 URL按各测试职责迁移：验证新契约的改为新域名，专门验证旧域名退役行为的保留。

## 异常与边界

- 新 Pages 项目无法连接 GitHub：不修改钉钉，不停止旧站。
- 新项目缺少 Secret 或绑定：readiness 阻断，不允许进入钉钉切换。
- `dev` 站正常但正式站失败：保留旧站和钉钉旧入口，修复后重试。
- 钉钉安全配置无法读取旧列表：只按已确认的完整新列表整组写入，并在 dry-run 后核对；
  未确认前不执行覆盖。
- 钉钉版本发布需要审批人：停在审批选择，不默认选择。
- 采集器切换后无法心跳：立即恢复 plist 备份并重新加载旧地址。
- 旧站删除后发现遗漏：使用已记录的最后成功 commit 重新创建旧 Cloudflare 项目并恢复绑定，
  再修复依赖，不修改 D1 数据掩盖问题。
- `dev` 与 `main` 不同步：阻止新的功能 PR 或发布 PR，先合并 `main → dev`。

## 验收标准

- GitHub 存在受保护的 `dev` 分支，且包含最新 `main`。
- 功能 PR 指向 `main` 时自动失败；`dev → main` 通过来源分支检查。
- 两个 Git 集成 Pages 项目分别只自动部署 `main` 与 `dev`。
- 两个固定站点返回正确资源并报告对应 runtime environment。
- 两站 readiness 对 Cloudflare Pages、D1、钉钉及所有路由平台均无阻断或受影响警告。
- 两站未登录业务接口返回 401，真实登录后读取相同业务事实和账号权限。
- 两站 OAuth 启动在冷/热和 20 并发场景稳定返回 302，callback 使用各自站点 Origin。
- 钉钉工作台移动端和 PC 端进入新正式站；浏览器 OAuth 与端内免登真实成功。
- 两个 LaunchAgent 与共享 `.env` 使用新正式站，本机采集器恢复心跳。
- 全仓库运行代码和活动系统配置不再依赖旧网址。
- 旧 Pages 项目停用后，新正式站、测试站和钉钉入口再次通过验收。

## 上线与回滚

上线严格按以下顺序执行：

1. 创建 `dev`，设置 GitHub 分支规则与 CI，但不改变旧正式站。
2. 创建并配置两个新 Pages 项目，复制绑定与 Secret，部署 `main` 和 `dev`。
3. 验证两站首页、API、OAuth、D1、Provider readiness 与并发行为。
4. 更新仓库默认 URL、共享 `.env` 与采集器；验证采集器心跳。
5. 用 DWS dry-run 后更新钉钉网页首页、安全 redirect 和 SSO 列表，按需发布应用版本。
6. 从钉钉工作台和浏览器完成真实登录验收。
7. 删除旧 Pages 项目并再次执行全链路验收。

任一步失败都停在当前步骤。删除前回滚仅需恢复旧配置；删除后回滚先按已记录 commit 重建旧 Pages 项目，
再恢复钉钉网页与安全配置、共享 `.env` 和 LaunchAgent，D1 不回滚。
