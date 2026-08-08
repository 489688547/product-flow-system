# Compound Engineering 项目经验闭环执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

### Task 1: 固定来源与安全同步

- [x] 固定来源与安全同步
  - 依赖：DEV-000016 已由 `codex/compound-engineering-skills` 认领。
  - 文件：`tests/compound-engineering-skills.test.mjs`、`scripts/sync-compound-engineering-skills.mjs`、`.agents/skills/ce-compound/`、`.agents/skills/ce-compound-refresh/`、来源清单和许可证。
  - 输入：EveryInc tag `compound-engineering-v3.21.4`、commit `0a2957852e2034d04eb01120fd7da6ed5307dc56`。
  - 输出：Fork 零安装可发现的两个完整 Skill。
  - 失败测试：`node --test tests/compound-engineering-skills.test.mjs` 因文件缺失失败。
  - 实现步骤：校验来源和符号链接；复制允许目录；写清单与许可证；拒绝越界。
  - 验证：合同测试、治理检查和两个 Skill 的独立代理场景通过。
  - 2026-08-08：固定版两个 Skill、MIT LICENSE、安全同步器与治理检查已提交；
    6 项聚焦合同测试通过，独立审查确认 ignored 文件、实际 HEAD 和 tag 漂移均会被拒绝。
  - 提交：`feat: vendor compound engineering skills`

### Task 2: 接入经验沉淀与首个实例

- [x] 接入经验沉淀与首个实例
  - 依赖：固定 Skill 已验证。
  - 文件：`.agents/skills/verification/SKILL.md`、`docs/solutions/deployment/`、合同测试。
  - 输入：已验证的 ACR/ECS 502 调查证据。
  - 输出：交付前触发规则和首份无秘密结构化经验。
  - 失败测试：合同测试因 verification 未触发和经验缺失失败。
  - 实现步骤：添加条件式触发；按 `ce-compound` 生成经验；校验 frontmatter、路径和敏感词。
  - 验证：失败测试转绿，独立代理能查重且不会把猜测写成规则。
  - 2026-08-08：`verification` 已接入条件式检索、沉淀、刷新与 stale 分流；
    首份 ECS 502 经验经上游校验器和独立语义审查通过，8 项聚焦测试通过。
  - 提交：`docs: compound verified deployment learning`

### Task 3: 建立受控上游升级 PR

- [x] 建立受控上游升级 PR
  - 依赖：安全同步器已验证。
  - 文件：`.github/workflows/update-compound-engineering.yml`、合同测试、ADR。
  - 输入：GitHub 最新正式 release。
  - 输出：每周/手动检查，只向 `dev` 创建带治理声明的升级 PR。
  - 失败测试：合同测试因工作流缺失或目标分支错误失败。
  - 实现步骤：检出 `dev`；读取 release tag 与 commit；同步；检查；创建 `codex/*` 分支和 PR；不自动合并。
  - 验证：静态合同、治理检查和 workflow YAML 解析通过。
  - 2026-08-08：每周/手动升级工作流已实现；拒绝降级和孤儿分支，对已有开放 PR
    幂等退出，并在 push 前通过真实 `check:pr`。10 项聚焦合同及独立复审通过。
  - 提交：`ci: propose compound engineering updates`

### Task 4: 完整验收与交付

- [ ] 完整验收与交付
  - 依赖：前三项完成。
  - 文件：本功能全部文件和 `docs/features/compound-engineering/tasks.md`。
  - 输入：项目 Definition of Done、PR 声明和 DEV-000016。
  - 输出：面向 `dev` 的 PR 与研发待办验收证据。
  - 失败测试：任一完整检查失败即停止交付。
  - 实现步骤：更新勾选；运行完整检查；检查 diff；提交、推送、开 PR；提交研发待办验收。
  - 验证：所有命令 exit 0，PR CI 通过。
  - 提交：`chore: finalize compound engineering integration`
