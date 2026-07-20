# Main 分支保护设置

源代码中的工作流只有在 GitHub 仓库开启分支保护后才能成为不可绕过的合并门禁。仓库管理员在本分支推送并确认 `quality` 工作流成功后，进入 GitHub 仓库设置完成以下配置。

## 保护规则

目标分支：`main`

- Require a pull request before merging。
- Require approvals，并在新提交出现后 dismiss stale approvals。
- Require status checks to pass before merging。
- 必需检查选择 `quality`。
- Require branches to be up to date before merging。
- `quality` 内的 `npm run check:branch-base` 也必须通过，旧分支没有包含最新 `origin/main` 时直接失败。
- Require review from Code Owners。
- Block force pushes。
- Block branch deletion。
- 不允许通过直接推送绕过规则；仓库管理员是否允许紧急绕过应单独记录并审计。

## 启用顺序

1. 合并或推送包含 `.github/workflows/quality.yml` 的分支，使 `quality` 至少运行成功一次。
2. 在 Settings → Branches 或 Rulesets 新建针对 `main` 的规则。
3. 按上方列表启用 PR、最新分支、必需检查和 Code Owner 审查。
4. 使用一个测试分支打开 PR，确认测试失败时无法合并，补齐检查并同步 `main` 后才可合并。

## 规则变更

降低保护强度、移除检查或更改 CODEOWNERS 都必须通过 PR 说明原因、影响和恢复方式。远程规则变化同时更新本文件，避免仓库设置与代码约定漂移。
