# 数据总览日期范围与环比实施计划

## 目标

交付确认式共享日期范围选择器，并让数据总览五项 KPI 使用共享口径结果展示等长上一期环比，任何日期草稿都不触发查询。

## 架构方案

- `src/ui` 提供业务无关的范围选择基础控件，内部管理草稿和确认行为。
- `src/domain` 提供上海自然日范围、等长上期和环比展示模型的纯函数。
- `src/state` 负责协调本期与上期共享口径结果，不让 React 展示组件直接调用 API。
- `src/features` 只组合已应用范围、结果状态和 KPI 展示。
- 继续使用现有 `/api/data-center/sales` 与 `/api/platform/v1/data-standards`，不新增服务端契约和存储。

共享能力评审结论为 `抽取共享能力`：确认式日期范围选择属于基础控件，可进入 `src/ui`；环比业务模型和数据编排仍归数据中心功能所有。

## 文件职责

- 创建 `src/ui/DateRangePickerField.jsx`：确认式日期范围选择、快捷项、校验、焦点恢复。
- 修改 `src/domain/dataCenter.js`：日期快捷范围、等长上期和指标环比纯函数。
- 修改 `src/state/DataStandardsProvider.jsx`：本期与上期结果调度、独立状态和取消。
- 修改 `src/features/data-center/DataCenterAppPage.jsx`：计算上期范围并连接状态层。
- 修改 `src/features/data-center/DataOverview.jsx`：替换原生双输入，展示环比。
- 修改 `src/styles.css`：共享范围选择器和环比行的响应式样式。
- 修改 `docs/platform/components.md`：登记共享范围选择器契约。
- 修改 `DESIGN.md`：写回数据总览确认式日期和环比规则。
- 创建/修改领域、React 和 UI 测试：覆盖日期、提交次数、环比边界和可访问状态。

## 接口与契约

### 日期领域函数

- `dataCenterPresetRange(days, today?) -> { from, to }`
- `validateDataCenterRange(range, options?) -> { valid, reason, days }`
- `previousEqualRange(range) -> { from, to }`
- `compareDataCenterMetric(currentResult, previousResult, metric) -> { available, direction, favorable, value, unit, reason }`

日期字符串均为 `YYYY-MM-DD`，包含首尾，默认时区为上海。纯函数不读取浏览器或网络。

### 共享组件

`DateRangePickerField` 只通过 `onConfirm` 输出已确认范围；草稿变化不向父级冒泡。现有 `DatePickerField` 契约不变。

### 数据标准状态

增加面向范围比较的调度方法和 `comparisonResults`/`comparisonRun` 状态；保留现有 `results`、`run`、`ensureResults` 和 `scheduleEnsureResults`，避免破坏数据口径重算等调用方。

## 数据迁移

- 无数据库结构、环境变量和持久化数据变化。
- 既有共享口径结果继续按精确 `from/to` 读取；上期缺失时使用现有幂等 `ensure_current` 计算批次补齐。
- 环比只在读取时计算，不新增结果表字段，不改变历史有效批次。
- API 单范围上限仍为 370 天；本期和上期作为两个独立合法范围读取。

## 风险与回滚

- 风险：本期与上期调度互相取消。处理：同一次比较使用统一控制器和独立结果槽，外层新请求才取消旧比较。
- 风险：只完成本期时上期错误覆盖整个页面。处理：本期与上期错误分离，上期只影响环比行。
- 风险：比率指标误显示相对百分比。处理：指标元数据明确 `percent_point` 比较单位并用领域测试锁定。
- 风险：浮层在钉钉 WebView 被裁切。处理：复用 `FloatingMenu`，验证 390px 和真实 WebView。
- 回滚：撤销 UI、领域、状态编排和文档提交，恢复原有本期结果读取；无需迁移或数据恢复。

## 验证命令

- 聚焦领域：`node --test react-tests/data-center-date-comparison.test.mjs`
- 聚焦 UI：`node --test react-tests/date-range-picker.test.mjs react-tests/data-center-governed-overview.test.mjs react-tests/data-center-app.test.mjs`
- 状态/API 回归：`node --test tests/data-standards-results-api.test.mjs react-tests/data-standards-provider.test.mjs`
- 全量：`npm run lint && npm run check:governance && npm run check:integrations && npm run check:environment-capabilities && npm test && npm run build`
- 浏览器：本地 `npm start`，验证 1440、900、640、390px、键盘、焦点、控制台和钉钉 WebView。

## 任务顺序

1. 先用失败测试锁定日期草稿不提交、快捷范围和等长上期算法。
2. 实现领域日期与环比纯函数，使领域测试转绿。
3. 用失败测试定义共享范围选择器确认、取消、禁用和焦点契约。
4. 实现共享组件并登记平台组件目录。
5. 用失败测试锁定本期/上期结果编排和错误隔离。
6. 扩展状态层并连接数据总览。
7. 完成环比样式、响应式和无障碍验证。
8. 写回 durable 设计规则，运行完整门禁并审查最终差异。
