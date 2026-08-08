# 发布往返精简 PRD

## 文档状态

- 状态：已上线
- 负责人：仓库维护者
- 最近更新：2026-08-08

## 背景与问题

`dev → main` 发布在 `main` 留下一个只属于 `main` 的合并提交，而 `check:branch-base` 要求
当前分支必须包含最新 `origin/main`，于是下一个发布 PR 必然失败，必须先合入一个回同步 PR。
GitHub 侧 `main` 的 `required_status_checks.strict` 在仓库设置层重复强制同一件事。

2026-08-08 对近 200 个已合并 PR 与近 100 次 `quality` 运行的统计：

- 功能 PR 61 个、发布 PR 110 个、回同步 PR 29 个，约 70% 的 PR 不含任何代码改动。
- 改一行代码要走 6 次 CI、3 次合并、1 次人工批准。
- `quality` 中位耗时约 58 秒、成功率 88%，构建耗时不是瓶颈。
- 近 25 次失败中，`check:branch-base` 约 10 次、`check:integrations` 声明门约 9 次、
  GitHub 基础设施 2 次，真实测试失败仅约 2 次。
- 回同步 PR 合并延迟尾部为 386、934、4045 分钟，期间发布完全阻塞。

另有一处独立摩擦：CI 只读 pull_request 事件负载，`quality` 未订阅 `edited`，
因此写错声明后只能推一个空提交重跑，`gh run rerun` 会回放旧负载并持续失败。

## 目标

- 一次功能改动不再需要回同步 PR，发布不被回同步的合并延迟阻塞。
- 修正 PR 正文中的声明后能自动重跑声明门，无需推送空提交。
- 分支基线检查在本地和 CI 给出同一套判断，且失败提示照做即可修复。
- 保留 `main` 的全部实质保护与固定双站验收顺序。

## 非目标

- 不改动声明门本身的规则强度（`Integration-Impact`、`Rule-Writeback` 判定逻辑不变）。
- 不改动功能文档四件套要求、AI 边界、凭据保险箱等实质治理约束。
- 不改动 `dev` 分支保护的 `strict` 设置。
- 不引入 fast-forward 发布或 ruleset bypass。

## 用户与权限

- 功能开发者：提交 `codex/*` 等前缀分支到 `dev`，运行 `npm run check:pr` 自检。
- 仓库维护者：创建唯一的 `dev → main` 发布 PR，并持有修改分支保护的权限。
- 分支保护修改属于仓库设置变更，需要维护者显式授权后执行。

## 当前流程

1. 功能 PR 合入 `dev`。
2. 测试站部署并验收。
3. 创建 `dev → main` 发布 PR 并合并，`main` 产生独有合并提交。
4. `sync-main-to-dev` 工作流推送回同步分支并开 PR，该 PR 需人工批准 CI 后合并。
5. 回同步合并前，下一个发布 PR 被 `check:branch-base` 与 GitHub `strict` 双重拒绝。

## 目标流程

1. 功能 PR 合入 `dev`。
2. 测试站部署并验收。
3. 创建 `dev → main` 发布 PR 并合并。
4. 直接进入下一轮开发，无回同步步骤。

## 业务规则

- 需要保证的性质是「`main` 不持有 `dev` 缺失的改动」，而非「`dev` 包含 `main` 的每个提交」。
- 发布通道为 `dev → main`，验证 `main` 相对共同祖先没有引入 `dev` 之外的改动。
- 功能通道保持严格祖先判定，分支必须包含最新目标分支。
- 经由发布 PR 之外的路径落到 `main` 的改动，必须合回 `dev` 才能进行下一次发布。
- 分支基线检查只在 pull_request 事件运行。

## 数据定义

无持久化数据变更。判定使用的 git 事实：

- 共同祖先：`git merge-base origin/<base> HEAD`。
- 发布通道判定输入：`git diff <共同祖先> origin/main` 是否为空。
- 功能通道判定输入：`git merge-base --is-ancestor origin/<base> HEAD` 是否成立。
- 通道识别输入：`GITHUB_BASE_REF` 与 `GITHUB_HEAD_REF`；本地缺失时按分支名前缀推断。

## 异常与边界

- 缺少远端基线引用：提示对应目标分支的 `git fetch origin <base>`，而非固定 `main`。
- `main` 与 `dev` 无共同祖先：失败关闭，提示无法判断发布基线。
- `main` 含 `dev` 缺失的真实改动（例如事故恢复直接落盘）：发布通道失败，提示合回 `dev`。
- 本地无 pull_request 事件：按分支名前缀推断目标分支，与 CI 语义一致。
- `dev` 与 `main` 完全一致：发布通道通过，不产生空 PR 要求。

## 验收标准

- 构造「`main` 只多出发布合并提交」的仓库拓扑，发布通道判定通过，且该拓扑下旧的祖先判定确实失败。
- 在 `main` 上追加一个真实改动后，发布通道判定失败并提示含 `dev` 缺失的改动。
- 落后于 `dev` 的功能分支判定失败，提示为 `git rebase origin/dev` 且不出现 `origin/main`。
- 包含最新 `dev` 的功能分支判定通过。
- `quality` 工作流的 pull_request 触发器包含 `edited`。
- `check:branch-base` 步骤带 `github.event_name == 'pull_request'` 条件。
- `.github/workflows/sync-main-to-dev.yml` 不再存在。
- `npm run test:release-flow` 全部通过。

## 上线与回滚

- 无功能开关、无迁移、无监控项变更。
- 回滚条件：发布通道判定放过了 `main` 与 `dev` 的真实分叉，或声明门因 `edited` 触发产生异常重跑。
- 回滚步骤：恢复 `sync-main-to-dev` 工作流与旧判定，并执行
  `gh api --method PATCH repos/489688547/EC-management-system/branches/main/protection/required_status_checks -F strict=true`。
