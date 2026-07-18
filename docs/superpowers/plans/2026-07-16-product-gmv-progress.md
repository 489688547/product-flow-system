# 产品 GMV 进度实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture one average monthly GMV target during formal product grading and show live ERP-backed GMV achievement in product progress and product archives.

**Architecture:** Persist only `monthlyGmvTarget` on the product. Derive the annual GMV grading suggestion and all achievement metrics from that target, the product schedule, SKU bindings, and shared sales rows. Reuse one domain calculator and one presentation component so every page shows the same figures.

**Tech Stack:** React 19, Vite, Cloudflare Pages/D1, Node test runner, existing CSS design tokens.

---

### Task 1: Add GMV domain calculations

**Files:**
- Create: `src/domain/productGmv.js`
- Create: `react-tests/product-gmv.test.mjs`

1. Write failing tests for annual GMV score suggestions, current-month achievement, cumulative achievement, percentages above 100%, and missing SKU/schedule states.
2. Run `node --test react-tests/product-gmv.test.mjs` and confirm the missing implementation fails.
3. Implement the smallest pure calculation module that passes the tests.
4. Re-run the focused test.

### Task 2: Persist monthly GMV with formal grading

**Files:**
- Modify: `src/domain/productFlow.js`
- Modify: `src/state/stateModel.js`
- Modify: `src/state/ProductFlowProvider.jsx`
- Modify: `react-tests/shared-state.test.mjs`

1. Add failing tests that grading stores a normalized positive monthly GMV target and state normalization preserves it.
2. Pass the target through `gradeProduct` into `applyProductGrading`.
3. Preserve the target on normal grading and remove it with the product when O-level grading returns to the demand pool.
4. Run the shared-state tests.

### Task 3: Add the grading target input and reference score

**Files:**
- Modify: `src/features/progress/ProductGradingModal.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/react-app.test.mjs`

1. Add failing source-level UI assertions for the monthly GMV input, annualized reference, suggested B1 score, and save payload.
2. Add a compact currency input above the grading dimensions.
3. Require a positive target for product-manager saves and show the annualized B1 suggestion without overriding the selected score.
4. Run focused React tests.

### Task 4: Show shared GMV achievement on progress and archive pages

**Files:**
- Create: `src/features/sales/useProductSalesRows.js`
- Create: `src/features/sales/ProductGmvSummary.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/features/archive/ProductArchivePage.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/react-app.test.mjs`

1. Add failing assertions that both pages use the shared component.
2. Fetch all needed SKU rows once per page and derive each product summary with the shared domain calculator.
3. Show current-month and cumulative achievement in progress, and a compact current-month achievement line in each archive row.
4. Provide explicit states for missing monthly target, missing SKU binding, missing launch schedule, empty sales data, and loading/error.
5. Verify responsive layout and stable row/card heights.

### Task 5: Verify the complete change

**Files:**
- Verify all modified files.

1. Run `npm run test:react`.
2. Run `npm run build`.
3. Start the local Vite server if needed and inspect product progress and product archive at laptop and mobile widths.
4. Review `git diff --check` and `git status --short`.
