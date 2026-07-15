# Product Progress Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact, shared development-to-launch schedule summary to the product progress page without changing workflow stage or task state.

**Architecture:** Extend the existing dashboard schedule domain helper so it returns one reusable summary for any product. Render that summary through a focused progress-page component placed between `PageHeader` and the stage grid. Missing or invalid legacy schedules remain neutral and route users to product planning.

**Tech Stack:** React 19, Vite, CSS design tokens, Node test runner.

## Global Constraints

- `productPlans` remains the only source of development and launch dates.
- Dashboard and product progress must use the same percentage and status rules.
- Missing or invalid dates display `未设置排期`, never `0%`.
- Products in launch or review stages display green `100%` and are never overdue.
- No new runtime dependency.

---

### Task 1: Shared Product Schedule Summary

**Files:**
- Modify: `src/domain/dashboardSummary.js`
- Modify: `react-tests/dashboard-summary.test.mjs`

**Interfaces:**
- Produces: `buildProductScheduleSummary(product, plans, demands, today)` returning `{ product, plan, schedule }`.
- `schedule` includes `state`, `percent`, `label`, `launchDate`, `developmentStart`, `daysRemaining`.

- [x] **Step 1: Write failing tests**

Add cases for future development start, seven-day launch warning, missing dates and a shared single-product summary.

- [x] **Step 2: Verify failure**

Run `node --test react-tests/dashboard-summary.test.mjs`; expect the new exported helper or states to fail.

- [x] **Step 3: Implement the reusable helper**

Export `buildProductScheduleSummary` and make `buildDashboardProductSummaries` map through it. Preserve P0-P3 sorting.

- [x] **Step 4: Verify pass**

Run `node --test react-tests/dashboard-summary.test.mjs`; expect all dashboard schedule tests to pass.

### Task 2: Product Progress Schedule Component

**Files:**
- Create: `src/features/progress/ProductScheduleSummary.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: a `schedule` object from `buildProductScheduleSummary` and `onOpenPlanning()`.
- Produces: an accessible compact strip with progress ring, date range, status and optional planning action.

- [x] **Step 1: Write failing source acceptance assertions**

Assert that product progress imports the shared schedule helper and renders `ProductScheduleSummary` before `.stage-grid`.

- [x] **Step 2: Verify failure**

Run `node --test react-tests/react-app.test.mjs`; expect missing component assertions to fail.

- [x] **Step 3: Implement component and styling**

Render the ring, development and launch dates, status label, and `前往产品规划` only for unplanned schedules. Use existing tokens for active, warning, danger and success states.

- [x] **Step 4: Verify pass**

Run `node --test react-tests/react-app.test.mjs`; expect all React acceptance tests to pass.

### Task 3: Full Verification and Design Audit

**Files:**
- Verify only.

**Interfaces:**
- Consumes: completed domain and UI changes.
- Produces: test, build and browser evidence.

- [x] **Step 1: Run full test and build**

Run `npm run test:react && npm run build`; expect all tests and Vite build to pass.

- [x] **Step 2: Inspect the local page at 1440x900**

Confirm the summary is between the page header and stage cards, aligns to the content width, and does not compete with the title.

- [x] **Step 3: Inspect the local page at 1024x768**

Confirm dates and action remain readable without overlap or horizontal page overflow.
