# 数据同步控制台 任务

按依赖顺序执行，每项先写失败测试再实现。

## 1. 覆盖域逻辑

- [x] `react-tests/data-sync-coverage.test.mjs` 失败测试：断档、残缺与证据、队列位置、口径分组
- [x] `src/domain/dataSyncCoverage.js`：`buildSyncCoverage` 与判定顺序
- [x] 残缺中位数排除 `missing` 与 `incomplete` 日期
- [x] 平台官方口径只按任务状态判定，不做销售事实推断

## 2. 结论与进度

- [x] `buildCollectionProgress`：当前任务、阶段、队列剩余、队列清空后的最近完成
- [x] `buildSyncConclusion`：健康 / 仅平台缺口 / 统一口径缺口 / 采集器离线四类文案
- [x] 导出 `stageText`，与扩展共用同一阶段口径

## 3. 弹窗前置检查

- [x] `buildBackfillPreflight`：按口径分组、逐平台登录状态、采集器离线、超过单次上限
- [x] 登录状态只读 `chrome_status`、店铺状态与错误码，不触碰凭据

## 4. 检测口径对齐

- [x] `detectLatestSalesAnomaly` 增加 `excludeDates`，基线排除已判定缺口日
- [x] 总览提示：统一口径多日计数、仅平台缺口、断档优先
- [x] 多日时「去处理」定位到覆盖表

## 5. 界面

- [x] `SyncConclusionBar.jsx`：结论、采集器状态、当前进度、阻塞动作入口
- [x] `SyncCoveragePanel.jsx`：覆盖行（结论→影响→证据→技术明细四层）
- [x] 多选、全部补齐、单行补数、正在补齐不可选
- [x] 确认弹窗与焦点管理
- [x] 加载、空、错误、只读四态
- [x] 串行提交与部分成功的结果播报
- [x] 「显示全部」、口径与状态筛选；执行记录接入 `TablePagination`

## 6. 页面重排

- [x] 删除销售异常卡、抖店采集表、待处理数据问题三个区块
- [x] 逐条核对能力去向表，确认无功能丢失
- [x] 执行记录接入 `TablePagination`
- [x] 快麦原始归档改为本机原始归档并下移
- [x] 每个区块副标题改为一句话直说其用途

## 7. Chrome 扩展

- [x] popup 采集中增加业务日期与阶段两行
- [x] `tests/chrome-collector-extension.test.mjs` 覆盖新增字段
- [x] 确认扩展不显示队列总数

## 8. 文档与闸门

- [x] `DESIGN.md` 补充区块职责、口径陈述、批量补数与离线状态规则，并更新与新结构冲突的旧条目
- [x] `docs/features/data-warning-recovery/prd.md` 标注承接关系
- [x] 六项闸门与 `npm run check:pr`
- [x] 真实笔记本宽度经浏览器实测：列宽正确、无横向溢出、窄屏媒体查询已解析
- [ ] DingTalk WebView 复核：登录需扫码，未能验证
