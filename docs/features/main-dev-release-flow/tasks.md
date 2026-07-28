# Main / Dev 双站发布执行任务

## 执行规则

- 对应研发待办：DEV-000010。
- 当前认领分支：`codex/main-dev-release-flow`。
- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。
- 旧 Pages 项目只在全部前置任务通过后删除。

## 任务

- [x] 建立 PR 分支流向门禁
  - 依赖：无。
  - 文件：`scripts/check-pr-branch-flow.mjs`、`tests/pr-branch-flow.test.mjs`、`.github/workflows/quality.yml`。
  - 输入：GitHub pull request event。
  - 输出：只允许 `codex/* → dev` 和 `dev → main`。
  - 失败测试：`node --test tests/pr-branch-flow.test.mjs`，预期模块不存在或非法流向未被拒绝。
  - 实现步骤：纯函数验证；CLI 读取 event；quality workflow 调用。
  - 验证：聚焦测试和 `npm run check:governance`。
  - 提交：`feat(release): enforce dev promotion lane`。
  - 结果：2026-07-28，分支流向测试 3/3 与治理检查通过。

- [x] 建立双 Pages 项目环境契约
  - 依赖：分支流向门禁。
  - 文件：`scripts/check-pages-environment-parity.mjs`、`scripts/configure-pages-environment-parity.mjs`、对应测试。
  - 输入：正式/测试项目配置、Secret 名称、环境能力清单。
  - 输出：项目间 D1 和必要 Secret 一致性检查。
  - 失败测试：双项目 D1 或 Secret 漂移时现实现仍通过。
  - 实现步骤：扩展解析接口；比较项目；CLI 使用固定项目名。
  - 验证：聚焦测试和环境能力检查。
  - 提交：`feat(platform): verify two Pages projects`。
  - 结果：2026-07-28，双项目 D1/Secret 漂移检查与现有主密钥安全复用测试 16/16 通过，环境能力检查通过。

- [x] 迁移运行时默认域名
  - 依赖：双项目契约。
  - 文件：OAuth、readiness、默认客户端、package scripts 与对应测试。
  - 输入：两个新固定 Origin。
  - 输出：新站同源 OAuth、正确环境识别、无旧站运行依赖。
  - 失败测试：新正式/测试 host 与 callback 断言先失败。
  - 实现步骤：最小替换常量和 host 映射；保留历史验收证据。
  - 验证：OAuth、readiness、数据客户端与 React 聚焦测试。
  - 提交：`feat(runtime): move to deshan fixed hosts`。
  - 结果：2026-07-28，新正式站识别为 production、新测试站识别为 preview；固定站 OAuth callback 保持同源，分支 Preview 回到对应固定站；静态冷启动入口保持不变，55/55 聚焦测试通过。旧站迁移期兼容已在项目删除后移除。

- [x] 增加部署后固定站冒烟
  - 依赖：运行时域名契约。
  - 文件：`scripts/check-deployed-smoke.mjs`、`tests/deployed-smoke.test.mjs`、`.github/workflows/deployed-smoke.yml`。
  - 输入：branch、commit、固定 URL、受控 token。
  - 输出：commit、首页、OAuth、认证和 readiness check。
  - 失败测试：错误 commit、callback、OAuth 状态或 readiness 必须失败。
  - 实现步骤：实现只读检查；workflow 映射 main/dev。
  - 验证：聚焦测试、Functions build、治理检查。
  - 提交：`feat(release): add fixed-site smoke checks`。
  - 结果：2026-07-28，构建产物写入发布 commit；冒烟检查验证固定站 commit、静态 OAuth 入口、同源 callback、会话安全状态和 readiness，错误 commit/callback/阻断能力均会失败，9/9 聚焦测试及构建/治理检查通过。

- [x] 反写长期平台规则
  - 依赖：代码契约稳定。
  - 文件：ADR、`AGENTS.md`、feature Skill、Cloudflare 说明、集成注册表、本文件。
  - 输入：已验证分支与环境契约。
  - 输出：后续开发必须执行的 main/dev GitOps 规则。
  - 失败测试：治理/集成生成物检查识别旧规则。
  - 实现步骤：更新 durable rule；生成清单；记录回滚。
  - 验证：`npm run generate:platform-manifests`、治理、集成、环境能力检查。
  - 提交：`docs(platform): define main dev GitOps`。
  - 结果：2026-07-28，ADR、仓库规则、feature workflow、Cloudflare 操作说明与集成注册表均已反写；静态 OAuth 冷启动契约与双固定站验收规则保持一致。

- [x] 创建 `dev` 与两个 Git 集成 Pages 项目
  - 依赖：本地质量门禁通过。
  - 文件：GitHub 与 Cloudflare 远程配置。
  - 输入：同一仓库、`main`、`dev`、现有 D1 和 Secret。
  - 输出：两个固定自动部署站点。
  - 失败测试：远程环境一致性检查在项目缺失时失败。
  - 实现步骤：创建 dev；配置保护；连接两个项目；复制配置。
  - 验证：两站 deployment、commit、OAuth 与 readiness。
  - 提交：远程状态，不生成含秘密文件。
  - 结果：2026-07-28，`dev`/`main` 分支保护已建立，`deshan-tiyes-system-dev` 与
    `deshan-tiyes-system` 分别固定部署 `dev` 与 `main`，共享受治理 D1 绑定和必要 Secret 名称；
    GitHub quality、Cloudflare Git deployment 与两站 smoke/readiness 均通过。

- [x] 切换本机消费者和钉钉
  - 依赖：两个新站完全就绪。
  - 文件：共享 `.env`、两个 LaunchAgent、钉钉产品全流程应用配置。
  - 输入：新正式/测试 URL 与已确认应用 ID。
  - 输出：本地服务、采集器、钉钉首页与安全配置不再依赖旧站。
  - 失败测试：切换前旧网址扫描必须命中；切换后活动配置命中数为零。
  - 实现步骤：备份；本机配置；DWS dry-run；执行；版本发布；真实登录。
  - 验证：采集器心跳、PC/移动工作台、浏览器 OAuth。
  - 提交：只提交仓库配置；本机和钉钉变更记录安全摘要。
  - 结果：2026-07-28，共享 `.env` 与两个稳定路径 LaunchAgent 已改用新正式站；公司 Mac 网页采集器
    在线。钉钉移动端/PC 首页、redirect 与 SSO 已切换到新双站，正式站和测试站真实总经办登录通过。

- [x] 删除旧 Pages 项目并完成验收
  - 依赖：本机和钉钉真实验收通过。
  - 文件：Cloudflare 远程项目、DEV-000010 验收记录。
  - 输入：最终依赖扫描、两站验证证据。
  - 输出：旧站不可用，新正式/测试站持续可用。
  - 失败测试：任一旧依赖或新站阻断时不得删除。
  - 实现步骤：最终扫描；记录最后成功 commit 与安全配置摘要；完整门禁；删除旧项目；双站复验；提交验收。
  - 验证：Definition of Done、Functions build、两站 smoke/readiness、钉钉与采集器。
  - 提交：更新任务证据和研发待办状态。
  - 结果：2026-07-28，先保留最后成功部署并按 Cloudflare 官方高部署量项目清理流程删除 491 个历史部署，
    随后删除旧项目 `product-flow-system`；Cloudflare 仅剩两个固定项目，旧 URL 不可用，新双站与
    production readiness 复验通过。运行时旧域名识别逻辑及迁移期文案已清除。
