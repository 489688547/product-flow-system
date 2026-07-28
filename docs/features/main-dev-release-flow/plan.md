# Main / Dev 双站发布流程实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax in `tasks.md` for tracking.

**Goal:** 建立固定 main 正式站和 dev 测试站，强制功能先经 dev 验收，并在安全迁移钉钉与本机消费者后停用旧站。

**Architecture:** GitHub 负责分支流向与质量门禁，两个 Cloudflare Pages Git 项目分别消费 `main`
和 `dev`。两项目共享现有 D1 与必要 Secret，但分别执行部署冒烟；域名迁移采用先并行、再切消费者、
最后停旧站的顺序，任何失败均保留上一条已验证路径。

**Tech Stack:** GitHub Actions、GitHub branch protection、Cloudflare Pages Git integration、Pages Functions、
D1、Wrangler 4.112、Node.js、DWS 钉钉开放平台命令。

## 全局约束

- 不通过 Wrangler 直接上传完成正式交付。
- 不打印、提交或在 PR 中写入任何 Secret 值。
- 不新增或复制业务数据库。
- 测试站使用真实 D1 与真实 Provider 路由，但不绕过服务端授权。
- 先写失败测试并确认失败，再实现运行代码。
- 新站和钉钉真实登录未通过前，旧站必须保持可用。
- 钉钉安全 redirect/SSO 是整组覆盖；只使用已确认的完整列表。

## 文件职责

- `scripts/check-pr-branch-flow.mjs`：验证 PR 只允许 `codex/* → dev` 与 `dev → main`。
- `tests/pr-branch-flow.test.mjs`：覆盖合法流向、错误 base/head、缺失 event payload。
- `.github/workflows/quality.yml`：在 PR、`dev` 和 `main` 上执行质量检查与分支流向检查。
- `.github/workflows/deployed-smoke.yml`：按 branch 选择固定站点并执行 commit/readiness smoke。
- `scripts/check-deployed-smoke.mjs`：验证首页、OAuth、认证和目标 commit，不执行业务写。
- `tests/deployed-smoke.test.mjs`：覆盖错误站点、错误 commit、OAuth 非重定向和 readiness 阻断。
- `scripts/check-pages-environment-parity.mjs`：比较两个 Pages 项目的 D1 与 Secret 名称。
- `scripts/configure-pages-environment-parity.mjs`：按正式/测试项目分别配置同一套名称，不输出值。
- `tests/pages-environment-parity.test.mjs`：覆盖双项目一致、项目间 D1 漂移和 Secret 缺失。
- `functions/api/auth/dingtalk/start.js`：识别新正式/测试 Origin，并为各自生成 callback。
- `functions/api/platform/_shared/environmentReadiness.js`：识别两个固定站的 production/preview 语义。
- `tests/dingtalk-web-auth.test.mjs`：覆盖新正式站、新测试站和旧站退役。
- `tests/environment-readiness-api.test.mjs`：覆盖固定站环境识别。
- `.env.example`、`server.mjs`、`scripts/data-connection-agent/index.mjs`：默认指向新正式站。
- `package.json`、`scripts/check-deployed-readiness.mjs`：正式验证默认使用新正式站。
- `CLOUDFLARE_PAGES.md`：说明两项目、两分支、钉钉、旧项目删除和重建回滚顺序。
- `docs/platform/integration-registry.json`：登记两个固定站与 main/dev GitOps 能力。
- `docs/decisions/2026-07-28-main-dev-gitops.md`：记录长期分支、部署和旧站退役决策。
- `AGENTS.md`、`.agents/skills/feature-workflow/SKILL.md`：反写新分支起点、PR 流向和验收规则。

## 接口与契约

### `validatePullRequestBranchFlow(event)`

- 输入：GitHub pull request event JSON。
- 输出：`{ valid: true, lane: "feature" | "release" }`。
- 非法时抛出只包含分支名和修复动作的错误。
- 规则：
  - `base=dev` 时 `head` 必须以 `codex/` 开头。
  - `base=main` 时 `head` 必须精确为 `dev`。
  - 其他 base/head 组合全部拒绝。

### `checkDeployedSmoke(options)`

- 输入：`baseUrl`、`expectedCommit`、`accessToken`、`requiredPlatforms`、`fetchImpl`。
- 输出：`{ baseUrl, commit, checkedAt, oauthStatus, readiness }`。
- 检查：
  - `/cloudflare-entry` 或等价公开元数据返回目标 commit。
- `/api/auth/dingtalk/start` 返回静态 HTML 入口，bootstrap 返回钉钉授权地址且 callback Origin 等于当前固定站点。
  - `/api/auth/session` 未登录返回安全未认证响应。
  - `/api/platform/v1/environment-readiness` 使用受控 token 通过。

### `inspectTwoProjectParity(options)`

- 输入：正式项目配置/Secret 名称、测试项目配置/Secret 名称、必要能力清单。
- 输出：两个项目名、两套绑定 ID 安全摘要、缺失 Secret 名称。
- 任何 `PRODUCT_FLOW_DB`、`DEMO_FLOW_DB` 或必要 Secret 名称漂移时阻断。

## 数据迁移

- 无 D1 schema 变更，无业务数据回填。
- 两个新项目绑定现有 `PRODUCT_FLOW_DB` 和 `DEMO_FLOW_DB` 的真实 ID。
- 共享 `.env` 的 `PRODUCTION_DATA_API_URL` 原子替换为新正式站。
- LaunchAgent 修改前保存当前 plist；新采集器心跳成功后才清理临时回滚副本。
- 删除旧 Pages 项目不删除 D1、凭据或会话；删除前记录最后成功 commit 和安全配置摘要，
  Cloudflare 旧部署历史不作为可保留数据。

## 风险与回滚

- **Cloudflare Git 连接失败：** 保留旧站，修复项目连接，不用直接上传替代。
- **双项目 Secret 漂移：** 环境检查失败；只补缺失名称，禁止打印值。
- **OAuth callback 未登记：** 不切钉钉首页；恢复旧安全列表并验证旧站。
- **钉钉版本需要审批：** 等待用户选择实际审批人，不默认提交。
- **采集器离线：** 恢复旧 plist、重新加载 LaunchAgent、确认旧心跳。
- **正式部署运行时失败：** Cloudflare 保留上一成功部署；如已删除旧站则按记录 commit 重建旧项目。
- **分支分叉：** 阻止 PR，先把 `main` 合入 `dev`，禁止 force push。

## 任务 1：建立分支流向门禁

**Files:**
- Create: `scripts/check-pr-branch-flow.mjs`
- Create: `tests/pr-branch-flow.test.mjs`
- Modify: `.github/workflows/quality.yml`

**Interfaces:**
- Produces: `validatePullRequestBranchFlow(event)`。

- [ ] 写测试：`codex/x → dev` 与 `dev → main` 通过，`codex/x → main`、`main → dev` 和其他组合失败。
- [ ] 运行 `node --test tests/pr-branch-flow.test.mjs`，预期因模块不存在失败。
- [ ] 实现纯函数与 CLI，错误信息给出正确 base/head。
- [ ] 重跑聚焦测试和 `npm run check:governance`。
- [ ] 提交 `feat(release): enforce dev promotion lane`。

## 任务 2：建立双项目环境契约

**Files:**
- Modify: `scripts/check-pages-environment-parity.mjs`
- Modify: `scripts/configure-pages-environment-parity.mjs`
- Modify: `tests/pages-environment-parity.test.mjs`
- Modify: `tests/configure-pages-environment-parity.test.mjs`

**Interfaces:**
- Produces: `inspectTwoProjectParity` 和双项目安全配置参数。

- [ ] 写失败测试：正式/测试项目任一 D1 ID 或必要 Secret 名称不一致时阻断。
- [ ] 运行聚焦测试并确认现实现只检查一个项目而失败。
- [ ] 实现双项目下载、解析和比较；输出只含名称与 ID。
- [ ] 重跑聚焦测试和 `npm run check:environment-capabilities`。
- [ ] 提交 `feat(platform): verify two Pages projects`。

## 任务 3：迁移运行时域名契约

**Files:**
- Modify: `functions/api/auth/dingtalk/start.js`
- Modify: `functions/api/platform/_shared/environmentReadiness.js`
- Modify: `tests/dingtalk-web-auth.test.mjs`
- Modify: `tests/environment-readiness-api.test.mjs`
- Modify: `.env.example`
- Modify: `server.mjs`
- Modify: `scripts/data-connection-agent/index.mjs`
- Modify: `package.json`
- Modify: `scripts/check-deployed-readiness.mjs`
- Modify: `tests/deployed-readiness.test.mjs`

**Interfaces:**
- Consumes: 新正式与测试 Origin 常量。
- Produces: 各站同源 OAuth callback 和准确 runtime environment。

- [ ] 写失败测试：新正式站为 production，新测试站为 preview；两站 OAuth callback 保持同源；旧 host 不再作为合法运行 host。
- [ ] 运行聚焦测试并确认旧常量导致失败。
- [ ] 最小替换运行时默认值和 host 判断；历史证据文档不改写。
- [ ] 重跑 OAuth、readiness、本地客户端与相关 React 测试。
- [ ] 提交 `feat(runtime): move to deshan fixed hosts`。

## 任务 4：建立部署后冒烟检查

**Files:**
- Create: `scripts/check-deployed-smoke.mjs`
- Create: `tests/deployed-smoke.test.mjs`
- Create: `.github/workflows/deployed-smoke.yml`

**Interfaces:**
- Produces: `checkDeployedSmoke(options)` 和 `deployed-smoke` GitHub check。

- [ ] 写失败测试：错误 commit、OAuth 静态入口不可用、callback 跨站、readiness blocked 均失败。
- [ ] 运行测试并确认模块不存在。
- [ ] 实现只读 smoke，并按 `main`/`dev` 映射固定 URL。
- [ ] 重跑聚焦测试、Functions build 和 workflow 治理检查。
- [ ] 提交 `feat(release): add fixed-site smoke checks`。

## 任务 5：反写长期规则与操作说明

**Files:**
- Create: `docs/decisions/2026-07-28-main-dev-gitops.md`
- Modify: `AGENTS.md`
- Modify: `.agents/skills/feature-workflow/SKILL.md`
- Modify: `CLOUDFLARE_PAGES.md`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/features/main-dev-release-flow/tasks.md`

**Interfaces:**
- Produces: 分支、Pages、钉钉和旧站停用的持久规则。

- [ ] 更新规则：功能分支从最新 dev 开始且 dev 必须包含 main；功能 PR 到 dev；发布 PR 只允许 dev 到 main。
- [ ] 登记两个固定站、同 D1、独立验证与旧项目 retired 状态转换条件。
- [ ] 运行 `npm run generate:platform-manifests`、治理和集成检查。
- [ ] 提交 `docs(platform): define main dev GitOps`。

## 任务 6：配置 GitHub 与两个 Cloudflare 项目

**External state:**
- GitHub branches and protection rules.
- Cloudflare Pages projects `deshan-tiyes-system` and `deshan-tiyes-system-dev`.

- [ ] 从最新 `main` 创建远端 `dev`。
- [ ] 配置 `dev` 与 `main` 禁止直接/强制推送，并要求 quality、对应 Pages build 和 smoke。
- [ ] 将同一 GitHub 仓库连接两个项目；生产分支分别设为 `main` 与 `dev`，关闭其他分支自动部署。
- [ ] 复制现有 D1 绑定与必要 Secret 名称，运行双项目远程一致性检查。
- [ ] 验证两个固定站 commit、首页、OAuth、认证和 readiness。
- [ ] 记录 deployment ID，不在仓库写入 Secret。

## 任务 7：切换本机消费者与钉钉

**External state:**
- Shared ignored `.env`.
- Company Mac LaunchAgents.
- DingTalk 产品全流程 webapp/security/version configuration.

- [ ] 更新共享 `.env` 的 `PRODUCTION_DATA_API_URL`，不输出值。
- [ ] 备份并修改两个活动 LaunchAgent 的 `--base-url`，重新加载并验证 web collector 心跳。
- [ ] DWS dry-run 网页首页：移动端/PC 指向新正式站。
- [ ] DWS dry-run 安全配置：redirect 与 SSO 完整列表同时包含正式站、测试站所需 URL，不包含旧站。
- [ ] 执行配置；如需版本发布，完成 `version create → check-approval → publish → status`。
- [ ] 从 PC/移动钉钉工作台和普通浏览器分别完成真实登录。

## 任务 8：删除旧站并完成验收

**External state:**
- Cloudflare Pages project `product-flow-system`.

- [ ] 再次扫描仓库运行文件、共享 `.env`、LaunchAgents、DingTalk webapp/security 和当前服务响应。
- [ ] 运行完整 Definition of Done 与 Pages Functions build。
- [ ] 记录旧项目最后成功 commit 与安全配置摘要，然后删除旧 Pages 项目；保留 D1。
- [ ] 对新正式站和测试站分别执行 smoke/readiness，复核钉钉与采集器。
- [ ] 提交 DEV-000010 验收证据并由总经办完成。

## 验证命令

```bash
node --test tests/pr-branch-flow.test.mjs
node --test tests/pages-environment-parity.test.mjs tests/configure-pages-environment-parity.test.mjs
node --test tests/dingtalk-web-auth.test.mjs tests/environment-readiness-api.test.mjs
node --test tests/deployed-readiness.test.mjs tests/deployed-smoke.test.mjs
npx wrangler pages functions build
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

部署后分别执行：

```bash
node --env-file=.env scripts/check-deployed-readiness.mjs \
  --url https://deshan-tiyes-system-dev.pages.dev \
  --require-platform cloudflare-pages --require-platform cloudflare-d1 --require-platform dingtalk

node --env-file=.env scripts/check-deployed-readiness.mjs \
  --url https://deshan-tiyes-system.pages.dev \
  --require-platform cloudflare-pages --require-platform cloudflare-d1 --require-platform dingtalk
```
