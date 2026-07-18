# 任务类别与责任部门实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify four task categories, category-specific actions, and searchable multi-select responsibility departments.

**Architecture:** Keep task ownership serialized as the existing slash-delimited string while adding domain helpers for category migration and action capabilities. Extend the shared organization selector with an opt-in department multi-select mode so progress and settings reuse one component.

**Tech Stack:** React 19, Vite 7, Tailwind CSS 4, Node test runner, Cloudflare Pages/D1.

## Global Constraints

- Categories are exactly `会前准备`, `会议`, `决策`, and `待办任务`.
- Meeting tasks show only meeting scheduling; decision and todo tasks show only DingTalk todo sync; preparation tasks show neither.
- Department search stays inside a floating menu and selected departments remain readable in a compact table cell.
- Persist department selections in the existing slash-delimited string format.

---

### Task 1: Domain rules and migration

**Files:**
- Modify: `/Users/roger/Documents/product-flow-system-react/src/domain/productFlow.js`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/state/stateModel.js`
- Test: `/Users/roger/Documents/product-flow-system-react/tests/dingtalk-meeting.test.mjs`
- Test: `/Users/roger/Documents/product-flow-system-react/tests/shared-state.test.mjs`

**Interfaces:**
- Produces: `TASK_CATEGORIES`, `normalizeTaskCategory(category)`, and `taskCategoryActions(category)`.

- [ ] Write failing tests for the four categories, legacy mappings, and action matrix.
- [ ] Run targeted tests and confirm the old categories and action logic fail.
- [ ] Implement category normalization and apply it to tasks and templates.
- [ ] Run targeted tests and confirm migration preserves existing task execution fields.

### Task 2: Searchable department multi-select

**Files:**
- Modify: `/Users/roger/Documents/product-flow-system-react/src/ui/OrgSelect.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/styles.css`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/features/progress/ProductProgressPage.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/features/settings/TaskTemplateSettings.jsx`
- Test: `/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs`

**Interfaces:**
- Consumes: slash-delimited department strings.
- Produces: `OrgSelect` with `multiple` and `searchInMenu` options, returning a normalized slash-delimited string.

- [ ] Write failing source-contract tests for multi-select usage and embedded search.
- [ ] Run the focused React test and confirm failure.
- [ ] Add checkbox-style department selection without closing the floating menu.
- [ ] Use multi-select mode in progress tasks and task template settings.
- [ ] Run the focused React test and confirm pass.

### Task 3: Category-specific task actions

**Files:**
- Modify: `/Users/roger/Documents/product-flow-system-react/src/features/progress/ProductProgressPage.jsx`
- Modify: `/Users/roger/Documents/product-flow-system-react/src/styles.css`
- Test: `/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs`

**Interfaces:**
- Consumes: `taskCategoryActions(category)`.
- Produces: conditional meeting and todo controls while preserving completion and delete controls.

- [ ] Write failing UI contract tests for each category action.
- [ ] Run the focused React test and confirm failure.
- [ ] Render meeting and todo controls from the domain capability matrix.
- [ ] Run the full test suite and production build.
- [ ] Verify the four category rows and multi-department selector in the local browser.
- [ ] Copy the built artifacts to the deployment repository, commit, push, and verify the production asset hash.
