import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as aftersales } from "../functions/api/platform/v1/goods-flow/aftersales.js";
import { onRequest as payments } from "../functions/api/platform/v1/goods-flow/payments.js";
import { onRequest as purchases } from "../functions/api/platform/v1/goods-flow/purchases.js";
import { onRequest as qualityIncidents } from "../functions/api/platform/v1/goods-flow/quality-incidents.js";
import { onRequest as suppliers } from "../functions/api/platform/v1/goods-flow/suppliers.js";

const session = { userId: "exec-1", name: "总经理", role: "executive", department: "品牌部" };

function database() {
  const state = {
    suppliers: [{
      id: "supplier-1",
      name: "星球工厂",
      category: "成品",
      status: "active",
      contactName: "不应暴露",
      bankAccount: "不应暴露"
    }],
    purchaseApprovals: [{
      id: "purchase-legacy",
      processInstanceId: "purchase-legacy",
      supplierId: "supplier-1",
      status: "COMPLETED",
      approvedAmount: 100,
      completedAt: "2026-07-20T08:00:00.000Z"
    }],
    paymentApprovals: [{
      id: "payment-legacy",
      processInstanceId: "payment-legacy",
      purchaseProcessInstanceId: "purchase-legacy",
      status: "COMPLETED",
      amount: 60,
      completedAt: "2026-07-21T08:00:00.000Z"
    }],
    qualityIssues: [{
      id: "quality-1",
      supplierId: "supplier-1",
      productId: "product-1",
      severity: "major",
      status: "open",
      content: "包装破损",
      orderId: "secret-order",
      customerName: "secret-customer",
      rawPayload: { phone: "secret" },
      createdAt: "2026-07-22T08:00:00.000Z"
    }]
  };
  const records = Object.entries(state).flatMap(([entityType, items]) => items.map(item => ({
    entity_type: entityType,
    id: item.id,
    payload: JSON.stringify(item),
    updated_at: "2026-07-26T08:00:00.000Z",
    updated_by: "system"
  })));
  const events = [
    {
      id: "purchase-order-1", event_type: "purchase_order", supplier_id: "supplier-1", purchase_id: "PO-1",
      occurred_at: "2026-07-24T08:00:00.000Z", source: "kuaimai-erp-file",
      source_reference: "PO-1", source_version: "v1",
      payload: JSON.stringify({ amount: 200, status: "已审核", documentNumber: "PO-1" }),
      created_at: "2026-07-25T05:00:00.000Z", created_by: null
    },
    {
      id: "purchase-paid-1", event_type: "purchase_paid", supplier_id: "supplier-1", purchase_id: "PO-1",
      occurred_at: "2026-07-25T08:00:00.000Z", source: "dingtalk-approval",
      source_reference: "PAY-1", source_version: "v1",
      payload: JSON.stringify({ amount: 120, paymentProcessInstanceId: "PAY-1" }),
      created_at: "2026-07-25T08:00:00.000Z", created_by: null
    },
    {
      id: "aftersale-1", event_type: "aftersale", supplier_id: null, purchase_id: null,
      occurred_at: "2026-07-23T08:00:00.000Z", source: "kuaimai-erp-file",
      source_reference: "AS-1", source_version: "v1",
      payload: JSON.stringify({ amount: 20, status: "退款成功", sourceOrderId: "must-not-return" }),
      created_at: "2026-07-24T05:00:00.000Z", created_by: null
    }
  ];
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() { return { success: true }; },
        async all() {
          if (/from supply_chain_records/i.test(sql)) return { results: records };
          if (/from goods_flow_events/i.test(sql)) return { results: events };
          return { results: [] };
        },
        async first() {
          if (/from supply_chain_meta/i.test(sql)) {
            const values = {
              version: "supply-chain-v1",
              updatedAt: "2026-07-26T08:00:00.000Z",
              updatedBy: "system",
              settings: "{}"
            };
            return { value: values[statement.values[0]] || "" };
          }
          return null;
        }
      };
      return statement;
    }
  };
}

async function call(handler, path, options = {}) {
  const response = await handler({
    request: new Request(`https://flow.example.com/api/platform/v1/goods-flow/${path}`),
    env: { PRODUCT_FLOW_DB: options.db || database() },
    data: { session: options.session || session }
  });
  return { response, body: await response.json() };
}

test("supplier facts are safe and disclose legacy partial coverage", async () => {
  const result = await call(suppliers, "suppliers");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.items, [{
    id: "supplier-1",
    name: "星球工厂",
    category: "成品",
    status: "active",
    source: "supply-chain-state"
  }]);
  assert.equal(result.body.quality.status, "partial");
  assert.ok(result.body.quality.missing.includes("erpSupplierMaster"));
  assert.doesNotMatch(JSON.stringify(result.body), /contactName|bankAccount|不应暴露/);
});

test("purchase and payment facts stay separate and use a stable purchase relation", async () => {
  const purchaseResult = await call(purchases, "purchases");
  const paymentResult = await call(payments, "payments");
  assert.deepEqual(purchaseResult.body.items[0], {
    id: "PO-1",
    supplierId: "supplier-1",
    status: "已审核",
    amount: 200,
    occurredAt: "2026-07-24T08:00:00.000Z",
    source: "kuaimai-erp-file",
    sourceVersion: "v1"
  });
  assert.deepEqual(paymentResult.body.items[0], {
    id: "PAY-1",
    purchaseId: "PO-1",
    supplierId: "supplier-1",
    status: "paid",
    amount: 120,
    occurredAt: "2026-07-25T08:00:00.000Z",
    source: "dingtalk-approval",
    sourceVersion: "v1"
  });
});

test("quality and aftersales facts never expose customers, orders or raw payloads", async () => {
  const qualityResult = await call(qualityIncidents, "quality-incidents");
  const aftersaleResult = await call(aftersales, "aftersales");
  assert.equal(qualityResult.body.items[0].id, "quality-1");
  assert.equal(qualityResult.body.items[0].summary, "包装破损");
  assert.equal(aftersaleResult.body.items[0].id, "AS-1");
  assert.equal(aftersaleResult.body.items[0].amount, 20);
  assert.doesNotMatch(
    JSON.stringify({ quality: qualityResult.body, aftersales: aftersaleResult.body }),
    /secret-order|secret-customer|sourceOrderId|must-not-return|rawPayload/
  );
});
