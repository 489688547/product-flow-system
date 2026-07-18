# 供应链主导航实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all supply-chain workspace tabs into the system primary sidebar, matching the product-lifecycle navigation pattern, and remove the page-internal secondary navigation.

**Architecture:** Define the eight supply-chain routes in `App.jsx` and map every route to the existing `supply-chain` navigation permission. Make `SupplyChainAppPage` controlled by a `section` prop so the URL is the source of truth. Remove the obsolete internal-nav component and CSS while preserving all business workspaces.

**Tech Stack:** React 19, Lucide React, plain CSS, Node test runner, Vite.

## Global Constraints

- The global sidebar is the only supply-chain navigation surface.
- The supply-chain group is parallel to the product-lifecycle group.
- All eight routes reuse one existing supply-chain permission scope.
- Existing business data and integration behavior must not change.
- Legacy `#supply-chain` links open the supply-chain overview.
- Do not deploy.

---

### Task 1: Primary sidebar routes and shared permission

**Files:**
- Modify: `react-tests/supply-chain-ui.test.mjs`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: eight `supply-*` routes in the `供应链管理` group.
- Preserves: the existing `supply-chain` permission key and legacy URL.

- [x] Add a failing source-level test that requires the eight labels and route keys in `App.jsx`, rejects a `业务 Apps` supply-chain item, and requires a permission-key mapping to `supply-chain`.
- [x] Run `node --test react-tests/supply-chain-ui.test.mjs` and confirm the new test fails for the missing primary routes.
- [x] Add the eight navigation records and icons, route-to-section mapping, permission alias, and legacy hash alias in `App.jsx`.
- [x] Run the focused test and confirm it passes.

### Task 2: Route-controlled supply-chain page

**Files:**
- Modify: `react-tests/supply-chain-ui.test.mjs`
- Modify: `src/features/supply-chain/SupplyChainAppPage.jsx`
- Delete: `src/features/supply-chain/SupplyChainSectionNav.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `section` supplied by `App.jsx` using the keys `overview`, `suppliers`, `approvals`, `products`, `inventory`, `quality`, `records`, and `settings`.
- Produces: one workspace without local section state or internal navigation.

- [x] Add a failing test that requires the `section` prop and rejects `SupplyChainSectionNav`, `supply-chain-layout`, and all internal-nav CSS selectors.
- [x] Run the focused test and confirm it fails against the current page-internal navigation.
- [x] Make `SupplyChainAppPage` consume `section`, render errors/loading/content directly, delete the internal nav component, and remove only its CSS.
- [x] Run the focused test and confirm it passes.

### Task 3: Regression and browser verification

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Verifies: navigation, permissions, legacy routing, responsive shell, and unchanged business behavior.

- [x] Run `npm test` and require all React and API tests to pass.
- [x] Run `npm run build` and require a successful Vite production build.
- [x] Check `#supply-overview`, representative workspace routes, and legacy `#supply-chain` in the browser.
- [x] Check 1440px, 1024px, and 390px widths for sidebar behavior, content overflow, and console errors.
- [x] Review the final diff for unrelated changes and prepare the correction commit.
