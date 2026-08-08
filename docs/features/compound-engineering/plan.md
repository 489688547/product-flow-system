# Compound Engineering 项目经验闭环实施计划

## 目标

在仓库中固定引入 EveryInc `compound-engineering-v3.21.4` 的两个经验 Skill，并提供验证、冲突维护和按需人工升级。

## 架构方案

把两个上游 Skill 的完整目录作为审查过的 vendored source 提交到 `.agents/skills/`，使 Fork 零安装可用；用来源清单固定 tag `compound-engineering-v3.21.4`、commit `0a2957852e2034d04eb01120fd7da6ed5307dc56` 和 vendored 内容 SHA-256。同步脚本只从维护者提供的本地 checkout 复制允许目录和 LICENSE。仓库不定时查询上游、不自动建分支或 PR；需要升级时由维护者运行同步命令并走普通功能 PR。项目 `verification` Skill 负责在最终完整 DoD 前完成经验沉淀或刷新。

## 文件职责

- `.agents/skills/ce-compound/`：上游验证后经验沉淀流程及其资源。
- `.agents/skills/ce-compound-refresh/`：上游经验冲突和漂移维护流程及其资源。
- `.agents/skills/compound-engineering-upstream.json`：固定来源、tag、commit、许可证、允许目录和确定性内容 SHA-256。
- `.agents/skills/compound-engineering-LICENSE`：EveryInc MIT 许可证原文。
- `.agents/skills/verification/SKILL.md`：在产生已验证可复用经验时触发 `ce-compound`，在漂移时触发刷新。
- `scripts/sync-compound-engineering-skills.mjs`：安全同步两个完整 Skill。
- `scripts/check-project-governance.mjs`：调用固定版本与目录完整性检查。
- `.github/workflows/quality.yml`：在普通 PR/push 上以 `contents: read` 运行 Compound Engineering 合同和完整 DoD。
- `tests/compound-engineering-skills.test.mjs`：固定来源、人工同步、安全和触发规则测试。
- `docs/solutions/`：团队可版本化经验。

## 接口与契约

```bash
node scripts/sync-compound-engineering-skills.mjs \
  --source /absolute/upstream/checkout \
  --tag compound-engineering-v3.21.4 \
  --commit 0a2957852e2034d04eb01120fd7da6ed5307dc56
```

同步前读取 source checkout 的 `git rev-parse HEAD` 与 `refs/tags/<tag>^{commit}`，并要求二者与 `--commit` 完全相等；tag 必须符合 Compound Engineering 正式版命名规则。相同 tag 必须仍解析到清单 commit，新 tag 必须严格升级，降级失败。来源目录、两个 Skill 和 LICENSE 必须存在且不含符号链接，HEAD tree 必须精确覆盖 allowlist，输出仅限清单声明的目标路径。同步器按排序后的相对路径、文件大小和文件 bytes 生成确定性 SHA-256；治理检查独立重算。

## 数据迁移

无数据库迁移。首次合并新增 vendored Skill 与 `docs/solutions/`；后续升级通过 Git diff 审核。现有个人记忆不自动批量导入，只有已验证事件按 Skill 重新沉淀。

## 风险与回滚

- 上游脚本供应链风险：锁定 tag、commit 和内容摘要；人工同步只复制允许目录，不执行上游脚本。
- 上游行为变化：升级由维护者审查差异并走普通 PR；回滚升级提交即可恢复上一固定版本。
- 经验污染：未验证不写入；冲突证据不足标记 `stale`。
- 上下文膨胀：仅在触发时加载 Skill，经验按需读取。

## 验证命令

```bash
node --test tests/compound-engineering-skills.test.mjs
node scripts/check-project-governance.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

另外使用独立代理分别验证无 Skill、加载 `ce-compound`、加载 `ce-compound-refresh` 的压力场景。

## 任务顺序

1. 写供应链与行为合同失败测试。
2. 实现安全同步器并导入固定版两个 Skill。
3. 接入 verification，使用真实 ECS 事故生成首份经验并验证两个 Skill。
4. 删除自动升级 workflow，保留人工同步和普通 PR 质量门。
5. 运行完整验收、提交 PR，并把 DEV-000016 提交待验收。
