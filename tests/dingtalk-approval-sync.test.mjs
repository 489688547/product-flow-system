import test from "node:test";
import assert from "node:assert/strict";
import {
  getDingApprovalInstance,
  listDingApprovalInstanceIds,
  normalizeDingSupplyApproval
} from "../functions/api/dingtalk/_shared/dingtalk.js";
import { syncSupplyApprovals } from "../functions/api/supply-chain/approvals/sync.js";
import { normalizeSupplyChainState } from "../src/domain/supplyChain.js";

test("approval instance listing uses the configured process code and cursor", async () => {
  let requestBody;
  const result = await listDingApprovalInstanceIds("token-1", {
    processCode: "PROC-PURCHASE",
    startTime: 1719792000000,
    endTime: 1722470399000,
    cursor: 20,
    size: 10
  }, async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ errcode: 0, result: { list: ["purchase-1", "purchase-2"], next_cursor: 30 } });
  });

  assert.equal(requestBody.process_code, "PROC-PURCHASE");
  assert.equal(requestBody.cursor, 20);
  assert.deepEqual(result.processInstanceIds, ["purchase-1", "purchase-2"]);
  assert.equal(result.nextCursor, 30);
});

test("approval instance detail preserves the raw workflow response", async () => {
  const instance = await getDingApprovalInstance("token-1", "purchase-1", async (_url, options) => {
    assert.equal(JSON.parse(options.body).process_instance_id, "purchase-1");
    return Response.json({ errcode: 0, process_instance: { process_instance_id: "purchase-1", result: "agree" } });
  });
  assert.equal(instance.processInstanceId, "purchase-1");
  assert.equal(instance.result, "agree");
});

test("payment normalization keeps DingTalk related purchase instance id", () => {
  const normalized = normalizeDingSupplyApproval({
    processInstanceId: "pay-1",
    title: "货款支付",
    result: "agree",
    formComponentValues: [
      { id: "amount", value: "30,000" },
      { id: "related", value: JSON.stringify([{ processInstanceId: "purchase-1" }]) }
    ]
  }, { kind: "payment", amountFieldId: "amount", relatedPurchaseFieldId: "related" });

  assert.equal(normalized.kind, "payment");
  assert.equal(normalized.record.purchaseProcessInstanceId, "purchase-1");
  assert.equal(normalized.record.amount, 30000);
  assert.equal(normalized.record.status, "COMPLETED");
  assert.equal(normalized.record.rawPayload.processInstanceId, "pay-1");
});

test("purchase normalization marks unresolved supplier and product values for mapping", () => {
  const normalized = normalizeDingSupplyApproval({
    processInstanceId: "purchase-1",
    status: "COMPLETED",
    result: "agree",
    formComponentValues: [
      { id: "supplier", value: "新供应商" },
      { id: "product", value: "新品A" },
      { id: "amount", value: "1200" }
    ]
  }, {
    kind: "purchase",
    supplierFieldId: "supplier",
    productFieldId: "product",
    amountFieldId: "amount",
    supplierValueMap: {},
    productValueMap: {}
  });

  assert.equal(normalized.record.supplierId, "");
  assert.deepEqual(normalized.record.productIds, []);
  assert.equal(normalized.record.mappingStatus, "unmapped");
  assert.deepEqual(normalized.record.unmappedValues, { supplier: "新供应商", product: "新品A" });
});

test("approval sync upserts purchase and payment instances idempotently", async () => {
  const state = normalizeSupplyChainState({
    settings: {
      purchaseProcessCode: "PROC-PURCHASE",
      paymentProcessCode: "PROC-PAYMENT",
      fieldMappings: {
        purchase: { supplierFieldId: "supplier", productFieldId: "product", amountFieldId: "amount", supplierValueMap: { "供应商A": "s1" }, productValueMap: { "产品A": "p1" } },
        payment: { amountFieldId: "amount", relatedPurchaseFieldId: "related" }
      }
    }
  });
  const instances = {
    "purchase-1": { process_instance_id: "purchase-1", result: "agree", form_component_values: [{ id: "supplier", value: "供应商A" }, { id: "product", value: "产品A" }, { id: "amount", value: "100" }] },
    "pay-1": { process_instance_id: "pay-1", result: "agree", form_component_values: [{ id: "amount", value: "80" }, { id: "related", value: JSON.stringify([{ processInstanceId: "purchase-1" }]) }] }
  };
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.process_code) {
      return Response.json({ errcode: 0, result: { list: [body.process_code === "PROC-PURCHASE" ? "purchase-1" : "pay-1"] } });
    }
    return Response.json({ errcode: 0, process_instance: instances[body.process_instance_id] });
  };

  const first = await syncSupplyApprovals({ state, accessToken: "token", startTime: 1, endTime: 2, fetchImpl });
  const second = await syncSupplyApprovals({ state: first.state, accessToken: "token", startTime: 1, endTime: 2, fetchImpl });
  assert.equal(second.state.purchaseApprovals.length, 1);
  assert.equal(second.state.paymentApprovals.length, 1);
  assert.equal(second.state.paymentApprovals[0].purchaseProcessInstanceId, "purchase-1");
  assert.equal(second.synced.purchase, 1);
  assert.equal(second.synced.payment, 1);
});
