# 生产部署可观测执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

### Task 1: 漂移状态机

- [x] 漂移状态机
  - 依赖：无。
  - 文件：`tests/production-drift.test.mjs`、`scripts/check-production-drift.mjs`、`scripts/check-deployed-smoke.mjs`。
  - 输入：生产站 HTML 的 `pfs-release-commit`、`main` HEAD 及其提交时间、宽限期。
  - 输出：`evaluateDrift`、`checkProductionDrift`、`DEFAULT_GRACE_MINUTES`。
  - 失败测试：`node --test tests/production-drift.test.mjs` 因模块不存在失败。
  - 实现步骤：导出 `commitFromHtml` 与 `sameCommit` → 实现五态判定 → 网络异常映射为 `unreachable` → 命令行入口按 `drifted` 设置退出码。
  - 验证：`node --test tests/production-drift.test.mjs`，实际结果 11 项通过。
  - 提交：`feat(ci): 增加生产发布漂移判定`。

### Task 2: 漂移检查工作流

- [x] 漂移检查工作流
  - 依赖：Task 1。
  - 文件：`.github/workflows/production-drift.yml`。
  - 输入：`main` 分支的 HEAD 与提交时间。
  - 输出：每两小时一次的只读漂移结论，写入作业摘要。
  - 失败测试：`tests/production-drift.test.mjs` 中工作流约束用例因文件缺失失败。
  - 实现步骤：检出 `main` → 取 HEAD 与提交时间 → 调用脚本 → 结论并入 `GITHUB_STEP_SUMMARY`。
  - 验证：`node --test tests/production-drift.test.mjs` 通过；对真实生产站执行一次脚本，
    在 `main` 为 `b9047c5f`、生产站为 `85393ce4`、发布提交 3 分钟前的情况下输出 `deploying` 且退出码 0。
  - 提交：`feat(ci): 每两小时检查生产发布漂移`。
  - 备注：默认 shell 是 `bash -e` 且无 `pipefail`，直接管道给 `tee` 会让失败退出码被吞掉；
    该步骤显式 `set -euo pipefail` 并把 stderr 并入摘要。

### Task 3: 冒烟窗口与触发方式

- [x] 冒烟窗口与触发方式
  - 依赖：无。
  - 文件：`.github/workflows/deployed-smoke.yml`。
  - 输入：现有按 `github.ref_name` 推断目标的逻辑。
  - 输出：生产 60 次 × 20 秒、测试站 30 次 × 10 秒；新增 `workflow_dispatch`；超时提示断点候选。
  - 失败测试：`tests/production-drift.test.mjs` 中冒烟窗口用例因缺少 `SMOKE_ATTEMPTS` 失败。
  - 实现步骤：按目标注入窗口参数 → 作业超时提高到 30 分钟 → 增加 `workflow_dispatch` → 超时输出 `::error::` 断点候选。
  - 验证：`node --test tests/production-drift.test.mjs tests/pr-branch-flow.test.mjs`，
    实际结果 16 项通过，原有冒烟内容断言未回归。
  - 提交：`fix(ci): 冒烟等待窗口匹配真实发布链路`。

### Task 4: durable 规则反写

- [x] durable 规则反写
  - 依赖：Task 1、2、3。
  - 文件：`package.json`、`AGENTS.md`、`docs/decisions/2026-08-08-production-deployment-observability.md`、`docs/features/production-deployment-observability/`。
  - 输入：本次实测的冒烟失败历史与 ACR 轮询发布的链路耗时。
  - 输出：新测试接入 `test:release-flow`；生产发布验证与漂移处理写入长期规则。
  - 失败测试：`npm run check:governance` 在功能文档四件套不齐时失败。
  - 实现步骤：接入 `test:release-flow` → 改写 `AGENTS.md` 相关规则 → 写决策记录 → 补齐四件套。
  - 验证：`npm run check:governance`、`npm run check:integrations`、`npm run test:release-flow`。
  - 提交：`docs(ci): 记录生产部署可观测决策`。
