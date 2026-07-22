# 数据总览日期范围与环比执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 日期范围与环比领域规则
  - 依赖：书面设计复核通过。
  - 文件：`src/domain/dataCenter.js`、`react-tests/data-center-date-comparison.test.mjs`。
  - 输入：上海自然日、已确认范围、两期共享口径结果。
  - 输出：快捷范围、范围校验、等长上期和环比展示模型纯函数。
  - 失败测试：函数尚不存在，且上期为零、比率百分点等断言失败。
  - 实现步骤：先日期函数，再比较函数，不读取 React 或网络。
  - 验证：`node --test react-tests/data-center-date-comparison.test.mjs react-tests/data-center.test.mjs react-tests/data-center-governed-overview.test.mjs` 通过 14 项；覆盖 7/15/30 天、跨月、闰日、零值、缺失、覆盖率和方向。
  - 提交：领域函数与对应测试。

- [x] 共享确认式日期范围选择器
  - 依赖：日期领域规则完成。
  - 文件：`src/ui/DateRangePickerField.jsx`、`src/styles.css`、`docs/platform/components.md`、`react-tests/date-range-picker.test.mjs`。
  - 输入：已应用范围、快捷项、最晚日期、最大天数。
  - 输出：只在确认时调用 `onConfirm` 的共享基础控件。
  - 失败测试：缺少组件、确认/取消契约和焦点语义断言失败。
  - 实现步骤：复用 `DayPicker` 与 `FloatingMenu`，完成草稿、校验、确认、取消和响应式。
  - 验证：`node --test react-tests/date-range-picker.test.mjs react-tests/data-center-app.test.mjs` 通过 10 项，`npm run lint` 通过；键盘、焦点和真实视口留待最终浏览器验收。
  - 提交：共享组件、样式、目录和测试。

- [x] 本期与上期共享口径编排
  - 依赖：领域规则完成。
  - 文件：`src/state/DataStandardsProvider.jsx`、相关 Provider 测试。
  - 输入：本期范围、等长上期范围、五项指标代码。
  - 输出：独立的本期/上期结果、运行状态和错误状态。
  - 失败测试：比较调度方法不存在，且上期失败会覆盖本期状态。
  - 实现步骤：抽取单范围结果补齐，统一取消边界，分别保存两组结果。
  - 验证：`node --test react-tests/data-standards-provider.test.mjs react-tests/data-standards-api-client.test.mjs tests/data-standards-results-api.test.mjs` 通过 12 项，`npm run lint` 通过；覆盖独立取消、幂等计算、失败隔离和结果读取。
  - 提交：状态编排与测试。

- [x] 数据总览交互与环比展示
  - 依赖：共享选择器和状态编排完成。
  - 文件：`src/features/data-center/DataCenterAppPage.jsx`、`src/features/data-center/DataOverview.jsx`、`src/styles.css`、`react-tests/data-center-governed-overview.test.mjs`、`react-tests/data-center-app.test.mjs`。
  - 输入：已确认范围、两期结果和环比展示模型。
  - 输出：确认后单次刷新、五项 KPI 环比和不可比状态。
  - 失败测试：开始日期草稿仍触发全局 `setRange`，KPI 缺少环比语义。
  - 实现步骤：替换原生双输入，连接两期结果，增加环比行和状态文案。
  - 验证：相关 22 项聚焦测试、`npm run lint` 与 `npm run build` 通过；本地隔离验收页确认快捷范围和手动开始/结束日期均不立即提交，确认仅提交一次，取消与 Esc 不提交且焦点返回。1440/900/640/390px 均无横向溢出，390px 日期浮层宽 340px 且完整位于视口内。线上真实本地入口因 Cloudflare 远程代理 `fetch failed` 未完成生产数据联调，不影响本次无外部依赖的交互验收。
  - 提交：数据总览组合、样式与测试。

- [x] 规则写回与完整交付验证
  - 依赖：全部行为任务完成。
  - 文件：`DESIGN.md`、四份功能文档及必要测试记录。
  - 输入：最终实现和验证证据。
  - 输出：长期设计规则、已完成任务状态和可审查交付说明。
  - 失败测试：治理检查无法确认共享组件与设计事实源一致。
  - 实现步骤：写回确认式范围与环比规则，更新任务证据，审查差异。
  - 验证：`npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`（主套件 424 项及后续专项套件）和 `npm run build` 全部通过；完成 1440/900/640/390px 浏览器与窄 WebView 尺寸检查，`git diff --check` 通过。规则已写回 `DESIGN.md`，共享组件已登记到 `docs/platform/components.md`。
  - 提交：文档与最终验证记录。

- [x] 精简总览并补充趋势明细与同步状态入口
  - 依赖：日期范围与环比交付完成；产品负责人确认 GMV 统一口径。
  - 文件：`src/domain/dataCenter.js`、`src/features/data-center/DataOverview.jsx`、`src/features/data-center/DataCenterAppPage.jsx`、`src/styles.css`、相关测试和文档。
  - 输入：当前已确认范围的销售事实、共享口径结果、同步记录和质量问题。
  - 输出：精简 KPI、GMV 经营趋势、GMV 平台分布、可访问日明细和页头数据状态链接。
  - 失败测试：每日平台明细、GMV 排序、状态链接、旧标题删除和数据健康区删除断言失败。
  - 实现步骤：扩展纯事实视图与质量摘要，精简总览组合，再完成提示层、响应式和规则写回。
  - 验证：相关聚焦测试 40 项、`npm run lint`、治理/集成/环境能力检查、完整 `npm test`（API 主套件 455 项及专项套件）和生产构建全部通过。真实远程 D1 页面确认默认 2026-07-01 至 2026-07-21、五项同版环比、最新事实日期、21 个可聚焦日柱和逐平台 GMV 明细；900/640/390px 页面无横向溢出。验收期间远程 D1 曾出现一次 `Network connection lost`，页面按既有错误边界显示失败态，恢复后数据读取正常。
  - 提交：本次精简总览全部文件。

- [x] 最新销售日异常自动补拉闭环
  - 依赖：产品负责人确认双指标低于 25% 且先自动修复。
  - 文件：领域规则、销售摘要、平台修复 API、快麦/D1 共享服务、状态层、总览、同步记录、平台契约和测试。
  - 输入：最新 8 个有效日摘要、快麦订单创建时间日订单和现有退款字段。
  - 输出：幂等自动修复任务、完整分页安全写入、修复状态和人工处理提示。
  - 失败测试：25% 判定、权限、重复请求、分页不完整、富退款保护、任务状态与页面自动触发先失败。
  - 实现步骤：先纯领域判定，再只读摘要，再服务端任务与安全写入，最后接入状态层与 UI。
  - 验证：领域/API/UI 聚焦测试、完整 Definition of Done 和生产构建通过；本地线上运行边界读取真实 D1，确认 2026-07-21 GMV/销量分别为前 7 个有效日中位数的 6.18%/6.42%，真实补拉任务成功进入 `manual_required`，因当天已有退款明细而保留原数据，并在同步记录提示重新导入快麦官方文件。浏览器热更新后的本地 URL 重新加载被浏览器安全策略阻止，未将该限制误报为页面线上验收通过。
  - 提交：自动修复能力、平台规则和验证证据。
