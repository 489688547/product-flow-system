# Compound Engineering 项目经验闭环实施计划

## 目标

在仓库中固定引入 EveryInc `compound-engineering-v3.21.4` 的两个经验 Skill，并建立验证、冲突维护和受控升级 PR。

## 架构方案

把两个上游 Skill 的完整目录作为审查过的 vendored source 提交到 `.agents/skills/`，使 Fork 零安装可用；用来源清单固定 tag `compound-engineering-v3.21.4`、commit `0a2957852e2034d04eb01120fd7da6ed5307dc56` 和 vendored 内容 SHA-256。同步脚本只从本地 checkout 复制允许目录和 LICENSE，升级工作流负责检出最新正式 release、机械生成候选并触发只读质量工作流，成功后才创建面向 `dev` 的 PR。项目 `verification` Skill 负责在最终完整 DoD 前完成经验沉淀或刷新。

## 文件职责

- `.agents/skills/ce-compound/`：上游验证后经验沉淀流程及其资源。
- `.agents/skills/ce-compound-refresh/`：上游经验冲突和漂移维护流程及其资源。
- `.agents/skills/compound-engineering-upstream.json`：固定来源、tag、commit、许可证、允许目录和确定性内容 SHA-256。
- `.agents/skills/compound-engineering-LICENSE`：EveryInc MIT 许可证原文。
- `.agents/skills/verification/SKILL.md`：在产生已验证可复用经验时触发 `ce-compound`，在漂移时触发刷新。
- `scripts/sync-compound-engineering-skills.mjs`：安全同步两个完整 Skill。
- `scripts/check-project-governance.mjs`：调用固定版本与目录完整性检查。
- `.github/workflows/update-compound-engineering.yml`：以写权限机械生成候选、校验候选树并编排只读质量门禁，只创建升级 PR。
- `.github/workflows/quality.yml`：支持在精确候选 SHA 上手动触发，以 `contents: read` 运行聚焦合同和完整 DoD。
- `tests/compound-engineering-skills.test.mjs`：合同、供应链、安全和工作流测试。
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

- 上游脚本供应链风险：锁定 tag+commit+内容摘要；写权限工作流只复制不执行；候选分支使用只读质量工作流完成完整 CI，再进入 PR 审核。
- 上游行为变化：升级不自动合并；回滚升级提交恢复上一固定版本。
- 重复运行与孤儿分支：已有开放 PR 幂等退出；无 PR 的远端分支仅在其 Git tree 与重建候选完全一致时复用，否则失败关闭。
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
4. 实现上游 release 检查和升级 PR 工作流。
5. 运行完整验收、提交 PR，并把 DEV-000016 提交待验收。
