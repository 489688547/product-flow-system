# 供应链真实数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the supply-chain app to the real DingTalk purchase/payment relationship, expose ERP-versus-stocktake inventory controls, and make supplier quality traceable without persisting sensitive approval payloads.

**Architecture:** Keep the existing normalized supply-chain state and D1 record store. Extend the DingTalk normalization boundary to emit a small safe record, derive money from the related purchase payload when necessary, then compute source-aware summaries in the domain layer. The React workspaces consume those derived fields; the local Node helper mirrors the production API with file persistence for the development test page.

**Tech Stack:** React 19, Vite 7, Node test runner, Cloudflare Pages Functions/D1, DingTalk Top API, existing XLSX streaming importer.

## Global Constraints

- Purchase request and payment approval remain separate entities linked only by DingTalk related-approval data.
- Actual paid includes completed/approved payments only.
- Inventory funds remain `actual paid - sales cost`, with stocktake adjustments retained as an auditable calibration layer.
- Kuaimai inventory is labelled as imported snapshot until a verified inventory API is available.
- Bank accounts, identity attachments, detailed addresses, full phone numbers, and raw approval payloads must not enter frontend state.
- Preserve the product-lifecycle-style global left navigation.

---

### Task 1: Parse real DingTalk related approvals safely

**Files:**
- Modify: `tests/dingtalk-approval-sync.test.mjs`
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Modify: `src/domain/supplyChain.js`

**Interfaces:**
- Consumes: DingTalk `form_component_values` or `formValueVOS`, including `value`, `ext_value`, or `extValue`.
- Produces: `normalizeDingSupplyApproval(instance, mapping)` records with `amount`, `amountSource`, `purchaseProcessInstanceId`, `reason`, `businessCategory`, and no `rawPayload`.

- [ ] **Step 1: Write the failing tests**

```js
test("payment normalization reads related instance and amount from FormRelateField extValue", () => {
  const normalized = normalizeDingSupplyApproval(realRelationFixture, {
    kind: "payment",
    relatedPurchaseFieldId: "采购申请单"
  });
  assert.equal(normalized.record.purchaseProcessInstanceId, "purchase-1");
  assert.equal(normalized.record.amount, 30000);
  assert.equal(normalized.record.amountSource, "related-purchase");
});

test("approval normalization does not persist raw or payee fields", () => {
  const normalized = normalizeDingSupplyApproval(sensitiveFixture, purchaseMapping);
  assert.equal("rawPayload" in normalized.record, false);
  assert.equal(JSON.stringify(normalized.record).includes("6222"), false);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/dingtalk-approval-sync.test.mjs`

Expected: failures because `extValue` is ignored and `rawPayload` is still persisted.

- [ ] **Step 3: Implement the safe field and relation parsers**

Add helpers that normalize both DingTalk response shapes, locate fields by id/name, parse the related field extension JSON, and extract only allow-listed business fields. Prefer an explicit payment amount field; otherwise read `金额（元）` or `付款金额` from the related row.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test tests/dingtalk-approval-sync.test.mjs`

Expected: all approval sync tests pass.

### Task 2: Add payment integrity and ERP/stocktake summary controls

**Files:**
- Modify: `tests/supply-chain-domain.test.mjs`
- Modify: `src/domain/supplyChain.js`

**Interfaces:**
- Consumes: normalized purchase/payment records, active product-supplier links, sales rows, and inventory snapshots.
- Produces: `buildSupplyChainSummary()` with `erpInventoryQuantity`, `physicalInventoryQuantity`, `quantityVariance`, `erpInventoryValue`, `physicalInventoryValue`, and payment exception counts.

- [ ] **Step 1: Write failing domain tests**

```js
test("summary counts only approved payments and flags overpayment", () => {
  const summary = buildSupplyChainSummary(paymentFixture);
  assert.equal(summary.actualPaid, 120);
  assert.equal(summary.exceptions.overpaidPurchases, 1);
});

test("summary uses only primary BOM links and compares latest ERP to physical stock", () => {
  const summary = buildSupplyChainSummary(inventoryFixture);
  assert.equal(summary.byProduct[0].bomUnitCost, 2.5);
  assert.equal(summary.byProduct[0].erpInventoryQuantity, 100);
  assert.equal(summary.byProduct[0].physicalInventoryQuantity, 96);
  assert.equal(summary.byProduct[0].quantityVariance, -4);
});
```

- [ ] **Step 2: Run the domain tests and verify RED**

Run: `node --test tests/supply-chain-domain.test.mjs`

Expected: the new summary fields and exception counters are missing.

- [ ] **Step 3: Implement the calculations**

Group active BOM links by product/category/material, select primary links, calculate one BOM unit cost, and allocate supplier consumption only to those links. Select the latest inventory snapshot per product/SKU/warehouse and aggregate ERP and physical quantities and values. Compare approved payment totals with purchase approved amounts.

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run: `node --test tests/supply-chain-domain.test.mjs`

Expected: all supply-chain domain tests pass.

### Task 3: Expand import fields for operational sheets

**Files:**
- Modify: `tests/supply-chain-domain.test.mjs`
- Modify: `src/domain/supplyChain.js`
- Modify: `src/features/supply-chain/ProductSupplyWorkspace.jsx`
- Modify: `src/features/supply-chain/QualityWorkspace.jsx`

**Interfaces:**
- Consumes: current inventory/quality XLSX headers and manual BOM entries.
- Produces: normalized quality batch/supplier/action/verification fields and BOM `supplyRole` values.

- [ ] **Step 1: Add failing parser tests**

```js
test("quality import preserves batch supplier disposition corrective action and verification", () => {
  const result = parseQualityImportRows([qualityRow], { products, suppliers });
  assert.deepEqual(result.validRows[0], assert.objectContaining({
    batchNo: "B-001",
    supplierId: "s1",
    disposition: "召回",
    correctiveAction: "调整烘干工艺",
    verificationResult: "复检通过"
  }));
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/supply-chain-domain.test.mjs`

Expected: the new quality fields are absent.

- [ ] **Step 3: Implement parser aliases and UI fields**

Add header aliases from complaint, warehouse acceptance, arrival inspection, and monthly inspection sheets. Add 主供/备选 to the product-supplier form and show batch, warehouse, supplier, disposition, corrective action, and verification in the quality table.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/supply-chain-domain.test.mjs`

Expected: all parser tests pass.

### Task 4: Make the React workspaces source-aware

**Files:**
- Modify: `src/features/supply-chain/SupplyChainOverview.jsx`
- Modify: `src/features/supply-chain/ApprovalWorkspace.jsx`
- Modify: `src/features/supply-chain/InventoryWorkspace.jsx`
- Modify: `src/features/supply-chain/SupplierWorkspace.jsx`
- Modify: `src/features/supply-chain/SupplyChainAppPage.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: extended summary and normalized records from Tasks 1-3.
- Produces: visible payment lineage, ERP/physical reconciliation, supplier quality risk, and a data-source center.

- [ ] **Step 1: Add static UI contract assertions**

Extend the existing UI test to require the labels `审批实付`, `ERP库存`, `实盘库存`, `付款超申请`, `快麦销售成本`, and `文件快照`.

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --test tests/supply-chain-ui.test.mjs`

Expected: missing-label assertions fail.

- [ ] **Step 3: Implement the workspace updates**

Render a restrained metric strip and reconciliation table on the overview, separate purchase and payment states in the approval table, show latest ERP/physical snapshot fields in inventory, add quality risk to suppliers, and turn synchronization records into five source-status cards plus history.

- [ ] **Step 4: Run the UI test and verify GREEN**

Run: `node --test tests/supply-chain-ui.test.mjs`

Expected: all UI contract assertions pass.

### Task 5: Enable real local development sync

**Files:**
- Modify: `tests/local-supply-server.test.mjs`
- Modify: `server.mjs`

**Interfaces:**
- Consumes: local `.env` DingTalk credentials and the same normalization/sync function used by production.
- Produces: local `GET/POST /api/supply-chain` and `POST /api/supply-chain/approvals/sync`, persisted to `.local-data/supply-chain-state.json`.

- [ ] **Step 1: Add failing route/source assertions**

Verify the local server imports `normalizeSupplyChainState` and `syncSupplyApprovals`, defines the local supply state path, and routes both supply-chain endpoints.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/local-supply-server.test.mjs`

Expected: local supply routes are missing.

- [ ] **Step 3: Implement the local handlers**

Read/write normalized state atomically through the existing local data directory. Approval sync obtains a DingTalk token, uses the same 30-day default window as production, updates local state, and returns counts. Do not bypass production authorization; these routes are local-development-only because the server binds to `127.0.0.1`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/local-supply-server.test.mjs`

Expected: route contract tests pass.

### Task 6: Full verification and development-page deployment

**Files:**
- Modify only if verification reveals a scoped defect.

**Interfaces:**
- Consumes: completed implementation.
- Produces: running development page at `http://127.0.0.1:8134/#supply-overview`.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 2: Build production assets**

Run: `npm run build`

Expected: Vite exits 0 without unresolved imports.

- [ ] **Step 3: Start or refresh helper and Vite services**

Run the local helper on `127.0.0.1:8127` and Vite on `127.0.0.1:8134` from this worktree.

- [ ] **Step 4: Verify the served application**

Check HTTP 200 for the page and API, then inspect the overview, approval, inventory, and quality hashes at desktop and narrow widths. Confirm the global left navigation remains fixed, tables scroll instead of clipping, source labels are visible, and no raw approval account data appears in rendered HTML or local supply state.

- [ ] **Step 5: Review diff and commit**

Run: `git diff --check`, `git status --short`, and commit the verified scoped changes on `codex/supply-chain-management-app`.
