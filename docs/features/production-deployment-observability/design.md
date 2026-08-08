# 生产部署可观测设计书

## 用户任务

维护者要在一眼之内区分三件事：发布还在部署途中、发布已经到达生产、发布卡住了。
过去这三种状态都可能表现为一个红色的 `deployed-smoke`。

## 信息层级

1. 结论：`current` / `deploying` / `stale` / `unreachable` / `unknown`。
2. 断点候选：镜像构建、ACR 推送、ECS rollout。
3. 佐证：生产站实际 commit、`main` 期望 commit、发布提交已过去多少分钟、宽限期长度。

## 页面结构

无产品页面。涉及的仓库结构为：

```text
scripts/check-production-drift.mjs        判定逻辑与命令行入口
tests/production-drift.test.mjs           判定与工作流约束的验证
.github/workflows/production-drift.yml    每两小时的漂移检查
.github/workflows/deployed-smoke.yml      发布当下的固定站点冒烟
```

## 交互流程

- 发布：合并到 `main` → `deployed-smoke` 以 20 分钟窗口轮询生产站 commit →
  命中即通过；超时输出断点候选并失败。
- 持续观测：计划任务以完整历史检出 `main` → 读生产站 commit → 从该 commit 往前数出最老未部署提交 → 一致或在宽限期内则通过 →
  超过宽限期失败并在作业摘要中留下结论。
- 修复后复验：运维处理完断点 → 在 Actions 页面 `workflow_dispatch` 触发 `deployed-smoke`，
  不需要推空提交。

## 组件复用

- 复用 `check-deployed-smoke.mjs` 的 `commitFromHtml` 与 `sameCommit`，两处对「部署版本」
  的认定必须一致；为此把这两个函数从模块内部提升为导出。
- 复用 `deployed-smoke.yml` 既有的 `github.ref_name == 'main'` 目标推断，不引入新的输入参数。
- 复用 `node --test` 与仓库既有测试组织方式。

## 新增组件

- `evaluateDrift({ deployedCommit, expectedCommit, undeployedSinceMs, nowMs, graceMinutes })`
  纯函数，返回 `{ status, drifted, ageMinutes?, message }`。不做网络请求也不碰 git，便于覆盖全部分支。
- `oldestUndeployedTimestampMs({ deployedCommit, expectedCommit, runGit })`
  取生产缺失的最老提交时间；`runGit` 注入，生产 commit 不在历史中时退回发布提交时间。
- `checkProductionDrift({ url, expectedCommit, undeployedSinceMs, resolveUndeployedSinceMs, graceMinutes, nowMs, fetchImpl })`
  取页面后按实际部署 commit 解析未部署时长，再委托 `evaluateDrift`；`fetchImpl` 与解析器均可注入，网络失败映射为 `unreachable`。
- `DEFAULT_GRACE_MINUTES` 常量，默认 60。
- 复用边界限于生产部署版本比较，不承担 readiness、CORS 或平台能力校验，那些仍属冒烟脚本。

## 页面状态

- 加载：不适用，判定为一次性命令行执行。
- 空数据：生产站未返回 commit 元信息时判定 `unknown` 并失败，不静默通过。
- 错误：站点不可访问判定 `unreachable`；缺少预期 commit 或提交时间直接抛错失败关闭。
- 无权限：不适用，两个工作流都只读公开页面。
- 禁用：不适用。
- 成功：`current` 输出生产站所在 commit；`deploying` 额外输出已过分钟数与宽限期。

## 响应式与钉钉 WebView

不适用。本功能不产生浏览器界面，不影响钉钉 WebView 行为。

## 交互文案

- `current`：`生产站已在 <commit>。`
- `deploying`：`生产站在 <a>，main 是 <b>；最老的未部署提交 N 分钟前产生，仍在 M 分钟宽限期内。`
- `stale`：`生产站停留在 <a>，main 已是 <b>，最老的未部署提交已经过去 N 分钟（宽限期 M 分钟）。镜像构建、ACR 推送或 ECS rollout 至少有一环没有走通。`
- `unknown`：`生产站没有返回 pfs-release-commit，无法确认部署版本。`
- `unreachable`：`无法访问生产站 <url>：<原因>`
- 冒烟超时：`固定站点在 N 分钟内没有到达 <commit>；镜像构建、ACR 推送或 ECS rollout 至少有一环没有走通。`

## 无障碍

不适用于界面。命令行与作业摘要输出保持单行可读，不依赖颜色区分成败，
退出码与文案同时表达结论。

## 视觉验收

无界面截图项。验收以 `npm run test:release-flow` 的用例结果，
以及对真实生产站执行一次 `scripts/check-production-drift.mjs` 的输出为准。
