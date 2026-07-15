# Product Workflow Task Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure level-specific stage task templates in Settings and expose DingTalk deliverable templates from each product task.

**Architecture:** Store company-wide template definitions in `settings.taskTemplates`. Generate stable per-product execution tasks keyed by `templateId`, synchronizing structural fields while preserving product execution state and manual tasks. Reuse the existing floating selectors, modal, organization selector, and D1 company-state persistence.

**Tech Stack:** React 19, Vite 7, Tailwind CSS 4, Node test runner, Cloudflare Pages Functions and D1.

## Global Constraints

- Default tasks are isolated by exact product level and stage.
- Template edits preserve task due dates, completion, DingTalk metadata, and uploaded deliverables.
- Manual product tasks are preserved.
- Deliverable templates only accept `alidocs.dingtalk.com` links.
- All shared configuration persists through the existing `/api/state` company record.

---

### Task 1: Template domain model and migration

**Files:**
- Modify: `src/domain/productFlow.js`
- Modify: `src/state/stateModel.js`
- Test: `tests/shared-state.test.mjs`

**Interfaces:**
- Produces: `DEFAULT_TASK_TEMPLATES`, `taskTemplatesForProductStage(state, product, stage)`, `updateWorkflowTaskTemplates(state, templates)`, and a template-driven `syncDefaultTasksForProduct(state, product)`.

- [ ] Write failing tests for level isolation, stable template IDs, preservation of runtime fields/manual tasks, template deletion, and missing-settings migration.
- [ ] Run `node --test tests/shared-state.test.mjs` and verify the new tests fail for missing template APIs.
- [ ] Implement normalized default templates and template-driven synchronization.
- [ ] Run `node --test tests/shared-state.test.mjs` and verify all domain tests pass.

### Task 2: Settings task-template editor

**Files:**
- Modify: `src/features/settings/SettingsPage.jsx`
- Create: `src/features/settings/TaskTemplateSettings.jsx`
- Create: `src/features/settings/DeliverableTemplateEditorModal.jsx`
- Modify: `src/state/ProductFlowProvider.jsx`
- Modify: `src/styles.css`
- Test: `tests/react-app.test.mjs`

**Interfaces:**
- Consumes: `state.settings.taskTemplates`, `PRODUCT_LEVELS`, `STAGES`, `TASK_CATEGORIES`, `updateWorkflowTaskTemplates`.
- Produces: `updateTaskTemplates(templates)` provider action and a settings editor that saves the complete normalized template array.

- [ ] Write failing component-contract tests for level/stage selectors, editable task rows, organization selectors, template modal, add/delete confirmation, and save action.
- [ ] Run the targeted React tests and verify failure because the settings components do not exist.
- [ ] Implement the editor and provider action using existing UI primitives.
- [ ] Add compact responsive styles and run the targeted React tests until green.

### Task 3: Product task deliverable-template viewer

**Files:**
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/features/progress/TaskDeliverables.jsx`
- Create: `src/features/progress/TaskTemplateModal.jsx`
- Modify: `src/styles.css`
- Test: `tests/react-app.test.mjs`

**Interfaces:**
- Consumes: each generated task's `deliverableTemplates` array.
- Produces: a `模板` button after the add button and a read-only DingTalk document list modal.

- [ ] Write failing tests for button order, disabled empty state, modal document cards, and safe external opening.
- [ ] Run the targeted test and verify it fails because the viewer is absent.
- [ ] Implement the button and modal with existing `Modal` and `Button` primitives.
- [ ] Run targeted tests and verify they pass.

### Task 4: Full verification and deployment

**Files:**
- Sync build output into: `/Users/roger/Documents/product-flow-system`

**Interfaces:**
- Consumes: verified React build.
- Produces: deployed Cloudflare Pages version using the existing repository pipeline.

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run build` and require a successful Vite production build.
- [ ] Test the local Settings and Product Progress flows in the browser at `http://127.0.0.1:8130`.
- [ ] Replay the production `/api/state` payload through `normalizeClientState` and verify template migration without lost execution metadata.
- [ ] Sync `dist` to the deployment repository, commit intentionally, and push.
- [ ] Verify the live Cloudflare URL loads the new settings editor and task template modal without console errors.
