# Platform Sales Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort the platform sales table by sales amount by default and expose compact sortable column headers.

**Architecture:** Keep comparator behavior in `salesData.js` and local interaction state in `ProductSalesModal.jsx`. Feed a sorted copy into the existing `DataTable`; add narrowly scoped styles for the header controls.

**Tech Stack:** React 19, Lucide React, JavaScript, Node test runner.

## Global Constraints

- Default to `netSales` descending.
- Do not mutate `summary.byPlatform`.
- Sorting must not change metric cards, trend data, or persisted sales rows.
- Direction must be communicated by icon shape and accessible text, not color alone.

---

### Task 1: Platform sort domain behavior and UI

**Files:**
- Modify: `src/domain/salesData.js`
- Modify: `src/features/archive/ProductSalesModal.jsx`
- Modify: `src/styles.css`
- Test: `tests/sales-data.test.mjs`

**Interfaces:**
- Produces: `sortPlatformSalesRows(rows, sort)` returning a new sorted array.
- Consumes: `{ key, direction }`, where direction is `asc` or `desc`.

- [ ] **Step 1: Write a failing domain test proving sales-desc default, direction toggles, and input immutability.**
- [ ] **Step 2: Run `node --test tests/sales-data.test.mjs` and verify the missing export fails.**
- [ ] **Step 3: Implement the comparator, local sort state, sortable headers, and compact focus/active styles.**
- [ ] **Step 4: Run `npm test` and `npm run build`.**
- [ ] **Step 5: Inspect the table at laptop width and confirm header alignment and stable row height.**
