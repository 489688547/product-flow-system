# Permission Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build department-based navigation permissions and department/title-based feature permissions while fixing DingTalk shared-state loading.

**Architecture:** Keep permission evaluation in a pure domain module, normalize it in the shared state model, and let App and SettingsPage consume the same rules. Reuse the existing organization selector and floating menu.

**Tech Stack:** React 19, Vite, existing CSS design tokens, Cloudflare Pages/D1.

## Global Constraints

- Total management office always retains administration access.
- Permission choices come from the DingTalk organization cache.
- Product managers can view and edit product task templates by default.
- Shared state requests must support payloads larger than 64KB in DingTalk WebView.

---

### Task 1: Permission domain and migration

**Files:** Create `src/domain/permissions.js`; modify `src/domain/productFlow.js`, `src/state/stateModel.js`; test `tests/shared-state.test.mjs`.

- [ ] Add failing tests for navigation and feature permissions.
- [ ] Implement default permission configuration and pure access predicates.
- [ ] Normalize legacy shared settings and run targeted tests.

### Task 2: Permission settings interface

**Files:** Create `src/features/settings/PermissionSettings.jsx`; modify `src/features/settings/SettingsPage.jsx`, `src/ui/OrgSelect.jsx`, `src/features/settings/TaskTemplateSettings.jsx`, `src/styles.css`; test `tests/react-app.test.mjs`.

- [ ] Add failing component-contract tests.
- [ ] Build navigation and feature permission matrices with organization selectors.
- [ ] Add read-only task-template rendering and run targeted tests.

### Task 3: Enforce navigation and feature permissions

**Files:** Modify `src/App.jsx`, `src/features/settings/SettingsPage.jsx`; test `tests/react-app.test.mjs`.

- [ ] Add failing tests for filtered navigation and protected hashes.
- [ ] Filter navigation and redirect unauthorized routes.
- [ ] Verify settings sections against the same domain rules.

### Task 4: DingTalk load failure

**Files:** Modify `src/state/ProductFlowProvider.jsx`; test `tests/react-app.test.mjs`.

- [ ] Add a failing test that rejects `keepalive` on state payloads.
- [ ] Remove `keepalive` and translate WebView fetch errors to Chinese.
- [ ] Run full tests and verify in local browser and DingTalk.

### Task 5: Release

**Files:** Build `dist`, sync to `/Users/roger/Documents/product-flow-system`, commit and push.

- [ ] Run `npm test` and `npm run build`.
- [ ] Browser-audit permissions at laptop width.
- [ ] Publish and confirm production asset hashes.
