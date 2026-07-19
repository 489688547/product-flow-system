import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.equal("rawPayload" in normalized.record, false);
});

test("payment normalization reads related purchase id and amount from FormRelateField extValue", () => {
  const normalized = normalizeDingSupplyApproval({
    processInstanceId: "pay-real-1",
    result: "agree",
    formValueVOS: [{
      id: "FormRelateField_I1ZZKN4HAW00",
      name: "采购申请单",
      componentType: "FormRelateField",
      value: "[\"采购申请单\"]",
      extValue: JSON.stringify({
        quote: 1,
        list: [{
          instanceId: "purchase-real-1",
          formCode: "PROC-PURCHASE",
          rowValue: [
            { label: "事由", value: "原料采购" },
            { label: "金额（元）", value: "30,000" },
            { label: "业务分类", value: "支出/产品费用/产品成本费用/原料费" },
            { label: "收款人信息", value: "供应商 6222 0000 0000" }
          ]
        }]
      })
    }]
  }, { kind: "payment", relatedPurchaseFieldId: "采购申请单" });

  assert.equal(normalized.record.purchaseProcessInstanceId, "purchase-real-1");
  assert.equal(normalized.record.amount, 30000);
  assert.equal(normalized.record.amountSource, "related-purchase");
  assert.equal(normalized.record.reason, "原料采购");
  assert.equal(normalized.record.businessCategory, "支出/产品费用/产品成本费用/原料费");
  assert.equal(JSON.stringify(normalized.record).includes("6222"), false);
});

test("purchase normalization stores only allow-listed business fields", () => {
  const normalized = normalizeDingSupplyApproval({
    processInstanceId: "purchase-safe-1",
    result: "agree",
    form_component_values: [
      { name: "事由", value: "包装盒采购" },
      { name: "金额（元）", value: "1200" },
      { name: "业务分类", value: "支出/产品费用/产品成本费用/包材费" },
      { name: "收款人信息", value: "某公司 6214 0000 0000" }
    ]
  }, { kind: "purchase", amountFieldId: "金额（元）", purposeFieldId: "事由", businessCategoryFieldId: "业务分类" });

  assert.equal(normalized.record.reason, "包装盒采购");
  assert.equal(normalized.record.businessCategory, "支出/产品费用/产品成本费用/包材费");
  assert.equal(JSON.stringify(normalized.record).includes("6214"), false);
  assert.equal("rawPayload" in normalized.record, false);
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

test("purchase normalization extracts mapping candidates from a standard purchase reason", () => {
  const normalized = normalizeDingSupplyApproval({
    processInstanceId: "purchase-reason-1",
    result: "agree",
    formComponentValues: [
      { name: "事由", value: "向贝瑞采购坚果谷物棒" },
      { name: "金额（元）", value: "18917.28" }
    ]
  }, {
    kind: "purchase",
    purposeFieldId: "事由",
    amountFieldId: "金额（元）"
  });

  assert.equal(normalized.record.reason, "向贝瑞采购坚果谷物棒");
  assert.deepEqual(normalized.record.unmappedValues, { supplier: "贝瑞", product: "坚果谷物棒" });
});

test("approval sync maps supplier names and confirmed aliases from purchase reasons", async () => {
  const state = normalizeSupplyChainState({
    suppliers: [
      { id: "supplier-pet", name: "江西宠办" },
      { id: "supplier-berry", name: "潍坊贝瑞" }
    ],
    settings: {
      purchaseProcessCode: "PROC-PURCHASE",
      paymentProcessCode: "PROC-PAYMENT",
      purchaseCategoryPrefixes: [],
      fieldMappings: {
        purchase: {
          purposeFieldId: "事由",
          supplierValueMap: { "贝瑞": "supplier-berry" }
        }
      }
    }
  });
  const instances = {
    "purchase-name": { process_instance_id: "purchase-name", result: "agree", form_component_values: [{ name: "事由", value: "向江西宠办采购防护喷雾" }] },
    "purchase-alias": { process_instance_id: "purchase-alias", result: "agree", form_component_values: [{ name: "事由", value: "向贝瑞采购坚果谷物棒" }] }
  };
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.process_code) {
      return Response.json({ errcode: 0, result: { list: body.process_code === "PROC-PURCHASE" ? ["purchase-name", "purchase-alias"] : [] } });
    }
    return Response.json({ errcode: 0, process_instance: instances[body.process_instance_id] });
  };

  const result = await syncSupplyApprovals({ state, accessToken: "token", startTime: 1, endTime: 2, fetchImpl, sleepImpl: async () => {} });

  assert.equal(result.state.purchaseApprovals.find(item => item.processInstanceId === "purchase-name").supplierId, "supplier-pet");
  assert.equal(result.state.purchaseApprovals.find(item => item.processInstanceId === "purchase-alias").supplierId, "supplier-berry");
});

test("approval sync excludes payments without a related purchase approval", async () => {
  const state = normalizeSupplyChainState({
    settings: {
      purchaseProcessCode: "PROC-PURCHASE",
      paymentProcessCode: "PROC-PAYMENT",
      purchaseCategoryPrefixes: []
    }
  });
  const relation = JSON.stringify({ list: [{ instanceId: "purchase-1", rowValue: [{ label: "金额（元）", value: "800" }] }] });
  const instances = {
    "purchase-1": { process_instance_id: "purchase-1", result: "agree" },
    "pay-purchase": { process_instance_id: "pay-purchase", result: "agree", form_component_values: [{ name: "采购申请单", value: "[\"采购\"]", extValue: relation }] },
    "pay-reimbursement": { process_instance_id: "pay-reimbursement", result: "agree", form_component_values: [{ name: "采购申请单", value: "null" }, { name: "报销申请单", value: "[\"报销\"]" }] }
  };
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.process_code === "PROC-PURCHASE") return Response.json({ errcode: 0, result: { list: ["purchase-1"] } });
    if (body.process_code === "PROC-PAYMENT") return Response.json({ errcode: 0, result: { list: ["pay-purchase", "pay-reimbursement"] } });
    return Response.json({ errcode: 0, process_instance: instances[body.process_instance_id] });
  };

  const result = await syncSupplyApprovals({ state, accessToken: "token", startTime: 1, endTime: 2, fetchImpl, sleepImpl: async () => {} });

  assert.deepEqual(result.state.paymentApprovals.map(item => item.processInstanceId), ["pay-purchase"]);
  assert.equal(result.synced.payment, 1);
  assert.equal(result.synced.skipped, 1);
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

test("approval sync excludes categorized non-supply purchases and their linked payments", async () => {
  const state = normalizeSupplyChainState({
    settings: {
      purchaseProcessCode: "PROC-PURCHASE",
      paymentProcessCode: "PROC-PAYMENT",
      fieldMappings: {
        purchase: { amountFieldId: "金额（元）", businessCategoryFieldId: "业务分类" },
        payment: { relatedPurchaseFieldId: "采购申请单" }
      }
    }
  });
  const relation = (instanceId, category, amount) => JSON.stringify({
    list: [{ instanceId, rowValue: [{ label: "金额（元）", value: String(amount) }, { label: "业务分类", value: category }] }]
  });
  const instances = {
    "purchase-supply": { process_instance_id: "purchase-supply", result: "agree", form_component_values: [{ name: "金额（元）", value: "800" }, { name: "业务分类", value: "支出/产品费用/产品成本费用/原料费" }] },
    "purchase-marketing": { process_instance_id: "purchase-marketing", result: "agree", form_component_values: [{ name: "金额（元）", value: "30000" }, { name: "业务分类", value: "支出/产品费用/运营营销费用/投流推广费" }] },
    "pay-supply": { process_instance_id: "pay-supply", result: "agree", form_component_values: [{ name: "采购申请单", value: "[\"采购\"]", ext_value: relation("purchase-supply", "支出/产品费用/产品成本费用/原料费", 800) }] },
    "pay-marketing": { process_instance_id: "pay-marketing", result: "agree", form_component_values: [{ name: "采购申请单", value: "[\"采购\"]", ext_value: relation("purchase-marketing", "支出/产品费用/运营营销费用/投流推广费", 30000) }] }
  };
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.process_code === "PROC-PURCHASE") return Response.json({ errcode: 0, result: { list: ["purchase-supply", "purchase-marketing"] } });
    if (body.process_code === "PROC-PAYMENT") return Response.json({ errcode: 0, result: { list: ["pay-supply", "pay-marketing"] } });
    return Response.json({ errcode: 0, process_instance: instances[body.process_instance_id] });
  };

  const result = await syncSupplyApprovals({ state, accessToken: "token", startTime: 1, endTime: 2, fetchImpl });
  assert.deepEqual(result.state.purchaseApprovals.map(item => item.processInstanceId), ["purchase-supply"]);
  assert.deepEqual(result.state.paymentApprovals.map(item => item.processInstanceId), ["pay-supply"]);
  assert.equal(result.synced.purchase, 1);
  assert.equal(result.synced.payment, 1);
  assert.equal(result.synced.skipped, 2);
});

test("approval sync reads detail instances sequentially with QPS pacing", async () => {
  const state = normalizeSupplyChainState({
    settings: {
      purchaseProcessCode: "PROC-PURCHASE",
      paymentProcessCode: "PROC-PAYMENT",
      purchaseCategoryPrefixes: []
    }
  });
  const purchaseIds = Array.from({ length: 41 }, (_, index) => `purchase-${index + 1}`);
  let active = 0;
  let maxActive = 0;
  const delays = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.process_code) {
      return Response.json({ errcode: 0, result: { list: body.process_code === "PROC-PURCHASE" ? purchaseIds : [] } });
    }
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setImmediate(resolve));
    active -= 1;
    return Response.json({ errcode: 0, process_instance: { process_instance_id: body.process_instance_id, result: "agree" } });
  };

  const result = await syncSupplyApprovals({
    state,
    accessToken: "token",
    startTime: 1,
    endTime: 2,
    fetchImpl,
    sleepImpl: async milliseconds => { delays.push(milliseconds); }
  });

  assert.equal(result.synced.purchase, 41);
  assert.equal(maxActive, 1);
  assert.equal(delays.length, 40);
  assert.ok(delays.every(milliseconds => milliseconds >= 30));
});

test("approval sync can process one bounded workflow page for Cloudflare Workers", async () => {
  const state = normalizeSupplyChainState({
    settings: {
      purchaseProcessCode: "PROC-PURCHASE",
      paymentProcessCode: "PROC-PAYMENT",
      purchaseCategoryPrefixes: []
    }
  });
  const purchaseIds = Array.from({ length: 41 }, (_, index) => `purchase-${index + 1}`);
  let requests = 0;
  let paymentListRequests = 0;
  const fetchImpl = async (_url, options) => {
    requests += 1;
    const body = JSON.parse(options.body);
    if (body.process_code === "PROC-PAYMENT") {
      paymentListRequests += 1;
      return Response.json({ errcode: 0, result: { list: [] } });
    }
    if (body.process_code === "PROC-PURCHASE") {
      const cursor = Number(body.cursor || 0);
      const page = purchaseIds.slice(cursor, cursor + body.size);
      const nextCursor = cursor + page.length < purchaseIds.length ? cursor + page.length : null;
      return Response.json({ errcode: 0, result: { list: page, next_cursor: nextCursor } });
    }
    return Response.json({ errcode: 0, process_instance: { process_instance_id: body.process_instance_id, result: "agree" } });
  };

  const first = await syncSupplyApprovals({
    state,
    accessToken: "token",
    startTime: 1,
    endTime: 2,
    fetchImpl,
    sleepImpl: async () => {},
    batch: { kind: "purchase", cursor: 0, size: 20 }
  });

  assert.equal(first.synced.purchase, 20);
  assert.equal(first.synced.payment, 0);
  assert.equal(paymentListRequests, 0);
  assert.equal(requests, 21);
  assert.deepEqual(first.continuation, { kind: "purchase", nextCursor: 20 });
});

test("approval endpoint forwards the client batch boundary to the sync service", () => {
  const endpoint = readFileSync(new URL("../functions/api/supply-chain/approvals/sync.js", import.meta.url), "utf8");
  assert.match(endpoint, /syncSupplyApprovals\(\{[^}]*batch:\s*body\.batch/s);
});

test("approval sync retries one throttled detail after DingTalk cooldown", async () => {
  const state = normalizeSupplyChainState({
    settings: {
      purchaseProcessCode: "PROC-PURCHASE",
      paymentProcessCode: "PROC-PAYMENT",
      purchaseCategoryPrefixes: []
    }
  });
  let detailAttempts = 0;
  const delays = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.process_code) {
      return Response.json({ errcode: 0, result: { list: body.process_code === "PROC-PURCHASE" ? ["purchase-1"] : [] } });
    }
    detailAttempts += 1;
    if (detailAttempts === 1) return Response.json({ errcode: 90018, errmsg: "触发qps流控，请求被暂时限制" });
    return Response.json({ errcode: 0, process_instance: { process_instance_id: "purchase-1", result: "agree" } });
  };

  const result = await syncSupplyApprovals({
    state,
    accessToken: "token",
    startTime: 1,
    endTime: 2,
    fetchImpl,
    sleepImpl: async milliseconds => { delays.push(milliseconds); }
  });

  assert.equal(result.synced.purchase, 1);
  assert.equal(detailAttempts, 2);
  assert.deepEqual(delays, [1100]);
});
