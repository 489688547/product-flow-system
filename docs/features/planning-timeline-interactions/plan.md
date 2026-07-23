# 产品规划时间轴拖动实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让有权限的用户在年度时间轴中直接移动或缩放产品规划日期范围，并修复日期截断和表格底部断裂观感。

**Architecture:** 日期格式化、像素到日历日换算、整段移动和端点缩放放在 `src/domain/productPlanning.js`，保持 UTC 日历日纯计算。产品规划功能内新增 `PlanningRangeBar`，用 Pointer Events 和组件内预览状态处理拖动，松开时仅向页面提交一次；页面继续通过现有 `updateProductPlan` 持久化。

**Tech Stack:** React 19、原生 Pointer Events、Node test、现有 CSS 设计令牌。

## Global Constraints

- 同月日期显示 `7月8日—28日`，跨月显示 `7月22日—8月25日`。
- 开始和结束同日表示最短 1 个日历日。
- 指针移动达到 4px 才进入拖动。
- 拖动中只预览，松开后仅提交一次；取消恢复原日期。
- 中部拖动保持周期不变且结果至少与当前年份相交。
- 边缘缩放不越过另一端，并限制在当前年度轨道内。
- 不新增拖拽依赖，不改变规划数据结构、权限和共享状态接口。
- 键盘用户继续通过 Enter 或 Space 打开精确日期弹窗。

---

## 文件职责

- 修改 `src/domain/productPlanning.js`：提供日期展示和拖动纯函数。
- 新建 `src/features/planning/PlanningRangeBar.jsx`：渲染时间条并封装 Pointer Events 交互。
- 修改 `src/features/planning/AnnualPlanningTimeline.jsx`：用新时间条替换旧静态条，传递保存回调。
- 修改 `src/features/planning/ProductPlanningPage.jsx`：把一次拖动结果交给现有 `updateProductPlan`。
- 修改 `src/styles.css`：时间条状态、手柄命中区、表格收口和响应式样式。
- 修改 `react-tests/product-planning.test.mjs`：覆盖纯日期运算。
- 修改 `react-tests/react-app.test.mjs`：约束 UI 复用、权限、可访问和保存边界。
- 修改 `DESIGN.md`：记录年度规划时间轴的持久交互规则。

## 接口与契约

```js
formatPlanningDateRange(start, end)
// => "7月8日—28日" | "7月22日—8月25日" | "2026年12月15日—2027年2月10日" | ""

planningDaysFromPixels(pixelDelta, trackWidth, year)
// => 按当年 365/366 天换算并四舍五入的整数日

movePlanningRange(start, end, deltaDays, year)
// => { developmentStart, launchDate }，保持含首尾周期长度，且至少与 year 相交

resizePlanningRange(start, end, edge, deltaDays, year)
// edge: "start" | "end"
// => { developmentStart, launchDate }，同日为最短值，端点限制在 year 内
```

```jsx
<PlanningRangeBar
  plan={plan}
  year={year}
  canEdit={canEdit}
  onEdit={() => onEditPlan(plan)}
  onChange={dates => onChangePlanDates(plan.id, dates)}
/>
```

## 数据迁移

无数据迁移。继续写入现有 `developmentStart` 和 `launchDate` ISO 日期字段，旧数据和旧弹窗完全兼容。

## 风险与回滚

- 指针捕获失败或取消：清除本地预览，不写共享状态。
- 短时间条误触：4px 阈值区分点击和拖动，边缘命中区视觉克制但保持可触达。
- 跨年边界：领域函数先约束结果，组件仅渲染已验证结果。
- 回滚：恢复 `AnnualPlanningTimeline` 中原 `PlanningBar`，删除功能内组件与新增领域函数；规划数据无需恢复。

## Task 1: 日期展示与拖动领域规则

**Files:**
- Modify: `react-tests/product-planning.test.mjs`
- Modify: `src/domain/productPlanning.js`

**Interfaces:**
- Produces: `formatPlanningDateRange`、`planningDaysFromPixels`、`movePlanningRange`、`resizePlanningRange`

- [ ] **Step 1: 写失败测试**

```js
assert.equal(formatPlanningDateRange("2026-07-08", "2026-07-28"), "7月8日—28日");
assert.equal(formatPlanningDateRange("2026-07-22", "2026-08-25"), "7月22日—8月25日");
assert.equal(planningDaysFromPixels(100, 1000, 2026), 37);
assert.deepEqual(movePlanningRange("2026-07-08", "2026-07-28", 10, 2026), {
  developmentStart: "2026-07-18",
  launchDate: "2026-08-07"
});
assert.deepEqual(resizePlanningRange("2026-07-08", "2026-07-28", "start", 30, 2026), {
  developmentStart: "2026-07-28",
  launchDate: "2026-07-28"
});
```

- [ ] **Step 2: 确认测试因缺少导出失败**

Run: `node --test react-tests/product-planning.test.mjs`

Expected: FAIL，提示新增导出不存在。

- [ ] **Step 3: 实现最小纯函数**

使用 `Date.UTC`、`86400000` 和 ISO 字符串转换，不使用本地时区毫秒差；移动范围用当前年相交边界约束，缩放范围用当前年度及另一端约束。

- [ ] **Step 4: 确认领域测试通过**

Run: `node --test react-tests/product-planning.test.mjs`

Expected: PASS。

## Task 2: 可拖动时间条交互

**Files:**
- Create: `src/features/planning/PlanningRangeBar.jsx`
- Modify: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: Task 1 的四个纯函数、现有 `timelineSegment`
- Produces: `PlanningRangeBar`

- [ ] **Step 1: 写失败的 UI 契约测试**

```js
assert.match(rangeBar, /setPointerCapture/);
assert.match(rangeBar, /onPointerCancel/);
assert.match(rangeBar, /DRAG_THRESHOLD_PX = 4/);
assert.match(rangeBar, /event\.key === "Enter" \|\| event\.key === " "/);
assert.match(rangeBar, /formatPlanningDateRange/);
assert.match(rangeBar, /aria-label/);
```

- [ ] **Step 2: 确认测试因组件不存在失败**

Run: `node --test react-tests/react-app.test.mjs`

Expected: FAIL，提示无法读取 `PlanningRangeBar.jsx`。

- [ ] **Step 3: 实现最小 Pointer Events 状态机**

指针会话存入 `useRef`；只有整数日期预览变化时更新 React state。普通点击调用 `onEdit`，拖动完成调用一次 `onChange`，`Esc`、`pointercancel` 和丢失捕获恢复预览。

- [ ] **Step 4: 确认 UI 契约测试通过**

Run: `node --test react-tests/react-app.test.mjs`

Expected: PASS。

## Task 3: 页面接线、表格收口和持久设计规则

**Files:**
- Modify: `src/features/planning/AnnualPlanningTimeline.jsx`
- Modify: `src/features/planning/ProductPlanningPage.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/react-app.test.mjs`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: Task 2 的 `PlanningRangeBar`
- Produces: `onChangePlanDates(planId, dates)` 页面回调

- [ ] **Step 1: 写失败的集成与样式契约测试**

```js
assert.match(timeline, /<PlanningRangeBar/);
assert.match(page, /onChangePlanDates=/);
assert.match(page, /updateProductPlan\(planId, dates\)/);
assert.match(styles, /\.planning-range-handle/);
assert.match(styles, /touch-action: pan-y/);
assert.doesNotMatch(styles, /\.planning-timeline-row:last-child \{ border-bottom: 0; \}/);
```

- [ ] **Step 2: 确认测试因旧接线和旧样式失败**

Run: `node --test react-tests/react-app.test.mjs`

Expected: FAIL，指出时间条、保存回调或收口样式仍为旧实现。

- [ ] **Step 3: 完成最小接线和样式**

时间轴传递 `plan/year/canEdit`；页面保存仅调用一次 `updateProductPlan(planId, dates)`。样式为表格保留完整底边和圆角裁切，产品行增加稳定上下留白，时间条只显示日期，边缘悬停显示克制手柄，焦点和只读状态明确。

- [ ] **Step 4: 更新 durable design rule**

在 `DESIGN.md` 增加产品规划年度时间轴段落，记录日期文案、中心拖动、边缘缩放、4px 阈值、键盘回退和年度边界。

- [ ] **Step 5: 确认定向测试通过**

Run: `node --test react-tests/product-planning.test.mjs react-tests/react-app.test.mjs`

Expected: PASS。

## Task 4: 浏览器与全量质量门禁

**Files:**
- Modify: `docs/features/planning-timeline-interactions/tasks.md`

- [ ] **Step 1: 启动本地测试环境**

Run: `npm run seed:sandbox && npm run start:sandbox`

Expected: Vite 页面可打开，测试写入不触碰生产库。

- [ ] **Step 2: 浏览器验收**

在 1440px、900px、390px 检查日期可读、底边收口、横向滚动；验证中心移动、两侧缩放、点击弹窗、Esc 取消、只读状态、键盘焦点与触控纵向滚动。

- [ ] **Step 3: 运行 Definition of Done**

Run:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: 全部通过。

- [ ] **Step 4: 完成任务记录与差异检查**

Run: `git status --short && git diff --check`

Expected: 只有本功能文件，且无空白错误。

## 验证命令

```bash
node --test react-tests/product-planning.test.mjs
node --test react-tests/react-app.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```
