import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPLY_CHAIN_WORKFLOW_RESOURCES,
  assertSupplyChainWorkflowAction,
  normalizeSupplyChainWorkflowFields,
  ownerDepartmentForResource,
  supplyChainWorkflowInitialStatus
} from "../src/domain/supplyChainWorkflows.js";

test("supply-chain workflow registry covers the approved user-story resources", () => {
  assert.deepEqual(SUPPLY_CHAIN_WORKFLOW_RESOURCES, [
    "responsibility-rules",
    "procurement-rules",
    "procurement-suggestions",
    "purchase-plans",
    "purchase-batches",
    "purchase-payment-links",
    "suppliers",
    "bom-definitions",
    "business-rules",
    "quality-standards",
    "inspection-plans",
    "inspection-records",
    "quality-incidents",
    "clearance-suggestions",
    "freight-rate-rules",
    "freight-reconciliations"
  ]);
  assert.equal(ownerDepartmentForResource("purchase-plans"), "供应链部");
  assert.equal(ownerDepartmentForResource("quality-incidents"), "质量管理部");
  assert.equal(ownerDepartmentForResource("freight-reconciliations"), "财务部");
  assert.equal(supplyChainWorkflowInitialStatus("inspection-records"), "pending");
});

test("workflow payload removes server-owned fields and rejects secrets instead of storing them", () => {
  assert.throws(
    () => normalizeSupplyChainWorkflowFields({
      title: "供应商档案",
      nested: { password: "secret" }
    }),
    error => error.code === "SUPPLY_WORKFLOW_SENSITIVE_FIELD_DENIED"
  );
  assert.throws(
    () => normalizeSupplyChainWorkflowFields({ actorId: "spoofed" }),
    error => error.code === "SUPPLY_WORKFLOW_SERVER_FIELD_DENIED"
  );
  assert.deepEqual(normalizeSupplyChainWorkflowFields({
    supplierId: "supplier-1",
    credentialVaultEntryId: "vault-1",
    quotation: { amount: 18.5, currency: "CNY" }
  }), {
    supplierId: "supplier-1",
    credentialVaultEntryId: "vault-1",
    quotation: { amount: 18.5, currency: "CNY" }
  });
});

test("workflow actions follow resource-specific transitions and archive instead of delete", () => {
  assert.deepEqual(assertSupplyChainWorkflowAction({
    resource: "purchase-plans",
    status: "draft",
    action: "submit"
  }), { fromStatus: "draft", toStatus: "submitted" });
  assert.deepEqual(assertSupplyChainWorkflowAction({
    resource: "quality-incidents",
    status: "remediated",
    action: "verify"
  }), { fromStatus: "remediated", toStatus: "verified" });
  assert.deepEqual(assertSupplyChainWorkflowAction({
    resource: "suppliers",
    status: "active",
    action: "archive"
  }), { fromStatus: "active", toStatus: "archived" });
  assert.throws(
    () => assertSupplyChainWorkflowAction({
      resource: "purchase-plans",
      status: "draft",
      action: "receive"
    }),
    error => error.code === "SUPPLY_WORKFLOW_TRANSITION_INVALID"
  );
  assert.throws(
    () => assertSupplyChainWorkflowAction({
      resource: "purchase-plans",
      status: "draft",
      action: "delete"
    }),
    error => error.code === "SUPPLY_WORKFLOW_ACTION_INVALID"
  );
});

test("suggestion workflows preserve adjustments before confirmation", () => {
  for (const resource of ["procurement-suggestions", "clearance-suggestions"]) {
    assert.deepEqual(
      assertSupplyChainWorkflowAction({ resource, status: "draft", action: "adjust" }),
      { fromStatus: "draft", toStatus: "draft" }
    );
    assert.deepEqual(
      assertSupplyChainWorkflowAction({ resource, status: "draft", action: "confirm" }),
      { fromStatus: "draft", toStatus: "confirmed" }
    );
  }
});
