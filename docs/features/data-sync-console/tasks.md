# 数据同步控制台 任务

按依赖顺序执行，每项先写失败测试再实现。

## 1. 覆盖域逻辑

- [ ] `react-tests/data-sync-coverage.test.mjs` 失败测试：断档、残缺与证据、队列位置、口径分组
- [ ] `src/domain/dataSyncCoverage.js`：`buildSyncCoverage` 与判定顺序
- [ ] 残缺中位数排除 `missing` 与 `incomplete` 日期
- [ ] 平台官方口径只按任务状态判定，不做销售事实推断

## 2. 结论与进度

- [ ] `buildCollectionProgress`：当前任务、阶段、队列剩余、队列清空后的最近完成
- [ ] `buildSyncConclusion`：健康 / 仅平台缺口 / 统一口径缺口 / 采集器离线四类文案
- [ ] 导出 `stageText`，与扩展共用同一阶段口径

## 3. 弹窗前置检查

- [ ] `buildBackfillPreflight`：按口径分组、逐平台登录状态、采集器离线、超过单次上限
- [ ] 登录状态只读 `chrome_status`、店铺状态与错误码，不触碰凭据

## 4. 检测口径对齐

- [ ] `detectLatestSalesAnomaly` 增加 `excludeDates` 的失败测试与实现
- [ ] 总览提示：统一口径多日计数、仅平台缺口、断档优先
- [ ] 多日时「去处理」定位到覆盖表

## 5. 界面

- [ ] `SyncConclusionBar.jsx`：结论、采集器状态、当前进度、阻塞动作入口
- [ ] `SyncCoveragePanel.jsx`：覆盖行（结论→影响→证据→技术明细四层）
- [ ] 多选、全部补齐、单行补数、正在补齐不可选
- [ ] 确认弹窗与焦点管理
- [ ] 加载、空、错误、只读四态
- [ ] 串行提交与部分成功的结果播报
- [ ] 「显示全部」与筛选，明细列表接入 `TablePagination`

## 6. 页面重排

- [ ] 删除销售异常卡、抖店采集表、待处理数据问题三个区块
- [ ] 逐条核对能力去向表，确认无功能丢失
- [ ] 执行记录接入 `TablePagination`
- [ ] 快麦原始归档改为本机原始归档并下移
- [ ] 每个区块副标题改为一句话直说其用途

## 7. Chrome 扩展

- [ ] popup 采集中增加业务日期与阶段两行
- [ ] `tests/chrome-collector-extension.test.mjs` 覆盖新增字段
- [ ] 确认扩展不显示队列总数

## 8. 文档与闸门

- [ ] `DESIGN.md` 补充数据同步页区块职责、口径陈述与批量补数规则
- [ ] `docs/features/data-warning-recovery/prd.md` 标注承接关系
- [ ] 六项闸门与 `npm run check:pr`
- [ ] 键盘、焦点、真实笔记本宽度、WCAG AA、DingTalk WebView 复核
