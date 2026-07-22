# 数据总览日期范围与环比实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付确认式共享日期范围选择器，并让数据总览五项 KPI 使用共享口径结果展示等长上一期环比，任何日期草稿都不触发查询。

**Architecture:** `src/ui` 管理未提交的日期草稿，`src/domain` 计算数据中心日期范围与环比，`src/state` 独立协调本期和上期结果，`src/features` 只负责组合和展示。继续使用现有销售事实与数据口径 API，不新增数据库、环境变量或外部平台调用。

**Tech Stack:** React 19、react-day-picker 9、FloatingMenu、Node test runner、Vite 7。

## 全局约束

- 日期按 `Asia/Shanghai` 自然日解释，开始与结束均包含，最多查询 370 天，最晚为昨天。
- 快捷项为近 7、15、30 天；快捷与手工范围都必须点击“确认”后才调用父级。
- 环比使用紧邻本期之前、包含天数相同的范围。
- 金额/数量使用相对百分比；退款率/毛利率使用百分点。
- 经营 KPI 原值只读取共享数据口径结果，不在 React 组件内复制公式。
- 本期失败影响总览状态；上期失败只影响环比行。
- 不新增依赖，不修改 API、D1、环境配置或外部平台边界。
- 不迁移其他页面的日期控件，不恢复“数据分析”工作区。

---

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
- 既有共享口径结果继续按精确 `from/to` 读取；上期缺失或缓存版本不匹配时，使用本期实际结果版本作为 `targetVersions` 发起现有幂等 `ensure_current` 计算批次补齐。
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

## 详细 TDD 执行步骤

### Task 1：日期范围与环比纯函数

**Files:**

- Create: `react-tests/data-center-date-comparison.test.mjs`
- Modify: `src/domain/dataCenter.js`

**Interfaces:**

- Produces: `dataCenterPresetRange(days, today?) -> { from, to }`
- Produces: `dataCenterRangeDays(range) -> number`
- Produces: `previousDataCenterRange(range) -> { from, to }`
- Produces: `compareDataCenterMetric(currentResult, previousResult, metric) -> comparison`
- `comparison` is `{ available, direction, favorable, value, unit, reasonCode }`.

- [ ] **Step 1：写日期范围失败测试**

```js
import {
  dataCenterPresetRange,
  dataCenterRangeDays,
  previousDataCenterRange
} from "../src/domain/dataCenter.js";

test("data overview presets end yesterday and comparison uses the immediately previous equal period", () => {
  assert.deepEqual(dataCenterPresetRange(7, new Date("2026-07-22T04:00:00.000Z")), {
    from: "2026-07-15",
    to: "2026-07-21"
  });
  assert.equal(dataCenterRangeDays({ from: "2026-07-01", to: "2026-07-15" }), 15);
  assert.deepEqual(previousDataCenterRange({ from: "2026-07-01", to: "2026-07-15" }), {
    from: "2026-06-16",
    to: "2026-06-30"
  });
});
```

- [ ] **Step 2：运行日期测试并确认按预期失败**

Run: `node --test react-tests/data-center-date-comparison.test.mjs`

Expected: FAIL，错误指出 `dataCenterPresetRange`、`dataCenterRangeDays` 或 `previousDataCenterRange` 尚未导出。

- [ ] **Step 3：实现最小日期函数**

```js
function shiftDay(day, amount) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
}

export function dataCenterPresetRange(days, today = new Date()) {
  const length = [7, 15, 30].includes(Number(days)) ? Number(days) : 30;
  const to = previousDay(shanghaiDate(today));
  return { from: shiftDay(to, -(length - 1)), to };
}

export function dataCenterRangeDays(range) {
  return Math.floor((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1;
}

export function previousDataCenterRange(range) {
  const days = dataCenterRangeDays(range);
  const to = shiftDay(range.from, -1);
  return { from: shiftDay(to, -(days - 1)), to };
}
```

- [ ] **Step 4：写环比失败测试**

```js
test("data overview comparisons use relative percent for values and percentage points for rates", () => {
  assert.deepEqual(
    compareDataCenterMetric({ value: 120, coverageRate: 1 }, { value: 100, coverageRate: 1 }, { comparison: "relative", favorable: "increase" }),
    { available: true, direction: "up", favorable: true, value: 20, unit: "percent", reasonCode: "" }
  );
  assert.deepEqual(
    compareDataCenterMetric({ value: 8, coverageRate: 1 }, { value: 10, coverageRate: 1 }, { comparison: "percentage_point", favorable: "decrease" }),
    { available: true, direction: "down", favorable: true, value: 2, unit: "percentage_point", reasonCode: "" }
  );
});

test("comparison does not invent a ratio when previous data is zero or incomplete", () => {
  assert.equal(compareDataCenterMetric({ value: 10 }, { value: 0 }, { comparison: "relative" }).reasonCode, "PREVIOUS_VALUE_ZERO");
  assert.equal(compareDataCenterMetric({ value: 10 }, null, { comparison: "relative" }).reasonCode, "PREVIOUS_RESULT_NOT_AVAILABLE");
  assert.equal(compareDataCenterMetric({ value: 10, coverageRate: 1 }, { value: 8, coverageRate: 0.8 }, { comparison: "relative" }).reasonCode, "PREVIOUS_DATA_NOT_COVERED");
});
```

- [ ] **Step 5：运行环比测试并确认按预期失败**

Run: `node --test react-tests/data-center-date-comparison.test.mjs`

Expected: FAIL，错误指出 `compareDataCenterMetric` 尚未导出或返回值不符合契约。

- [ ] **Step 6：实现最小环比函数并扩展指标元数据**

```js
export const DATA_CENTER_OVERVIEW_METRICS = Object.freeze([
  { metricCode: "sales.net_sales", label: "净销售额", format: "money", comparison: "relative", favorable: "increase" },
  { metricCode: "sales.quantity", label: "销售数量", format: "number", comparison: "relative", favorable: "increase" },
  { metricCode: "sales.gross_profit", label: "毛利", format: "money", comparison: "relative", favorable: "increase" },
  { metricCode: "sales.refund_rate", label: "退款率", format: "percent", comparison: "percentage_point", favorable: "decrease" },
  { metricCode: "sales.gross_margin_rate", label: "毛利率", format: "percent", comparison: "percentage_point", favorable: "increase" }
]);
```

`compareDataCenterMetric` 必须先检查结果存在、`value !== null`、`status` 可用和 `coverageRate >= 1`；相对比较的上期非零才执行 `(current - previous) / abs(previous) * 100`。百分点比较直接取两期差的绝对显示值，方向由差值符号决定。

- [ ] **Step 7：运行聚焦测试并提交**

Run: `node --test react-tests/data-center-date-comparison.test.mjs react-tests/data-center.test.mjs react-tests/data-center-governed-overview.test.mjs`

Expected: PASS，零失败。

Commit:

```bash
git add src/domain/dataCenter.js react-tests/data-center-date-comparison.test.mjs
git commit -m "feat: add data overview comparison rules"
```

### Task 2：共享确认式日期范围选择器

**Files:**

- Create: `src/ui/DateRangePickerField.jsx`
- Create: `react-tests/date-range-picker.test.mjs`
- Modify: `src/styles.css`
- Modify: `docs/platform/components.md`

**Interfaces:**

- Consumes: `value: { from, to }`, `presets: [{ id, label, range }]`, `maxDate`, `maxDays`, `disabled`.
- Produces: `onConfirm({ from, to })`，只在用户确认变化后的合法完整范围时调用。

- [ ] **Step 1：写共享组件失败测试**

```js
const component = read("src/ui/DateRangePickerField.jsx");
assert.match(component, /mode="range"/);
assert.match(component, /FloatingMenu/);
assert.match(component, /onConfirm/);
assert.match(component, /近 7 天|presets/);
assert.match(component, /确认/);
assert.match(component, /取消/);
assert.match(component, /requestAnimationFrame/);
assert.doesNotMatch(component, /setRange\(/);
```

同时检查 `docs/platform/components.md` 登记 `DateRangePickerField`，检查样式包含 `:focus-visible`、窄屏和 `prefers-reduced-motion`。

- [ ] **Step 2：运行组件测试并确认按预期失败**

Run: `node --test react-tests/date-range-picker.test.mjs`

Expected: FAIL，文件不存在或缺少确认式范围契约。

- [ ] **Step 3：实现组件骨架与草稿边界**

```jsx
export function DateRangePickerField({ value, onConfirm, presets = [], maxDate = "", maxDays = 370, disabled = false, disabledReason = "", ariaLabel = "选择日期范围" }) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => rangeToDates(value));

  const openPicker = () => {
    setDraft(rangeToDates(value));
    setOpen(true);
  };
  const cancel = () => {
    setOpen(false);
    window.requestAnimationFrame(() => anchorRef.current?.focus());
  };
  const confirm = () => {
    const next = datesToRange(draft);
    if (!sameRange(next, value)) onConfirm(next);
    cancel();
  };

  return <div className="date-range-picker-field">
    <button ref={anchorRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} title={disabled ? disabledReason : undefined} onClick={open ? cancel : openPicker}>
      <CalendarDays size={16} aria-hidden="true" />
      <span>{rangeLabel(value)}</span>
    </button>
    <FloatingMenu anchorRef={anchorRef} open={open} onClose={cancel} className="date-range-picker-menu" minWidth={320} maxHeight={560} role="dialog" ariaLabel={ariaLabel}>
      <div className="date-range-presets">
        {presets.map(preset => <button key={preset.id} type="button" onClick={() => setDraft(rangeToDates(preset.range))}>{preset.label}</button>)}
      </div>
      <DayPicker mode="range" selected={draft} onSelect={setDraft} disabled={maxDate ? { after: parseDate(maxDate) } : undefined} max={maxDays - 1} />
      <p className="date-range-validation" role="status">{validation.reason}</p>
      <div className="date-range-actions"><Button onClick={cancel}>取消</Button><Button variant="primary" disabled={!validation.valid} disabledReason={validation.reason} onClick={confirm}>确认</Button></div>
    </FloatingMenu>
  </div>;
}
```

`DayPicker` 使用 `mode="range"`、`selected={draft}`、`onSelect={setDraft}`、`disabled={{ after: parseDate(maxDate) }}` 和 `max={maxDays - 1}`。确认按钮在缺少 `from/to`、倒序、超限或未来日期时禁用，并显示具体原因。

- [ ] **Step 4：实现 Token 化样式与窄屏行为**

浮层不增加厚阴影或嵌套卡片；触发器沿用 `--control-height`、`--radius-control`、`--border-strong`。390px 下快捷项换行，日历宽度限制在视口内，底部操作保持可见。

- [ ] **Step 5：登记共享组件并运行聚焦测试**

在 `docs/platform/components.md` 的基础组件表加入：

```markdown
| `DateRangePickerField` | 确认式日期范围输入 | 草稿不向父级提交；完整合法范围确认后才输出，浮层不被容器裁切 |
```

Run: `node --test react-tests/date-range-picker.test.mjs react-tests/data-center-app.test.mjs`

Expected: PASS，零失败。

- [ ] **Step 6：提交共享组件**

```bash
git add src/ui/DateRangePickerField.jsx src/styles.css docs/platform/components.md react-tests/date-range-picker.test.mjs
git commit -m "feat: add confirmed date range picker"
```

### Task 3：本期与上期共享口径结果编排

**Files:**

- Modify: `src/state/DataStandardsProvider.jsx`
- Modify: `react-tests/data-standards-provider.test.mjs`

**Interfaces:**

- Produces: `comparisonResults`, `comparisonRun`, `comparisonLoading`, `comparisonError`.
- Produces: `ensureComparisonResults(range, metricCodes)` 与 `scheduleComparisonResults(range, metricCodes)`。
- Preserves: `results`、`run`、`ensureResults`、`scheduleEnsureResults` 的现有契约。

- [ ] **Step 1：写独立编排失败测试**

```js
assert.match(provider, /comparisonRequest/);
assert.match(provider, /comparisonResults/);
assert.match(provider, /comparisonError/);
assert.match(provider, /ensureComparisonResults/);
assert.match(provider, /scheduleComparisonResults/);
assert.match(provider, /resolveMetricResults/);
assert.doesNotMatch(provider, /setError\(errorState\(comparison/);
```

- [ ] **Step 2：运行 Provider 测试并确认按预期失败**

Run: `node --test react-tests/data-standards-provider.test.mjs`

Expected: FAIL，缺少比较结果状态与调度方法。

- [ ] **Step 3：抽取单范围结果解析函数**

```js
async function resolveMetricResults({ range, metricCodes, signal }) {
  const query = { metricCodes, from: range.from, to: range.to };
  const current = await loadMetricResults(query, fetch, signal);
  const availableCodes = new Set((current.results || []).map(result => result.metricCode));
  if (metricCodes.every(code => availableCodes.has(code))) return current;
  const requested = await requestMetricCalculation({ ...query, targetVersions: {}, mode: "ensure_current" }, fetch, signal);
  return pollMetricResults({ ...query, runId: requested.run.id }, { signal, interval: 800, maxAttempts: 20 });
}
```

现有 `ensureResults` 改为调用该函数后更新本期状态，行为保持一致。

- [ ] **Step 4：实现上期独立状态和调度**

`comparisonRequest` 与 `resultRequest` 使用不同的 `AbortController`；新上期范围只取消旧上期请求，不取消本期请求。上期错误写入 `comparisonError`，不得调用本期 `setError`。

- [ ] **Step 5：运行 Provider 与 API 客户端回归测试**

Run: `node --test react-tests/data-standards-provider.test.mjs react-tests/data-standards-api-client.test.mjs tests/data-standards-results-api.test.mjs`

Expected: PASS，现有轮询、权限和结果读取测试不回归。

- [ ] **Step 6：提交状态编排**

```bash
git add src/state/DataStandardsProvider.jsx react-tests/data-standards-provider.test.mjs
git commit -m "feat: load previous period metric results"
```

### Task 4：数据总览连接与环比展示

**Files:**

- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `src/features/data-center/DataOverview.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/data-center-governed-overview.test.mjs`
- Modify: `react-tests/data-center-app.test.mjs`
- Modify: `DESIGN.md`
- Modify: `docs/features/data-overview-date-comparison/tasks.md`

**Interfaces:**

- Consumes: Task 1 的 `dataCenterPresetRange`、`previousDataCenterRange`、`compareDataCenterMetric`。
- Consumes: Task 2 的 `DateRangePickerField`。
- Consumes: Task 3 的上期结果和状态。

- [ ] **Step 1：写数据总览失败测试**

```js
assert.match(overview, /DateRangePickerField/);
assert.doesNotMatch(overview, /<input type="date"/);
assert.match(overview, /近 7 天/);
assert.match(overview, /近 15 天/);
assert.match(overview, /近 30 天/);
assert.match(overview, /compareDataCenterMetric/);
assert.match(overview, /环比/);
assert.match(page, /previousDataCenterRange/);
assert.match(page, /scheduleComparisonResults/);
```

- [ ] **Step 2：运行总览测试并确认按预期失败**

Run: `node --test react-tests/data-center-governed-overview.test.mjs react-tests/data-center-app.test.mjs`

Expected: FAIL，页面仍使用两个立即提交的原生日期输入，且没有上期结果。

- [ ] **Step 3：连接确认式日期范围**

`DataOverview` 传入以下快捷项，所有范围以昨天为截止日：

```js
const presets = [7, 15, 30].map(days => ({
  id: `last${days}`,
  label: `近 ${days} 天`,
  range: dataCenterPresetRange(days)
}));
```

`onConfirm={setRange}` 是唯一全局范围提交点；组件内不再保留原生双日期输入。

- [ ] **Step 4：连接上期调度与重试**

`DataCenterAppPage` 用 `useMemo` 计算 `comparisonRange`，先调用 `scheduleEnsureResults(range, codes)`；本期结果齐备后提取每项实际版本，通过 `scheduleComparisonResults(comparisonRange, codes, targetVersions)` 调度上期。重新计算也先取得本期版本再顺序重试上期；兼容回滚开启时不调度上期。

- [ ] **Step 5：渲染环比行**

每个 KPI 用 `compareDataCenterMetric` 生成展示模型：

```jsx
<span className={`data-kpi-comparison ${comparison.available ? comparison.favorable ? "favorable" : "unfavorable" : "neutral"}`}>
  {comparison.available ? formatComparison(comparison) : comparisonReason(comparison.reasonCode)}
</span>
```

上升、下降、持平同时渲染对应图标和中文；上期为零、缺失、覆盖不完整、计算中和失败都有独立文案。

- [ ] **Step 6：写回设计规则并运行聚焦测试**

在 `DESIGN.md` 数据中心段落追加确认式日期范围、快捷项和等长上期环比规则，不写实现细节或临时状态。

Run: `node --test react-tests/data-center-date-comparison.test.mjs react-tests/date-range-picker.test.mjs react-tests/data-center-governed-overview.test.mjs react-tests/data-center-app.test.mjs react-tests/data-standards-provider.test.mjs`

Expected: PASS，零失败。

- [ ] **Step 7：运行浏览器验收**

启动：`npm start`

检查：

- 选择开始日期后页面请求和 KPI 不变化；选择结束日期后仍不变化；确认后只应用一次。
- 取消、Esc、点击外部均保留旧范围并恢复触发按钮焦点。
- 近 7/15/30 天范围正确，确认后才应用。
- 1440、900、640、390px 无溢出；日历不被裁切。
- 上升、下降、持平、上期为零、上期缺失、加载和失败文案可读。
- 控制台无新增 error/warning；钉钉 WebView 中返回、焦点和滚动正常。

- [ ] **Step 8：运行完整 Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
git status --short
```

Expected: 所有命令退出码 0；仅出现本功能文件；无凭据、环境或 D1 变化。

- [ ] **Step 9：完成任务证据并提交**

更新 `tasks.md` 四项复选框和实际命令结果后提交：

```bash
git add DESIGN.md src/features/data-center/DataCenterAppPage.jsx src/features/data-center/DataOverview.jsx src/styles.css react-tests/data-center-governed-overview.test.mjs react-tests/data-center-app.test.mjs docs/features/data-overview-date-comparison/tasks.md docs/features/data-overview-date-comparison/plan.md
git commit -m "feat: add data overview period comparison"
```
