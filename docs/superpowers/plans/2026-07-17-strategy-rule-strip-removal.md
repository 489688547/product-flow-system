# 战略达成规则提示条移除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除战略卡片中浅蓝色“达成规则”提示区，同时保留战略达成计算和全部 CRUD 能力。

**Architecture:** 这是纯展示层精简。测试先锁定页面源码不再渲染该区域，再移除 JSX、未使用图标和对应 CSS；领域数据与计算函数不修改。

**Tech Stack:** React 19、CSS、Node.js test runner、Vite

## Global Constraints

- 不修改 `strategyAttainment`、`successStandard` 数据或归档规则。
- 不合并 `main`，继续在 `codex/strategy-crud` 隔离分支开发。
- 测试页保持在 `http://127.0.0.1:8136/`。

---

### Task 1: 删除战略达成规则提示区

**Files:**
- Modify: `react-tests/platform-ui.test.mjs`
- Modify: `react-tests/governed-execution-ui.test.mjs`
- Modify: `src/features/strategy/StrategyCenterPage.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `strategyAttainment(state, strategy.id)`，继续提供达成数量与状态。
- Produces: 不包含 `.attainment-rule` 的战略卡片展示。

- [ ] **Step 1: Write the failing test**

```js
assert.doesNotMatch(page, /attainment-rule/);
assert.doesNotMatch(page, /达成规则：全部必达结果核验通过/);
```

删除旧的页面展示断言，保留 `strategyAttainment` 存在性断言，确保业务计算仍被调用。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/governed-execution-ui.test.mjs`

Expected: FAIL，页面源码仍包含 `attainment-rule`。

- [ ] **Step 3: Write minimal implementation**

从 `StrategyCenterPage.jsx` 删除：

```jsx
<div className="attainment-rule">
  <ShieldCheck size={16} />
  <span>
    <strong>达成规则：全部必达结果核验通过</strong>
    <small>{strategy.successStandard}</small>
  </span>
</div>
```

同时从图标导入删除 `ShieldCheck`，从 `src/styles.css` 删除三条 `.attainment-rule` 规则。

- [ ] **Step 4: Run tests and build**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/governed-execution-ui.test.mjs && npm run build`

Expected: 所有目标测试 PASS，Vite build exit 0。

- [ ] **Step 5: Verify the running page**

刷新 `http://127.0.0.1:8136/` 的战略中心，确认战略标题后直接展示必达结果列表，进度数量、编辑和归档操作仍存在。

- [ ] **Step 6: Commit**

```bash
git add react-tests/platform-ui.test.mjs react-tests/governed-execution-ui.test.mjs src/features/strategy/StrategyCenterPage.jsx src/styles.css
git commit -m "style(strategy): remove rule strip"
```
