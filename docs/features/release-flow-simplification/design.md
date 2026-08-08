# 发布往返精简设计书

## 用户任务

开发者判断「我这个分支现在能不能合」，并在检查失败时照提示一次修好；
维护者判断「现在能不能发布」，不再需要先处理一个与本次改动无关的回同步 PR。

## 信息层级

1. 判定结论：通过或失败。
2. 失败原因与可直接执行的修复命令。
3. 通道信息：本次按发布通道还是功能通道判定、对比的基线是哪个分支。

## 页面结构

无产品页面。涉及的仓库结构为：

```text
scripts/check-branch-base.mjs      判定逻辑与命令行入口
tests/branch-base.test.mjs         用临时 git 仓库复刻真实拓扑的验证
.github/workflows/quality.yml      触发条件与步骤条件
```

## 交互流程

- 功能分支：开发者推送 → pull_request 事件带 `GITHUB_BASE_REF=dev` → 功能通道严格祖先判定 →
  失败时提示 `git fetch origin dev && git rebase origin/dev`。
- 发布：维护者创建 `dev → main` PR → pull_request 事件带 `GITHUB_BASE_REF=main` 与
  `GITHUB_HEAD_REF=dev` → 发布通道树等价判定 → 通过后合并，无后续回同步动作。
- 本地自检：`npm run check:branch-base` 无事件负载 → 按分支名前缀推断目标 → 与 CI 同一判定。
- 声明写错：开发者直接编辑 PR 正文 → `edited` 事件重跑 `quality` → 声明门读到新负载。

## 组件复用

- 复用 `scripts/check-pr-branch-flow.mjs` 已有的功能分支前缀常量语义，保持两处对
  「什么是功能分支」的认定一致。
- 复用现有 `git()` 执行封装与 `options.runGit` 注入点，不新增进程执行方式。
- 复用 `node --test` 与仓库既有测试组织方式，不引入测试框架。

## 新增组件

- `currentBranch(cwd, env, runGit)`：解析当前分支名，优先取事件负载。
- `requiredBaseRef(env, branch)`：解析目标基线引用；显式 `GITHUB_BASE_REF` 优先，
  否则按分支名前缀推断，功能分支前缀返回 `origin/dev`，其余返回 `origin/main`。
- `isReleaseLane(branch, baseRef)`：仅当分支为 `dev` 且基线为 `origin/main` 时为真。
- 三者均为纯函数或仅依赖注入的 git 执行，复用边界限于分支基线判定，不承担 PR 流向校验。

## 页面状态

- 加载：不适用，判定为一次性命令行执行。
- 空数据：`dev` 与 `main` 完全一致时发布通道通过，输出说明基线无差异。
- 错误：缺少远端引用、无共同祖先、基线含缺失改动三类分别给出不同原因与修复命令。
- 无权限：不适用，判定只读本地 git 对象。
- 禁用：不适用。
- 成功：发布通道输出「基线没有缺失改动」，功能通道输出「已包含基线」，两者措辞区分通道。

## 响应式与钉钉 WebView

不适用。本功能不产生任何浏览器界面，不影响钉钉 WebView 行为。

## 交互文案

- 通过（发布通道）：`分支基线检查通过：origin/main 没有 dev 缺失的改动。`
- 通过（功能通道）：`分支基线检查通过：<分支> 已包含 origin/<base>。`
- 失败（发布通道）：`origin/main 含有 dev 缺失的改动，发布会覆盖它们。请执行 git fetch origin main && git merge origin/main，解决冲突并重新验证。`
- 失败（功能通道）：`当前分支没有包含最新 origin/<base>。请执行 git fetch origin <base> && git rebase origin/<base>，解决冲突并重新验证。`
- 失败（缺引用）：`缺少 origin/<base>，请先执行 git fetch origin <base>。`
- 失败（无共同祖先）：`origin/main 与 dev 没有共同祖先，无法判断发布基线。`

## 无障碍

不适用于界面。命令行输出保持单行可读、不依赖颜色区分成败，退出码与文案同时表达结论。

## 视觉验收

无界面截图项。验收以 `npm run test:release-flow` 的用例结果为准。
