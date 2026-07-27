# ADR：排队采集任务超过一天判为放弃

## 状态

已接受，2026-07-27。

本决策补全 `d6ad045` 引入的采集自愈范围，不改变其对运行中僵尸任务的判定。

## 背景

公司 Mac 是笔记本，夜间休眠或关机。计划任务在每天 05:00 排队，机器不在线时无人领取。

自愈规则只覆盖「运行中 + 租约已过 + 重试用尽」的任务。从未被领取的任务没有租约
（`lease_expires_at` 为 NULL），既不在 `RUNNING_JOB_STATES` 内，也不满足
`lease_expires_at IS NOT NULL`，因此**永远不会落到终态**。

后果是缺口不可见且无法自助恢复：

- 任务无限期停在 `queued`，页面显示「等待 Chrome 领取」，看起来一切正常。
- 强制重触发只对 `waiting_human`、`failed`、`schema_changed`、`success` 生效
  （`triggerWebCollectionJob`），`queued` 不在其中。点击「重新触发」时 `requeued` 恒为 `false`，
  任务没有任何变化，界面却提示「将在下一轮轮询时领取」。

实测归档只有 07-23、07-25、07-27，07-24 与 07-26 完全缺失，与该失效模式一致。

## 决策

- `queued` 且 `COALESCE(updated_at, created_at)` 早于 24 小时的任务，由自愈扫为 `failed`，
  错误码 `WEB_COLLECTION_QUEUE_ABANDONED`，并写入一条 `web_collection_runs` 记录。
- 窗口取满 24 小时，而不是按小时判定。公司 Mac 夜间休眠、次日上午醒来后领取属于正常路径，
  短窗口会把本可成功的任务提前判死。超过一天仍无人领取，才说明这一轮确已被放弃。
- `failed` 在强制重触发的可重排状态内，重排会清空错误码并刷新 `updated_at`，
  因此**次日手动补采仍然可行**，且重排后重新开始计时。
- 「重新触发」在采集器离线时不再承诺「下一轮轮询时领取」，改为说明当前没有设备会领取。
- 运行阶段说明不再直接回显 `stage`。`stage` 会落后于 `status`，原实现会印出
  「正在执行 queued 阶段」这种自相矛盾的话。

## 不改变的部分

- 运行中僵尸任务的判定（租约已过且 `attempt >= 3`）保持原样。
- 自愈的触发位置不变：`listWebCollectionStatus` 在状态读取前调用，`claimWebCollectionJob`
  在领取前调用。浏览器打开页面即可触发，不依赖采集器在线。
- Chrome 负责页面动作与下载、本机服务负责等待与入库的拆分不变，见
  `2026-07-25-existing-chrome-extension-first.md`。

## 代价

采集器离线超过一天时，当天任务会显示为失败而非等待。这是刻意的：失败可被重触发且在页面上
可见，而无限等待既不可见也无法自助恢复。

真正的单点——采集依赖一台会休眠的笔记本——本决策没有解决，只是让它的失效可见。
消除单点需要把采集移到常在线的执行环境，属于独立决策。

## 验证

`tests/web-collection-api.test.mjs` 覆盖：超过 24 小时的排队任务被扫为
`WEB_COLLECTION_QUEUE_ABANDONED`、当日排队任务不受影响、以及扫为失败后强制重触发能重新排队
并刷新 `updated_at`。`react-tests/data-sync-recovery.test.mjs` 覆盖阶段文案不回显原始
`stage`，以及 `runnerOnline` 随心跳新鲜度变化。
