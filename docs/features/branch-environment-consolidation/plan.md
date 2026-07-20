# 分支功能整合与环境一致性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax in `tasks.md` for tracking.

**Goal:** 将全部有效分支能力整合到最新 `main`，并让本地、Preview、Production 可执行地共享同一个 D1 与平台配置。

**Architecture:** 以最新 `origin/main` 为唯一平台基线，在隔离分支中按业务边界逐个整合唯一提交和未提交业务差异。环境层通过显式 Wrangler Preview/Production 绑定、必要 Secret 声明、启动前分支检查和远程环境核验组成一个共享平台能力；Secret 值只通过忽略文件与 Wrangler 标准输入流传递。

**Tech Stack:** Git worktree、Node.js、Node Test Runner、React/Vite、Cloudflare Pages Functions、D1、Wrangler 4.112、GitHub Actions。

## Global Constraints

- 最新 `main` 的认证、D1、保险箱、集成注册表、环境能力、Skill 和 CI 规则优先于旧分支版本。
- 不提交或输出 Secret、个人令牌、Cookie、手机号和外部平台原始响应。
- 所有生产代码改动先写失败测试并确认失败原因。
- 未提交工作必须先备份，原工作树在确认前不删除。
- 不自动创建真实钉钉待办、日历或快麦写操作。
- 每个任务只提交自己的文件；生成发布资产在源代码稳定后统一重建。

## 文件职责

- `scripts/check-branch-base.mjs`：验证任何当前分支（包括本机名为 `main` 的分支）是否包含最新 `origin/main`，可选择先刷新远端引用。
- `scripts/start-local-online.mjs`：启动子进程前执行最新分支基线检查。
- `scripts/check-pages-environment-parity.mjs`：静态校验 Wrangler 三环境 D1 契约，以环境能力清单推导必要 Secret，并在 `--remote` 下核对 Cloudflare Preview/Production 的绑定和 Secret 名称。
- `scripts/configure-pages-environment-parity.mjs`：在保险箱为空的前提下生成共享主密钥，以标准输入设置 Preview/Production Secret，不打印值，并更新被忽略的本地 `.env`。
- `wrangler.toml`：显式声明本地、Preview、Production 的同一 D1；Pages 不支持 Wrangler Secret 段，Secret 名称保留在环境能力清单。
- `tests/branch-base-check.test.mjs`：覆盖主分支分叉、普通分支落后、最新分支和刷新失败。
- `tests/pages-environment-parity.test.mjs`：覆盖 D1 ID 漂移、缺失 Secret、远端解析和敏感值不出现在结果中。
- `tests/configure-pages-environment-parity.test.mjs`：覆盖保险箱非空中止、Secret 走 stdin、`.env` 安全更新和幂等执行。
- `docs/features/branch-environment-consolidation/`：保存 PRD、设计、计划和任务证据。
- `docs/platform/`、`docs/decisions/`、`AGENTS.md`、`.agents/skills/`：记录长期环境和分支规则。
- 各业务分支涉及的 `src/`、`functions/`、`migrations/` 和测试：按现有模块边界整合，不创建并行实现。

## 接口与契约

- `checkBranchBase(cwd, env, options)` → `{ branch, baseRef, current, reason }`；`options.refresh=true` 时先执行 `git fetch origin main`，刷新失败返回可解释错误。
- `assertPagesEnvironmentParity(wranglerSource)` → `{ databaseId, requiredSecrets }`；任何环境 D1 或 Secret 声明不一致时抛出只含名称的错误。
- `inspectRemotePagesParity({ projectName, run })` → `{ preview, production, sameDatabase, missingSecrets }`；`run` 由测试注入，生产实现调用 Wrangler。
- `configurePagesEnvironmentParity({ envPath, projectName, run, randomBytes })` → `{ configuredEnvironments, configuredNames }`；Secret 值只写入子进程 stdin，返回值只包含名称。
- 分支整合清单项：`{ branch, commit, decision, evidence }`，写入 `tasks.md` 的实际结果，不新增业务数据库表。

## 数据迁移

- 不新增 D1 表，不改变现有业务数据结构。
- 设置共享主密钥前执行 `SELECT COUNT(*) AS count FROM platform_credentials`；结果必须为 0。
- 当计数为 0 时，生成一个 32 字节 base64url 密钥并设置到本地、Preview、Production。
- 当计数非 0 时脚本退出且不修改任何环境；后续必须另立密钥轮换 PR。
- 钉钉和快麦 Preview Secret 从本地被忽略的 `.env` 读取；Production 既有提供商 Secret 不覆盖。

## 风险与回滚

- 旧分支回灌平台规则：冲突时保留最新 `main` 的平台文件，只手工移植业务差异；聚焦测试确认。
- 大分支冲突：一次只整合一个模块并形成独立提交，可通过撤销该整合提交回滚。
- 未提交内容丢失：备份文件保存在仓库外且原工作树不删除，直到对应任务验证完成。
- Secret 设置错误：Preview 先验证；保险箱为空时主密钥可重新统一。任何值不进入日志。
- Production 回归：回滚 Pages 部署；D1 无结构变更，现有记录保持。

## Task 1: 锁定最新分支启动门禁

**Files:**
- Create: `tests/branch-base-check.test.mjs`
- Modify: `scripts/check-branch-base.mjs`
- Modify: `scripts/start-local-online.mjs`
- Modify: `tests/local-online-start.test.mjs`

**Interfaces:**
- Produces: `checkBranchBase(cwd, env, { refresh, runGit })`，供 CLI 和本地启动器复用。

- [ ] 写失败测试：临时 Git 仓库中本地 `main` 落后 `origin/main` 时必须失败；普通分支包含最新 main 时通过；fetch 失败时返回中文原因。
- [ ] 运行 `node --test tests/branch-base-check.test.mjs tests/local-online-start.test.mjs`，预期因 `main` 直接放行且启动器未检查而失败。
- [ ] 移除 `branch === "main"` 无条件通过，增加可注入的 fetch 与祖先检查；在启动器检查通过后才读取 `.env` 和启动端口。
- [ ] 重跑聚焦测试，预期全部通过；提交 `fix(dev): block stale local runtimes`。

## Task 2: 建立三环境 Pages 契约

**Files:**
- Create: `tests/pages-environment-parity.test.mjs`
- Create: `scripts/check-pages-environment-parity.mjs`
- Modify: `wrangler.toml`
- Modify: `package.json`
- Modify: `tests/environment-capabilities.test.mjs`

**Interfaces:**
- Produces: `assertPagesEnvironmentParity`、`parsePagesSecretList`、`inspectRemotePagesParity`。

- [ ] 写失败测试：顶层、Preview、Production 任一 D1 ID 不同时失败；环境清单必须推导出 `PLATFORM_CREDENTIAL_MASTER_KEY`、钉钉及快麦必要 Secret；错误不得包含模拟 Secret 值。
- [ ] 运行 `node --test tests/pages-environment-parity.test.mjs tests/environment-capabilities.test.mjs`，预期因脚本和环境段缺失失败。
- [ ] 实现静态解析和远端 Wrangler 检查；在 `wrangler.toml` 三处声明相同 D1，以环境清单作为必要 Secret 名称来源；新增 `check:pages-environment-parity`。
- [ ] 运行聚焦测试和 `npm run check:pages-environment-parity`，预期通过；提交 `feat(platform): enforce Pages environment parity`。

## Task 3: 安全配置共享主密钥与 Preview Secret

**Files:**
- Create: `tests/configure-pages-environment-parity.test.mjs`
- Create: `scripts/configure-pages-environment-parity.mjs`
- Modify: `.env.example`
- Modify: `package.json`

**Interfaces:**
- Produces: `configurePagesEnvironmentParity`；运维入口 `npm run configure:pages-environment-parity`。

- [ ] 写失败测试：保险箱计数非零时零写入；计数为零时主密钥恰为 32 字节、所有 Secret 只经 stdin、返回与日志不含值、本地 `.env` 重复执行不产生重复键。
- [ ] 运行 `node --test tests/configure-pages-environment-parity.test.mjs`，预期脚本缺失失败。
- [ ] 实现最小配置器；Production 仅设置新共享主密钥，Preview 设置共享主密钥和本地已有的钉钉、快麦 Secret；缺少必要本地值时整次中止。
- [ ] 聚焦测试通过后，远程只读检查保险箱行数；为 0 才执行配置器，再运行 `npm run check:pages-environment-parity -- --remote`。
- [ ] 提交 `feat(platform): configure shared Preview secrets`，提交中不包含 `.env`。

## Task 4: 保护并登记所有现存工作

**Files:**
- Modify: `docs/features/branch-environment-consolidation/tasks.md`
- External backup only: `/Users/roger/Documents/product-flow-system-branch-backups/2026-07-20/`

**Interfaces:**
- Produces: 每个分支和未提交差异的备份路径、提交哈希与整合结论清单。

- [ ] 记录所有本地分支、工作树、ahead/behind、dirty 文件和唯一提交。
- [ ] 对真实 dirty 文件生成二进制 patch 和未跟踪文件归档；忽略 `.DS_Store` 与 `.impeccable/`，但记录排除原因。
- [ ] 用 `git apply --check` 在临时目录验证每份 patch 可读；不修改原工作树。
- [ ] 更新 `tasks.md` 清单并提交 `docs: inventory branch consolidation`。

## Task 5: 整合供应链与跨平台修复

**Files:**
- Modify: existing `src/features/supply-chain/**`, `src/domain/**`, `src/state/**`, `functions/api/supply-chain/**`, `functions/api/dingtalk/**`, migrations and matching tests only as required by the reviewed diffs.
- Source refs: local `main` unique goods-flow commits; `codex/fix-dingtalk-supplier-categories`; `codex/hotfix-supply-sync-limit`; `codex/supply-chain-management-app`; `codex/sync-dingtalk-suppliers`.

**Interfaces:**
- Produces: goods flow、盘点与现金周期、审批批量同步、待办编辑、供应商快照导入的统一供应链实现。

- [ ] 先运行并记录现有供应链、钉钉同步测试；为每个尚未在 main 出现的行为补失败测试。
- [ ] 从本机分叉 `main` 提取 13 个 goods-flow 唯一提交到独立恢复引用，按提交顺序整合业务文件；平台文件冲突保留当前整合分支版本。
- [ ] 依次整合四个供应链修复/功能分支，每个分支后运行 `node --test tests/supply-chain-api.test.mjs tests/dingtalk-sync.test.mjs tests/dingtalk-todo-update.test.mjs tests/dingtalk-todo-list.test.mjs` 和相关 React 测试。
- [ ] 更新迁移、产品及平台文档，生成环境模块；提交按 goods flow、同步修复、供应商导入分开。

## Task 6: 整合数据中心与产品目录

**Files:**
- Modify: existing `src/features/data-center/**`, `src/state/DataStandardsProvider.jsx`, `functions/api/platform/v1/data-standards.js`, `functions/api/data-center/**`, `src/ui/Modal.jsx`, styles, migrations and matching tests.
- Source refs: `codex/data-center-app` commits and dirty backup; `codex/product-catalog-data-hub`.

**Interfaces:**
- Produces: 数据标准 CRUD、指标标准与结果版本、归档审计、产品目录统一数据源。

- [ ] 为产品目录和数据标准未覆盖行为先补失败测试，确认当前整合分支失败。
- [ ] 合并 `codex/product-catalog-data-hub` 的唯一功能，避免把旧共享文件整体覆盖当前 main。
- [ ] 合并 `codex/data-center-app` 已提交功能，再逐文件应用已验证 dirty patch；`Modal` 和全局样式以当前共享组件 API 为基线适配。
- [ ] 运行 `node --test tests/data-center-api.test.mjs tests/platform-api.test.mjs`、数据中心 React 测试、lint 和构建；按产品目录、数据标准、指标编排分开提交。

## Task 7: 整合部署与状态修复，重建生成资产

**Files:**
- Source refs: `codex/company-strategy-platform`, `codex/stale-chunk-recovery`, `codex/release-brand-content-assets`, dirty backup from `codex/cloudflare-wrangler3-compat`.
- Modify: only current deployment recovery, state sharding, Pages compatibility code/tests/docs that are not already equivalent in main.
- Regenerate: `assets/**`, `cloudflare-entry.html`, `404.html`, `public/404.html` through repository scripts.

**Interfaces:**
- Produces: 对每个历史修复的 `integrated` 或 `equivalent_in_main` 证据，以及与最终源码匹配的发布资产。

- [ ] 使用测试和 patch-id 比较状态分片、旧 chunk 恢复及 Wrangler 兼容行为；已有等价实现只记录证据，不重复代码。
- [ ] 对缺失行为先写失败测试，再移植最小修复；旧 AGENTS、注册表和发布配置不得覆盖当前版本。
- [ ] 不合并品牌分支的历史生成资产，执行 `npm run release:pages` 从最终源码重建。
- [ ] 运行 chunk、Pages 兼容和部署恢复测试；提交 `fix(deploy): consolidate release recovery` 与生成资产提交。

## Task 8: 反写平台规则并完成全环境验收

**Files:**
- Modify: `AGENTS.md`
- Modify: `.agents/skills/environment-parity/SKILL.md`
- Modify: `.agents/skills/feature-workflow/SKILL.md`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/architecture.md`
- Modify: `docs/platform/integrations.md`
- Modify: `docs/platform/environment-readiness.md`
- Create: `docs/decisions/2026-07-20-branch-environment-parity.md`
- Modify: generated platform modules and feature `tasks.md`.

**Interfaces:**
- Produces: 后续所有功能、分支、CI 和部署共同遵守的环境契约。

- [ ] 先扩展治理测试，使缺少启动门禁、Preview 远程校验或规则反写时失败。
- [ ] 更新 durable docs、Skill、注册表、环境能力和 ADR，运行 `npm run generate:platform-manifests`。
- [ ] 运行 Definition of Done：`npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`、`npm run build`、`git diff --check`。
- [ ] 本地验证最新分支真实会话和 D1；验证落后分支启动被阻止；不创建外部真实对象。
- [ ] 推送 PR，声明 Cloudflare Pages、D1、钉钉、快麦影响和全部 Rule-Writeback 文件；quality 通过后合并。
- [ ] 部署 Preview 与 Production，分别运行就绪检查；确认公网未登录接口 401、共享 D1 和平台能力就绪。
- [ ] 归档已完成且安全备份的旧工作树，保留中的工作树全部包含最新 `main`。

## 验证命令

```bash
node --test tests/branch-base-check.test.mjs tests/local-online-start.test.mjs
node --test tests/pages-environment-parity.test.mjs tests/configure-pages-environment-parity.test.mjs
npm run check:pages-environment-parity
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
```

部署后分别执行 Preview URL 和 Production URL 的 `scripts/check-deployed-readiness.mjs`，要求平台 `cloudflare-pages`、`cloudflare-d1`、`dingtalk`、`kuaimai`。
