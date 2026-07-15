# Demand Created At Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store real demand creation timestamps and render stable relative dates in the demand pool.

**Architecture:** Add focused demand-date helpers in the domain layer, normalize legacy records at the shared-state boundary, and make the demand provider create records through one constructor. The D1 state envelope remains unchanged.

**Tech Stack:** React, JavaScript, Node test runner, Cloudflare Pages Functions/D1 JSON state.

## Global Constraints

- Do not change the D1 table schema.
- Preserve compatibility with legacy `created` values.
- Do not modify dates in packages or feedback issues.

---

### Task 1: Demand creation date domain behavior

**Files:**
- Create: `src/domain/demandDate.js`
- Modify: `src/state/stateModel.js`
- Modify: `src/state/ProductFlowProvider.jsx`
- Modify: `src/features/demands/DemandPoolPage.jsx`
- Test: `tests/shared-state.test.mjs`

**Interfaces:**
- Produces: `createDemandRecord(demand, now)`, `normalizeDemandCreatedAt(demand)`, `formatDemandCreatedAt(createdAt, now)`.
- Consumes: legacy demand `id`, `created`, and optional `createdAt`.

- [ ] **Step 1: Write failing tests for ISO creation, legacy migration, and relative display.**
- [ ] **Step 2: Run `node --test tests/shared-state.test.mjs` and confirm failures are caused by missing date behavior.**
- [ ] **Step 3: Implement the domain helpers and connect normalization, creation, and table rendering.**
- [ ] **Step 4: Run `npm test` and confirm the full suite passes.**
- [ ] **Step 5: Run `npm run build` and inspect the production bundle result.**
