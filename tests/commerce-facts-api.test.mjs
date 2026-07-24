import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as onCommerceFacts } from "../functions/api/platform/v1/commerce-facts/index.js";
import { onRequest as onCommerceFactsIngest } from "../functions/api/platform/v1/commerce-facts/ingest.js";
import {
  queryCommerceFacts,
  stageCommerceFactChunk
} from "../functions/api/platform/v1/commerce-facts/_shared/storage.js";
import { sha256 } from "../functions/api/platform/v1/web-collection/_shared/storage.js";
import { createCommerceFactsD1Mock } from "./helpers/commerce-facts-d1-mock.mjs";

const executive = { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };

function storeFact(transactionAmount = 100) {
  return {
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    businessDate: "2026-07-23",
    transactionAmount,
    transactionOrderCount: 2,
    transactionBuyerCount: 2,
    refundAmountByPaymentDate: null,
    productExposureUsers: 10,
    productClickUsers: 2
  };
}

function batchInput(overrides = {}) {
  return {
    jobId: "job-1",
    batchId: "batch-1",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "store_daily",
    businessDate: "2026-07-23",
    schemaVersion: "douyin-store-v1",
    sourceVersion: "compass-store-v1",
    contentHash: "a".repeat(64),
    chunkIndex: 0,
    complete: true,
    expectedCount: 1,
    coverage: 1,
    confidence: "high",
    facts: [storeFact()],
    ...overrides
  };
}

async function jsonCall(handler, url, { method = "GET", env = {}, data = {}, token, body } = {}) {
  const response = await handler({
    request: new Request(url, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }),
    env,
    data
  });
  return { response, body: await response.json() };
}

async function collectorDb() {
  const db = createCommerceFactsD1Mock();
  const token = "wdc_test_runner";
  db.tables.web_collection_runners.set("runner-1", {
    id: "runner-1",
    name: "公司 Mac",
    token_hash: await sha256(token),
    scope: "company_web_collection",
    status: "active"
  });
  db.tables.web_collection_jobs.set("job-1", {
    id: "job-1",
    provider_id: "douyin-ecommerce",
    store_id: "store-a",
    resource_type: "store_daily",
    business_date: "2026-07-23",
    status: "ingesting",
    runner_id: "runner-1",
    lease_expires_at: "2099-01-01T00:00:00.000Z",
    target_environment: "production",
    target_environment_version: 1
  });
  return { db, token };
}

test("commerce facts read requires a session and the middleware-selected business database", async () => {
  const businessDb = createCommerceFactsD1Mock();
  await stageCommerceFactChunk(businessDb, batchInput());

  const denied = await jsonCall(onCommerceFacts, "https://flow.example.com/api/platform/v1/commerce-facts?from=2026-07-23&to=2026-07-23&providerId=douyin-ecommerce&storeId=store-a&resourceType=store_daily", {
    env: { PRODUCT_FLOW_DB: createCommerceFactsD1Mock() },
    data: { businessDb }
  });
  assert.equal(denied.response.status, 401);

  const allowed = await jsonCall(onCommerceFacts, "https://flow.example.com/api/platform/v1/commerce-facts?from=2026-07-23&to=2026-07-23&providerId=douyin-ecommerce&storeId=store-a&resourceType=store_daily", {
    env: { PRODUCT_FLOW_DB: createCommerceFactsD1Mock() },
    data: { session: executive, businessDb }
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.body.data.facts.length, 1);
  assert.equal(allowed.body.data.facts[0].settlementAmount, null);
  assert.equal(allowed.body.data.facts[0].sourceVersion, "compass-store-v1");
  assert.equal(allowed.body.data.facts[0].derived.averageOrderValue, 50);
  assert.equal(allowed.body.data.quality.status, "ready");
});

test("runner ingest completes a matching leased job and exposes only the completed batch", async () => {
  const { db, token } = await collectorDb();
  const result = await jsonCall(onCommerceFactsIngest, "https://flow.example.com/api/platform/v1/commerce-facts/ingest", {
    method: "POST",
    env: { PRODUCT_FLOW_DB: db },
    token,
    body: batchInput()
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.data.status, "completed");
  assert.equal(result.body.data.completedCount, 1);
  const queried = await queryCommerceFacts(db, {
    from: "2026-07-23",
    to: "2026-07-23",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "store_daily"
  });
  assert.equal(queried.facts.length, 1);
});

test("incomplete and mismatched batches remain invisible", async () => {
  const { db, token } = await collectorDb();
  const incomplete = await jsonCall(onCommerceFactsIngest, "https://flow.example.com/api/platform/v1/commerce-facts/ingest", {
    method: "POST",
    env: { PRODUCT_FLOW_DB: db },
    token,
    body: batchInput({ expectedCount: 2 })
  });
  assert.equal(incomplete.response.status, 409);
  assert.equal(incomplete.body.error.code, "COMMERCE_BATCH_INCOMPLETE");
  assert.equal((await queryCommerceFacts(db, {
    from: "2026-07-23",
    to: "2026-07-23",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "store_daily"
  })).facts.length, 0);

  const mismatch = await jsonCall(onCommerceFactsIngest, "https://flow.example.com/api/platform/v1/commerce-facts/ingest", {
    method: "POST",
    env: { PRODUCT_FLOW_DB: db },
    token,
    body: batchInput({ batchId: "batch-2", storeId: "store-b", facts: [{ ...storeFact(), storeId: "store-b" }] })
  });
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.body.error.code, "COLLECTION_JOB_MISMATCH");
});

test("a newer completed batch supersedes the old one without deleting history", async () => {
  const db = createCommerceFactsD1Mock();
  await stageCommerceFactChunk(db, batchInput());
  await stageCommerceFactChunk(db, batchInput({
    batchId: "batch-2",
    contentHash: "b".repeat(64),
    facts: [storeFact(250)]
  }));

  assert.equal(db.tables.commerce_fact_batches.get("batch-1").status, "superseded");
  assert.equal(db.tables.commerce_fact_batches.get("batch-2").status, "completed");
  const result = await queryCommerceFacts(db, {
    from: "2026-07-23",
    to: "2026-07-23",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "store_daily"
  });
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].transactionAmount, 250);
});
