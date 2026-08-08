# ADR：固定引入 Compound Engineering 项目经验 Skill

- 日期：2026-08-08
- 状态：已接受
- 关联待办：DEV-000016

## 背景

团队需要让每次开发、调试和部署中的已验证经验可被所有 Fork 复用，同时避免个人安装差异、重复经验、规则冲突和上游浮动更新直接改变项目流程。

## 决策

将 EveryInc Compound Engineering 正式 release 中的 `ce-compound` 与 `ce-compound-refresh` 完整目录 vendoring 到 `.agents/skills/`。固定记录 tag、完整 commit SHA 和 MIT 许可证。上游更新由每周/手动 GitHub Actions 检查并创建面向 `dev` 的独立 PR；任何更新必须经过项目 CI 与人工评审，不跟随 `main`、不自动合并。

项目经验保存在 `docs/solutions/`。当前代码、测试和 durable docs 始终高于经验文档；证据不足的冲突标记 `stale`。项目 `verification` Skill 在已验证且可复用的问题出现时触发沉淀或刷新。

## 备选方案

- 每位开发者安装官方插件：升级方便，但版本无法由仓库统一，Fork 不能零安装获得能力。
- Git submodule：保留上游历史，但首次 Fork 需要额外初始化，容易出现空目录和 detached 状态。
- 跟随 upstream `main`：更新最快，但不可复现，可能未经评审改变团队流程。
- 自行重写简化 Skill：控制力强，但失去上游持续改进，重复维护冲突治理逻辑。

## 后果

- 所有开发者获得一致、可复现的经验闭环。
- 仓库增加约 360 KB vendored 内容和少量治理脚本。
- 每次上游升级需要审查 Skill 中的执行指令和脚本变化；自动检查只减少发现成本，不替代判断。
- 删除或替换经验依赖 Git 历史恢复，不建立污染搜索结果的归档目录。

## 自动化边界

- 每周和手动工作流只读取 GitHub latest 正式 release；draft、prerelease、非 `compound-engineering-vX.Y.Z` tag 和非完整 commit 都失败关闭。
- 工作流从最新 `origin/dev` 建立 `codex/*` 分支，安全同步器只复制两个 allowlisted Skill 与 MIT LICENSE；它不执行上游脚本，也不向 `dev` 或 `main` 直接推送。
- 项目合同测试、治理、集成、环境、lint、完整测试和 build 全部通过后，工作流才推送升级分支并创建 base 为 `dev` 的 PR；它不自动合并。
- 任何 release 读取、clone、同步、门禁、推送或 PR 创建失败都会使工作流失败，`dev` 和 `main` 保持不变；已推送但无法建 PR 的分支由维护者人工检查后处理。

## 回滚

回滚对应升级或首次引入提交；关闭或删除工作流可停止后续自动检查。已创建但未合并的升级分支或 PR 直接关闭即可；已合并版本通过单独的 `dev` 回滚 PR 恢复前一固定 tag 和 commit。已有经验文档可保留，或通过单独 PR 删除，产品运行时与数据不受影响。
