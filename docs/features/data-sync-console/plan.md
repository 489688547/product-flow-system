# 数据同步控制台 实施计划

## 依赖的既有能力

不新增数据表或 API 路由。所需数据已具备：

- `listWebCollectionStatus` → `jobs`、`runners`、`stores`、`runs`、`cursors`
- `salesMeta.latestDailyFacts` → 按业务日的销售额与件数（统一口径）
- `runnerOnline`、`stageText`（`src/domain/dataSyncRecovery.js`，本轮已存在）
- 批量补数复用 `action: "trigger"` 逐目标提交，不新增批量端点

## 文件

### 新增

- `src/domain/dataSyncCoverage.js`
  - `buildSyncCoverage({ jobs, stores, dailyFacts, range, now })` → 按业务日聚合的覆盖行
  - `detectIncompleteBusinessDays(dailyFacts, { threshold, excludeDates })` → 残缺日与证据
  - `buildBackfillPreflight(days, { runners, stores, jobs, limit })` → 弹窗分组与登录状态
  - `buildSyncConclusion(coverage, progress)` → 结论条文案
  - `buildCollectionProgress({ jobs, runners })` → 当前任务、阶段、队列剩余、最近完成
- `src/features/data-center/SyncConclusionBar.jsx`
- `src/features/data-center/SyncCoveragePanel.jsx`
- `react-tests/data-sync-coverage.test.mjs`
- `react-tests/sync-coverage-panel.test.mjs`

### 修改

- `src/domain/dataCenter.js`：`detectLatestSalesAnomaly` 增加 `excludeDates`，把已判定断档或残缺的
  日期排除出基线中位数；返回结构保持兼容
- `src/domain/dataSyncRecovery.js`：导出 `stageText`
- `src/features/data-center/DataGovernanceWorkspaces.jsx`：`SyncRunsWorkspace` 重排——
  删除销售异常卡、抖店采集表、待处理数据问题三个区块，挂载结论条与覆盖表，
  执行记录接入 `TablePagination`，快麦原始归档改为本机原始归档并下移
- `src/features/data-center/DataCenterAppPage.jsx`：健康提示按口径区分并支持多日计数
- `chrome-extension/company-data-collector/popup.js`：采集中增加业务日期与阶段
- `DESIGN.md`：补充数据同步页的区块职责、口径陈述与批量补数规则
- `docs/features/data-warning-recovery/prd.md`：标注承接关系

## 口径模型

```js
const CALIBER = {
  unified:  { id: "unified",  label: "统一口径",     providers: ["kuaimai"] },
  platform: { id: "platform", label: "平台官方口径", providers: ["douyin-ecommerce", ...] }
};
```

- 统一口径缺口影响 `净销售额 · 销量 · 毛利 · 平台分布`。
- 平台官方口径缺口影响 `与该平台对账 · 该平台流量与内容分析`，**不影响统一口径销售数字**。
- 两者永不相互校验，页面不得暗示应当相等。

## 覆盖行判定顺序

先命中先返回：

1. 该口径下无已登记资源 → 不产生行
2. 存在 `queued` 任务 → `queued`（附队列位置）
3. 存在运行阶段任务 → `running`
4. 存在 `waiting_human` / `schema_changed` → `waiting_human`
5. 存在 `failed` → `failed`
6. 无销售事实且无任务 → `missing`
7. 有销售事实但低于健康中位数阈值 → `incomplete`（附当日值与中位数）
8. 其余 → `synced`

中位数只取状态为 `synced` 的日期，`missing` 与 `incomplete` 不参与，避免坏日拉低基线掩盖后续坏日。
平台官方口径当前没有独立的销售事实来源，因此只按任务状态判定，不做 6/7 两步。

## 迁移与回滚

- 无数据库变更，无迁移。
- 结论条、覆盖表、检测口径三处可分别回滚。
- 不改变既有 API 契约，采集器与扩展无需同步升级。
- 扩展 popup 改动向后兼容：旧 `activeJob` 缺字段时不渲染对应行。

## 验证

- 域逻辑：断档、残缺与证据、队列位置、基线排除、口径分组、单次上限、结论文案
- 面板：加载/空/错误/只读四态、多选、全部补齐、弹窗分组与登录提示、取消不产生任务
- 采集器离线时的结论与弹窗文案
- 六项闸门与 `npm run check:pr`
- 键盘、焦点、真实笔记本宽度、WCAG AA、DingTalk WebView 复核

## 风险

- 批量提交逐个调用 `trigger`，需串行提交；中途失败要报告已成功的部分，不能让用户以为整批失败。
- 检测口径变更会改变总览提示的出现频率，属预期。
- 删除三个区块属破坏性变更，必须逐条核对能力去向表，避免真的丢功能。
