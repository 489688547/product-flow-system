# 发布往返精简执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

### Task 1: 分支基线按通道判定

- [x] 分支基线按通道判定
  - 依赖：无。
  - 文件：`tests/branch-base.test.mjs`、`scripts/check-branch-base.mjs`。
  - 输入：`GITHUB_BASE_REF`、`GITHUB_HEAD_REF` 与本地 git 对象。
  - 输出：`checkBranchBase` 返回值新增 `lane`；新增 `currentBranch`、`requiredBaseRef(env, branch)`、`isReleaseLane`。
  - 失败测试：`node --test tests/branch-base.test.mjs`，发布通道用例因旧的祖先判定失败。
  - 实现步骤：抽出分支解析 → 按分支名前缀推断本地基线 → 识别发布通道 →
    发布通道改为 `git diff <merge-base> origin/main` 判定 → 修正失败提示使用实际目标分支。
  - 验证：`node --test tests/branch-base.test.mjs`，实际结果 8 项 git 拓扑用例通过，
    3 项工作流用例在 Task 2、3 完成前失败。
  - 提交：`fix(ci): 分支基线按发布与功能通道分别判定`。

### Task 2: 工作流触发与步骤条件

- [x] 工作流触发与步骤条件
  - 依赖：Task 1。
  - 文件：`.github/workflows/quality.yml`。
  - 输入：`quality` 现有触发器与步骤列表。
  - 输出：pull_request 订阅 `edited`；`check:branch-base` 限定 pull_request 事件。
  - 失败测试：`node --test tests/branch-base.test.mjs` 中两项工作流用例失败。
  - 实现步骤：为 pull_request 增加 `types` 列表 → 为 `check:branch-base` 增加 `if` 条件并注明原因。
  - 验证：`node --test tests/branch-base.test.mjs`，两项工作流用例转为通过。
  - 提交：`fix(ci): 声明门支持正文编辑重跑，基线检查只在 PR 运行`。

### Task 3: 移除回同步链路

- [x] 移除回同步链路
  - 依赖：Task 1。
  - 文件：`.github/workflows/sync-main-to-dev.yml`、`tests/sync-main-to-dev-workflow.test.mjs`、`package.json`。
  - 输入：现有 `test:release-flow` 组成。
  - 输出：回同步工作流与其测试移除，`test:release-flow` 指向 `tests/pr-branch-flow.test.mjs` 与 `tests/branch-base.test.mjs`。
  - 失败测试：`node --test tests/branch-base.test.mjs` 中「回同步工作流已移除」用例失败。
  - 实现步骤：`git rm` 工作流与其测试 → 更新 `test:release-flow` → 全仓检索残留引用。
  - 验证：`npm run test:release-flow`，实际结果 16 项全部通过。
  - 提交：`chore(ci): 移除回同步工作流`。

### Task 4: durable 规则反写

- [x] durable 规则反写
  - 依赖：Task 1、2、3。
  - 文件：`AGENTS.md`、`docs/decisions/2026-08-08-release-lane-branch-base.md`、`docs/features/release-flow-simplification/`。
  - 输入：实测的 PR 构成、CI 耗时与失败分布数据。
  - 输出：分支基线不变量与声明门重跑方式写入 durable 规则；决策与备选方案留档。
  - 失败测试：`npm run check:governance` 在功能文档四件套不齐时失败。
  - 实现步骤：改写 `AGENTS.md` 两条规则 → 写决策记录并声明修订对象 → 补齐功能文档四件套。
  - 验证：`npm run check:governance`、`npm run check:integrations`。
  - 提交：`docs(ci): 记录发布通道基线决策`。

### Task 5: 关闭 main 的 strict 检查

- [x] 关闭 main 的 strict 检查
  - 依赖：无（与代码改动相互独立，单独生效不会破坏现有流程）。
  - 文件：无仓库文件，属仓库设置变更。
  - 输入：`main` 现有分支保护配置。
  - 输出：`required_status_checks.strict` 为 `false`，其余保护项不变。
  - 失败测试：不适用，通过变更前后读取接口对比确认。
  - 实现步骤：读取当前配置 → 使用窄接口 `PATCH .../protection/required_status_checks -F strict=false` →
    回读全量保护配置确认其余项未被重置。
  - 验证：回读结果为 `strict: false`、`contexts: [quality, smoke]`、`enforce_admins: true`、
    必须走 PR、禁止强推与删除、必须解决所有对话，均与变更前一致。
  - 提交：不涉及提交。
