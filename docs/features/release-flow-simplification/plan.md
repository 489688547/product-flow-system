# 发布往返精简实施计划

## 目标

让一次功能改动从「6 次 CI、3 次合并、1 次人工批准」降到「2 次 CI、1 次合并」，
同时保留 `main` 的全部实质分支保护与固定双站验收顺序。

## 架构方案

判定逻辑集中在 `scripts/check-branch-base.mjs`，按通道分派：发布通道验证树等价，
功能通道保持祖先判定。选择该方案而非 fast-forward 发布，是因为 `main` 开着
`enforce_admins: true` 与 `allow_force_pushes: false` 且必须走 PR，工作流无法直接推送；
实现 fast-forward 需要迁移到 ruleset 并为发布工作流开 bypass actor，代价是削弱正式分支保护。

依赖方向不变：工作流调用 npm scripts，scripts 调用 git，测试直接导入 scripts 的纯函数与判定函数。
判定不访问网络、不读取仓库设置，全部结论来自本地 git 对象与事件环境变量。

## 文件职责

- `scripts/check-branch-base.mjs`（修改）：通道识别、基线解析、两种判定与命令行输出。
- `tests/branch-base.test.mjs`（新增）：用临时 git 仓库复刻发布拓扑验证两条通道与工作流条件。
- `.github/workflows/quality.yml`（修改）：订阅 `edited`；`check:branch-base` 限定 pull_request。
- `.github/workflows/sync-main-to-dev.yml`（删除）：回同步不再需要。
- `tests/sync-main-to-dev-workflow.test.mjs`（删除）：对应被删工作流的验证。
- `package.json`（修改）：`test:release-flow` 指向新测试。
- `AGENTS.md`（修改）：分支基线不变量与声明门重跑方式。
- `docs/decisions/2026-08-08-release-lane-branch-base.md`（新增）：决策与备选方案。

## 接口与契约

- `currentBranch(cwd, env = process.env, runGit = git) -> string`
- `requiredBaseRef(env = process.env, branch = "") -> "origin/<base>"`
- `isReleaseLane(branch, baseRef) -> boolean`
- `checkBranchBase(cwd, env = process.env, options = {}) -> { branch, baseRef, lane, current, reason? }`
  - `options.runGit` 注入 git 执行；`options.refresh` 先 fetch 目标分支。
  - `lane` 取值 `"release"` 或 `"feature"`，为新增字段，调用方可忽略。
  - `current` 为 `false` 时 `reason` 必定存在且包含可直接执行的修复命令。
- 命令行入口退出码：通过为 0，失败为 1。

## 数据迁移

无数据库、持久化状态或外部契约变更，不需要回填与容量评估。
仓库设置侧一次性变更：`main` 的 `required_status_checks.strict` 由 `true` 改为 `false`，
使用窄接口 `PATCH /repos/{owner}/{repo}/branches/main/protection/required_status_checks`，
避免全量 `PUT /protection` 重置未传字段。

## 风险与回滚

- 风险：发布通道放过 `main` 与 `dev` 的真实分叉。
  触发条件为经由发布 PR 之外的路径向 `main` 写入。
  观测方式为发布 PR 上 `check:branch-base` 报出「含有 dev 缺失的改动」。
  该场景已由 `tests/branch-base.test.mjs` 的负向用例覆盖。
- 风险：关闭 `strict` 后发布 PR 的合并预览落后于 `main`。
  本仓库 `main` 只经由唯一发布 PR 前进，不存在并发发布。
  作为补偿，`quality` 继续在 push 到 `main` 时运行以事后确认真实合并结果。
- 风险：`edited` 事件带来额外重跑。
  观测方式为 `quality` 运行次数异常上升；`edited` 只在标题或正文变更时触发，量级可控。
- 回滚步骤：恢复 `sync-main-to-dev` 工作流与旧判定，执行
  `gh api --method PATCH repos/489688547/EC-management-system/branches/main/protection/required_status_checks -F strict=true`。

## 验证命令

- `npm run test:release-flow`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm run check:pr -- --base origin/dev`
- 真实环境：本 PR 在 `dev` 上的 `quality` 运行需通过；合并后下一次 `dev → main`
  发布 PR 不再出现回同步要求。

## 任务顺序

1. 判定逻辑与测试（互为依赖，同一任务交付）。
2. 工作流触发条件与步骤条件。
3. 删除回同步工作流与其测试，并调整 `test:release-flow`。
4. durable 文档反写与决策记录。
5. 仓库分支保护设置变更。
