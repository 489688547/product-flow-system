# 发布通道分支基线改为树等价判定

## 状态

已实施，2026-08-08。修订 `2026-07-28-main-dev-gitops.md` 的发布顺序第 5 条与分支基线要求，
其余固定双站、OAuth、Secret 与回滚安排不变。

## 背景

`dev → main` 的发布用合并提交落到 `main`，该提交只存在于 `main`。`check:branch-base` 当时要求
「当前分支必须包含最新 `origin/main`」，于是下一个发布 PR 必然失败，必须先合一个回同步 PR 才能继续。
GitHub 侧 `main` 的分支保护同时开着 `required_status_checks.strict`（合并前分支必须是最新的），
在仓库设置层面重复强制同一件事。

实测数据（近 200 个已合并 PR，2026-08-08 统计）：

- 功能 PR 61 个，发布 PR 110 个，回同步 PR 29 个；不带任何代码改动的 PR 占约 70%。
- 改一行代码的完整路径是 6 次 CI、3 次合并、1 次人工批准。
- `quality` 中位耗时约 58 秒、成功率 88%，构建本身不是瓶颈。
- 近 25 次失败中 `check:branch-base` 约 10 次、`check:integrations` 声明门约 9 次，
  真实测试失败仅约 2 次；闸门失败次数是代码失败的数倍。
- 回同步 PR 的合并延迟尾部为 386、934、4045 分钟，期间所有发布都被阻塞。

需要保证的性质其实是「`main` 不持有 `dev` 缺失的改动」，而不是「`dev` 包含 `main` 的每一个提交」。
发布合并提交携带的正是被合并的那个 `dev` 提交的树，它不引入任何新内容，因此旧判定在防一个
结构上不可能出现的风险。

## 决策

- `check:branch-base` 区分两条通道。发布通道为 `dev → main`，其余为功能通道。
- 发布通道验证 `git diff $(git merge-base origin/main HEAD) origin/main` 为空，即 `main`
  相对共同祖先没有引入 `dev` 之外的改动；不再要求 `dev` 包含发布合并提交本身。
- 功能通道保持严格祖先判定：分支必须包含最新目标分支。
- 本地运行没有 pull_request 事件时按分支名推断目标：功能分支前缀默认对比 `origin/dev`，
  `dev` 默认对比 `origin/main`。旧实现一律回落 `origin/main`，使每个基于 `dev` 的功能分支
  在本地被误判失败，且失败提示固定为 `rebase origin/main`，照做无法修复。
- `main` 的 `required_status_checks.strict` 关闭。`quality` 在 pull_request 事件上跑的是
  GitHub 生成的 `refs/pull/N/merge` 合并结果，已经等价于「合并后再测一遍」，该设置是重复保险。
  `enforce_admins`、必须走 PR、禁止强推与删除、必需检查 `quality` 与 `smoke` 全部保留。
- 删除 `sync-main-to-dev` 工作流及其测试。
- `check:branch-base` 只在 pull_request 事件运行。
- `quality` 的 pull_request 触发器订阅 `edited`，使修正 PR 正文声明后自动重跑声明门。

## 备选方案

- **fast-forward 发布**（`git push origin dev:main`，使 `main` 与 `dev` 落在同一提交）：
  `main` 开着 `enforce_admins: true`、`allow_force_pushes: false` 且必须走 PR，直接推送会被拒绝。
  实现它需要把 `main` 迁到 ruleset 并为发布工作流开 bypass actor，为省一个同步 PR 而削弱
  正式分支保护，不成比例。
- **自动合并回同步 PR**：保留全部往返开销，只是把等待人转成等待机器，且需要给 Actions
  开出建 PR 与合并 PR 的权限。
- **保留 `strict: true` 只改脚本**：GitHub 层仍然拦住发布 PR，改动无效。

## 后果

- 每次发布少一个回同步 PR、少两次 CI 运行，发布不再被回同步的合并延迟阻塞。
- 直接落到 `main` 的改动（事故恢复）现在会让下一个发布 PR 的基线检查失败，提示把它合回 `dev`。
  这是期望行为：该检查从「阻止发布」变成「发现 `main` 与 `dev` 真实分叉」。
- `main` 与 `dev` 的提交号继续不同，但两者的树在发布点一致；部署 commit 标记逻辑不受影响。
- 关闭 `strict` 后，发布 PR 的合并预览理论上可能落后于 `main`。本仓库 `main` 只经由唯一的
  发布 PR 前进，不存在并发发布，因此不会发生；作为对该放宽的补偿，`quality` 继续在 push 到
  `main` 时运行，用于事后确认真实合并结果，不再视为可裁剪的重复运行。

## 兼容与迁移

- 无数据库、接口或运行时变更，不涉及迁移与容量影响。
- `npm run test:release-flow` 由 `tests/pr-branch-flow.test.mjs` 与新增
  `tests/branch-base.test.mjs` 组成，后者用临时 git 仓库复刻真实发布拓扑，覆盖发布通道通过、
  `main` 含独有改动时失败、功能通道严格判定与提示分支正确性。
- 回滚：恢复 `sync-main-to-dev` 工作流与旧判定，并执行
  `gh api --method PATCH repos/489688547/EC-management-system/branches/main/protection/required_status_checks -F strict=true`。

## 关联与替代

- 修订 `2026-07-28-main-dev-gitops.md`。
- 相关 `docs/features/release-flow-simplification/`。
- 相关 `2026-07-27-pr-declaration-gate-scope.md`。
