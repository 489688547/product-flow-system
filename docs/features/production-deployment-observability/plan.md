# 生产部署可观测实施计划

## 目标

让「生产是否跟上 `main`」在任何时刻都可查，并让生产冒烟的失败成为真实信号而不是
对人工部署时机的赌注。

## 架构方案

判定逻辑集中在 `scripts/check-production-drift.mjs`，纯函数 `evaluateDrift` 负责状态机，
`checkProductionDrift` 只负责取页面并委托判定。版本比较复用 `check-deployed-smoke.mjs`
已导出的 `commitFromHtml` 与 `sameCommit`，避免两处对「部署版本」的认定漂移。

不引入第二条部署路径：ACR 轮询发布已经承担部署职责，再加 self-hosted runner 或 CI 直连
ECS 会产生两个互不知情的发布来源。本功能只做观测。

依赖方向：工作流调用脚本，脚本调用公开 HTTP 与 git 只读信息，测试直接导入纯函数。
判定不访问数据库、不读取任何 Secret、不具备写权限。

## 文件职责

- `scripts/check-production-drift.mjs`（新增）：漂移状态机与命令行入口。
- `scripts/check-deployed-smoke.mjs`（修改）：导出 `commitFromHtml` 与 `sameCommit` 供复用。
- `tests/production-drift.test.mjs`（新增）：状态机全分支与两个工作流的约束验证。
- `.github/workflows/production-drift.yml`（新增）：每两小时的只读漂移检查。
- `.github/workflows/deployed-smoke.yml`（修改）：区分目标的等待窗口、`workflow_dispatch`、超时提示。
- `package.json`（修改）：把新测试接入 `test:release-flow`，不产生游离于 `npm test` 之外的测试。
- `AGENTS.md`（修改）：生产发布验证与漂移处理规则。
- `docs/decisions/2026-08-08-production-deployment-observability.md`（新增）：决策与备选方案。

## 接口与契约

- `evaluateDrift(input) -> { status, drifted, ageMinutes?, message }`
  - `status` ∈ `current` | `deploying` | `stale` | `unknown`
  - `undeployedSinceMs` 必须是生产缺失的最老提交时间，不是 `main` HEAD 时间
  - `drifted` 为 `true` 时命令行退出码为 1
  - 缺少有效 `expectedCommit` 或 `undeployedSinceMs` 时抛错
- `oldestUndeployedTimestampMs({ deployedCommit, expectedCommit, runGit }) -> number`
- `checkProductionDrift(input) -> Promise<同上，另含 unreachable>`
  - `fetchImpl` 可注入；抛出的网络异常映射为 `unreachable` 而非向上传播
- `DEFAULT_GRACE_MINUTES = 60`
- 命令行：`--url`、`--commit`、`--grace-minutes`；未部署时长由脚本自行从 git 历史解析；
  退出码 0 表示不漂移，1 表示漂移或判定失败。

## 数据迁移

无数据库、持久化状态或外部契约变更。不新增任何仓库 Secret，不新增运行时依赖。

## 风险与回滚

- 风险：宽限期 60 分钟内的断链不会被报出。这是为避免发布当下误报的有意取舍，
  发布当下的 20 分钟冒烟窗口覆盖了这段时间的主要场景。
- 风险：漂移工作流若以浅克隆检出，生产所在 commit 不在历史中，未部署时长会退化为按发布
  提交计时。因此工作流固定 `fetch-depth: 0`，并由测试覆盖退回路径。
- 风险：漂移检查误判导致计划任务红灯。最坏后果仅为一个红色只读作业，
  它没有 `contents: write` 也没有部署能力。
- 风险：生产站改版导致 `pfs-release-commit` 元信息缺失。此时判定为 `unknown` 并失败，
  属于失败关闭，不会静默放过。
- 观测方式：`production-drift` 作业结论与作业摘要中的单行结论。
- 回滚步骤：把 `deployed-smoke` 窗口改回 30 次 × 10 秒，删除 `production-drift.yml`、
  `scripts/check-production-drift.mjs`、`tests/production-drift.test.mjs`，
  并从 `test:release-flow` 移除该测试。

## 验证命令

- `npm run test:release-flow`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm run check:pr -- --base origin/dev`
- 真实环境：对生产站执行一次
  `node scripts/check-production-drift.mjs --url https://deshan-tiyes.cn --commit <main> --commit-timestamp <ts>`，
  确认输出的状态与生产站当时的实际部署版本相符。

## 任务顺序

1. 导出版本比较函数并实现漂移状态机与测试。
2. 新增漂移检查工作流。
3. 调整固定站点冒烟的等待窗口、触发方式与超时提示。
4. 把新测试接入 `test:release-flow`。
5. durable 文档反写与决策记录。
