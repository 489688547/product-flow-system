# ADR：固定引入 Compound Engineering 项目经验 Skill

- 日期：2026-08-08
- 状态：已接受
- 关联待办：DEV-000016

## 背景

团队需要让每次开发、调试和部署中的已验证经验可被所有 Fork 复用，同时避免个人安装差异、重复经验、规则冲突和上游浮动更新直接改变项目流程。

## 决策

将 EveryInc Compound Engineering 正式 release 中的 `ce-compound` 与 `ce-compound-refresh` 完整目录 vendoring 到 `.agents/skills/`。固定记录 tag、完整 commit SHA、内容摘要和 MIT 许可证。仓库不自动查询或升级上游；需要升级时，由维护者检出明确版本、运行本地同步命令并提交普通功能 PR。

- 当前固定版本：compound-engineering-v3.21.4（commit 0a2957852e2034d04eb01120fd7da6ed5307dc56；内容 SHA-256 `b8ade34542777b1d612ba081f654d8f9168828327bf30ac687cc3093a44be235`）。

项目经验保存在 `docs/solutions/`。当前代码、测试和 durable docs 始终高于经验文档；证据不足的冲突标记 `stale`。项目 `verification` Skill 在已验证且可复用的问题出现时触发沉淀或刷新。

## 备选方案

- 每位开发者安装官方插件：升级方便，但版本无法由仓库统一，Fork 不能零安装获得能力。
- Git submodule：保留上游历史，但首次 Fork 需要额外初始化，容易出现空目录和 detached 状态。
- 跟随 upstream `main`：更新最快，但不可复现，可能未经评审改变团队流程。
- 自行重写简化 Skill：控制力强，但失去上游持续改进，重复维护冲突治理逻辑。

## 后果

- 所有开发者获得一致、可复现的经验闭环。
- 仓库增加约 360 KB vendored 内容和少量治理脚本。
- 每次上游升级需要维护者主动发起并审查 Skill 中的执行指令、脚本和许可证变化。
- 删除或替换经验依赖 Git 历史恢复，不建立污染搜索结果的归档目录。

## 人工升级边界

1. 维护者在仓库外检出明确的正式 tag，并记录其完整 commit。
2. 运行计划文档中的 `sync-compound-engineering-skills.mjs` 命令；同步器校验实际 HEAD、tag、版本方向、allowlist、符号链接和当前内容摘要。
3. 审查两个 Skill、来源清单和许可证的 Git diff，不执行未评审的上游脚本。
4. 通过普通 `codex/* → dev` PR 运行只读 quality 和人工评审；没有定时任务、写权限机器人、候选分支编排或自动合并。

## 回滚

回滚对应升级或首次引入提交。已合并版本通过单独的 `dev` 回滚 PR 恢复前一固定 tag、commit 和内容摘要。已有经验文档可保留，或通过单独 PR 删除，产品运行时与数据不受影响。
