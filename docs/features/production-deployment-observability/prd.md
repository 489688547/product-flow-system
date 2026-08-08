# 生产部署可观测 PRD

## 文档状态

- 状态：已上线
- 负责人：仓库维护者
- 最近更新：2026-08-08

## 背景与问题

`deployed-smoke` 在 push 到 `main` 后断言生产站已经在该 commit 上，窗口为 30 次 × 10 秒。
但仓库里没有任何步骤能让生产到达那个 commit，这个门实际上在赌「有人在 5 分钟内部署完」。

实测证据：

- 发布 `b78a3ebf` 的生产冒烟失败，日志重复 30 次「固定站点 commit 不一致：预期
  b78a3ebf1062，实际 85393ce41c56」。合并 12 分钟后生产站仍停在上一个发布。
- 同样的失败出现在 8/6 的 `f551714c`、`0dcfd29e` 与 8/7 的 `1755f073`。
- 同期 `dev` 的冒烟一直通过，因为测试站由 Cloudflare Pages 自动部署，几十秒内就位。

同日落地的 ACR 自动发布补上了链路下半段（ECS 每两分钟轮询 ACR `main` 镜像，备份后替换
容器，60 秒不健康自动回滚），使部署不再依赖人，但端到端耗时也明确变长，5 分钟窗口在链路
完全正常时同样可能不够。链路上半段（构建镜像并推送到 ACR `:main`）不由本仓库任何工作流完成。

## 目标

- 生产冒烟失败成为真实信号：链路正常时不再误报，失败即代表某一环确实断了。
- 断链不再只在发布当下可见，任何时刻都能回答「生产是否跟上 `main`」。
- 冒烟失败信息直接指出断点候选，不需要人去猜。
- 修复链路后可以直接重新验证，不必推空提交。

## 非目标

- 不引入第二条部署路径（不加 self-hosted runner，不由 CI 直接部署 ECS）。
- 不改动 ACR 轮询发布本身的机制、备份与回滚行为。
- 不实现镜像构建与推送 ACR 这一环，该环节的归属由运维侧决定。
- 不引入自动开 issue、自动重试部署或自动回滚。

## 用户与权限

- 仓库维护者：查看冒烟与漂移结果，决定是否介入。
- 运维：在漂移报出后处理镜像构建、ACR 推送或 ECS rollout。
- 两个工作流都只读，不持有部署能力，不需要新增任何 Secret。

## 当前流程

1. 发布 PR 合并到 `main`。
2. `deployed-smoke` 立刻开始 5 分钟轮询生产站 commit。
3. 若无人在窗口内完成部署，冒烟失败并留下红色记录。
4. 窗口结束后没有任何东西继续跟踪生产是否最终跟上。

## 目标流程

1. 发布 PR 合并到 `main`。
2. `deployed-smoke` 以 20 分钟窗口轮询生产站 commit，覆盖真实异步链路。
3. 超时失败时明确指出断点候选：镜像构建、ACR 推送或 ECS rollout。
4. `production-drift` 每两小时独立比较生产站 commit 与 `main`，超过宽限期仍落后即报出。
5. 修复后由 `workflow_dispatch` 重新触发冒烟验证。

## 业务规则

- 生产等待窗口 60 次 × 20 秒；测试站保持 30 次 × 10 秒。
- 漂移判定：一致为 `current`；落后但未部署时长在 60 分钟宽限期内为 `deploying`；
  超过宽限期为 `stale`；站点不可访问为 `unreachable`；未返回 commit 为 `unknown`。
- `current` 与 `deploying` 通过，其余三种失败关闭。
- 部署版本以生产站 HTML 的 `pfs-release-commit` 为准，短 commit 与长 commit 互为前缀视为同一版本。
- 漂移检查必须只读，不得具备 `contents: write`、`packages: write` 或 `id-token: write`。

## 数据定义

- `deployedCommit`：生产站 `<meta name="pfs-release-commit">` 的值。
- `expectedCommit`：`main` 的 HEAD。
- `undeployedSinceMs`：生产缺失的最老那个提交的时间，来自 `git log <生产 commit>..main --format=%ct --reverse` 的第一条，单位毫秒。
  不使用 `main` HEAD 的时间：那会在每次发布时重置年龄，让持续断链被永远判成 `deploying`。
  生产 commit 不在历史中时退回发布提交自身时间，宁可早报不漏报。
- `graceMinutes`：宽限期，默认 60 分钟。
- 无持久化数据，判定不写入任何数据库。

## 异常与边界

- 生产站网络失败或非 200：判定 `unreachable` 并失败，不把网络故障当成部署正常。
- 生产站返回页面但没有 commit 元信息：判定 `unknown` 并失败，不静默通过。
- 缺少有效预期 commit 或未部署提交时间：抛错失败关闭。
- 发布刚完成：宽限期内判定 `deploying` 并通过，避免每次发布都误报。
- 宽限期边界：恰好到点按包含处理，不报警。
- 计划任务只从默认分支运行，合并进 `main` 之前不会执行。

## 验收标准

- 生产站与 `main` 一致时判定 `current` 且退出码为 0。
- 生产站落后但最老未部署提交 10 分钟前产生时判定 `deploying` 且退出码为 0。
- 生产站落后且最老未部署提交超过宽限期时判定 `stale`、退出码为 1，且信息含「ACR」与「rollout」。
- `main` 在断链期间持续前进时仍判定 `stale`，未部署时长不因新发布而重置。
- 生产站不可访问时判定 `unreachable` 且失败。
- 生产站不返回 commit 时判定 `unknown` 且失败。
- `production-drift.yml` 含 `schedule`、`workflow_dispatch`、`contents: read`，且不含任何写权限。
- `deployed-smoke.yml` 含 `workflow_dispatch` 与区分目标的 `SMOKE_ATTEMPTS`、`SMOKE_INTERVAL`。
- `npm run test:release-flow` 全部通过。

## 上线与回滚

- 无功能开关、无迁移、无数据影响。
- 回滚条件：漂移检查产生持续误报，或冒烟窗口延长导致发布反馈过慢难以接受。
- 回滚步骤：把 `deployed-smoke` 窗口改回 30 次 × 10 秒，删除 `production-drift` 工作流、
  `scripts/check-production-drift.mjs` 与 `tests/production-drift.test.mjs`，
  并从 `test:release-flow` 中移除该测试。
