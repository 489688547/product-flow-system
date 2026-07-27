# ADR：PR 声明闸门只拦真实边界变更

## 状态

已接受，2026-07-27。

本决策收窄 `1a39e69` 引入的路径匹配范围与长期规则文件白名单，不改变闸门本身的强制性。

## 背景

`Rule-Writeback` 与 `Integration-Impact` 的目的是让共享边界变更留下可追溯的规则依据。实际使用中，
这两项声明的失败大量来自与边界无关的原因，检查因此从「拦截风险」退化为「拦截格式」。

PR #100 是一个只改前端布局的变更，CI 连续失败四次，无一次指向代码问题：

- `docs/decisions/**` 自注册表建立起就登记为 `aliyun` 的 `codePaths`。`aliyun` 状态为
  `integrating`，没有 `envVars` 也没有 `apiRoutes`，该路径当时只是占位。后果是**任何 ADR 都被
  强制声明 `Integration-Impact: aliyun`**，与内容无关。PR #89 与 #97 都留下了这类声明。
- `Rule-Writeback` 的白名单缺少 `DESIGN.md` 与 `PRODUCT.md`，而 `AGENTS.md` 的「Source of truth」
  一节明确把两者列为持久事实来源。文档说它们是长期规则，校验器说不是。
- 校验只在 `pull_request` 事件中读取 PR body，本地无法预跑。声明写错必须 push 一轮才知道；
  且 `gh run rerun` 复用触发时的事件载荷，改完 body 重跑仍然失败。

真实的边界闸门在同一批变更中没有产生任何误报。

## 决策

- `docs/decisions/**` 从 `aliyun` 的 `codePaths` 移除。决策记录是跨领域文档，不属于任何 Provider
  的代码路径；ADR 是否涉及某平台，由其内容经关键词与域名证据判断。
- `isDurableRulePath` 与 `AGENTS.md` 的「Source of truth」对齐，接受 `AGENTS.md`、`DESIGN.md`、
  `PRODUCT.md`、`.agents/skills/`、`docs/product/`、`docs/platform/`、`docs/decisions/`。
- 新增 `npm run check:pr`，用与 CI 相同的规则在本地预跑声明检查。默认对比 `origin/main`，
  声明取自分支提交信息，可用 `--body-file` 指定 PR 正文、`--base` 指定基线。
- CI 分支与预检分支共用同一个报告函数，避免两套判定逻辑漂移。

## 不改变的部分

- 共享边界变更仍然必须反写长期规则，`none` 仍然会被拒绝。
- `SHARED_BOUNDARY_PATHS` 的范围不变，Provider 边界、迁移、错误码契约照旧强制声明。
- `check:governance`、`check:environment-capabilities`、测试与构建四道闸门不做任何放宽。

## 结果

闸门继续拦截真实的共享边界变更，但不再因占位路径和白名单遗漏拦截无关 PR。声明错误可以在
push 之前发现，省掉「push 等 CI 看错再改」的往返。

代价是路径匹配变松后，涉及阿里云的 ADR 不再被路径强制命中，需依赖关键词与域名证据；考虑到
`aliyun` 目前没有任何实际接入路径，这一风险可接受，待其真正接入时应登记具体代码路径。
