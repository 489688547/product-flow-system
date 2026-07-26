import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as onJobs } from "../functions/api/platform/v1/web-collection/jobs.js";
import { onRequest as onRunners } from "../functions/api/platform/v1/web-collection/runners.js";
import { ensureRegisteredWebCollectionPlan } from "../functions/api/platform/v1/web-collection/_shared/storage.js";
import { createWebCollectionD1Mock } from "./helpers/web-collection-d1-mock.mjs";

const executive = { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };
const operator = { userId: "ops-1", name: "运营主管", role: "operations", department: "运营部" };

async function jsonCall(handler, url, { method = "GET", db, session, dataEnvironment, token, body } = {}) {
  const request = new Request(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const response = await handler({
    request,
    env: db ? { PRODUCT_FLOW_DB: db } : {},
    data: session ? { session, ...(dataEnvironment ? { dataEnvironment } : {}) } : {}
  });
  return { response, body: await response.json() };
}

async function register(db) {
  return jsonCall(onRunners, "https://flow.example.com/api/platform/v1/web-collection/runners", {
    method: "POST",
    db,
    session: executive,
    body: { name: "公司 Mac 网页采集器" }
  });
}

test("executive registers one-time generic runner token and D1 stores only its hash", async () => {
  const db = createWebCollectionD1Mock();
  const result = await register(db);
  assert.equal(result.response.status, 201);
  assert.match(result.body.data.token, /^wdc_[a-f0-9]{48}$/);
  assert.equal(result.body.data.scope, "company_web_collection");
  const stored = [...db.tables.web_collection_runners.values()][0];
  assert.equal(stored.token_hash.length, 64);
  assert.equal(JSON.stringify(stored).includes(result.body.data.token), false);
});

test("runner heartbeats and ensures a plan without accepting remote browser instructions", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  const heartbeat = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "heartbeat", version: "1.0.0", chromeStatus: "ready" }
  });
  assert.equal(heartbeat.response.status, 200);
  assert.equal([...db.tables.web_collection_runners.values()][0].chrome_status, "ready");

  const plan = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token,
    body: {
      action: "ensure_plan",
      jobs: [{
        providerId: "kuaimai",
        resourceType: "orders",
        businessDate: "2026-07-21",
        rangeKind: "daily_fact",
        range: { start: "2026-07-21T00:00:00+08:00", end: "2026-07-21T23:59:59+08:00", timeZone: "Asia/Shanghai" },
        scheduleVersion: "v1",
        idempotencyKey: "kuaimai:orders:2026-07-21:v1"
      }]
    }
  });
  assert.equal(plan.response.status, 200);
  assert.equal(plan.body.data.created, 1);
  assert.equal(db.tables.web_collection_jobs.size, 1);

  const rejected = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "ensure_plan", jobs: [{ ...plan.body.data.jobs[0], url: "https://evil.example", selector: "*", script: "fetch('/secrets')" }] }
  });
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.body.error.code, "WEB_COLLECTION_JOB_INVALID");
});

test("an executive-created plan persists the server-selected environment and isolates idempotency", async () => {
  const db = createWebCollectionD1Mock();
  const job = {
    providerId: "kuaimai",
    resourceType: "orders",
    businessDate: "2026-07-21",
    rangeKind: "daily_fact",
    range: { start: "2026-07-21T00:00:00+08:00", end: "2026-07-21T23:59:59+08:00", timeZone: "Asia/Shanghai" },
    scheduleVersion: "v1",
    idempotencyKey: "kuaimai:orders:2026-07-21:v1"
  };
  const display = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: executive,
    dataEnvironment: { id: "display", version: 7 },
    body: { action: "ensure_plan", jobs: [job] }
  });
  const production = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: executive,
    dataEnvironment: { id: "production", version: 1 },
    body: { action: "ensure_plan", jobs: [job] }
  });

  assert.equal(display.response.status, 200);
  assert.equal(production.response.status, 200);
  assert.equal(db.tables.web_collection_jobs.size, 2);
  const targets = [...db.tables.web_collection_jobs.values()]
    .map(row => `${row.target_environment}:${row.target_environment_version}`)
    .sort();
  assert.deepEqual(targets, ["display:7", "production:1"]);
});

test("control plane accepts the canonical Kuaimai order_items resource used by the extension and parser", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const result = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token: registration.body.data.token,
    body: {
      action: "ensure_plan",
      jobs: [{
        providerId: "kuaimai",
        resourceType: "order_items",
        businessDate: "2026-07-21",
        rangeKind: "daily_fact",
        range: { start: "2026-07-21T00:00:00+08:00", end: "2026-07-21T23:59:59+08:00", timeZone: "Asia/Shanghai" },
        scheduleVersion: "v1",
        idempotencyKey: "kuaimai:order_items:2026-07-21:v1"
      }]
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.jobs[0].resourceType, "order_items");
});

test("control plane keeps same-day Douyin jobs isolated by store", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  const makeJob = storeId => ({
    providerId: "douyin-ecommerce",
    storeId,
    resourceType: "product_daily",
    businessDate: "2026-07-23",
    rangeKind: "daily_fact",
    range: { start: "2026-07-23T00:00:00+08:00", end: "2026-07-23T23:59:59+08:00", timeZone: "Asia/Shanghai" },
    scheduleVersion: "v1",
    idempotencyKey: `douyin-ecommerce:${storeId}:product_daily:2026-07-23:v1`
  });
  const result = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token,
    body: { action: "ensure_plan", jobs: [makeJob("store-a"), makeJob("store-b")] }
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.created, 2);
  assert.deepEqual(result.body.data.jobs.map(job => job.storeId), ["store-a", "store-b"]);
  assert.equal(db.tables.web_collection_jobs.size, 2);

  const unsafe = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token,
    body: { action: "ensure_plan", jobs: [makeJob("../unsafe")] }
  });
  assert.equal(unsafe.response.status, 400);
  assert.equal(unsafe.body.error.code, "WEB_COLLECTION_JOB_INVALID");
});

test("runner registers a safely discovered Douyin store before creating its daily tasks", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const identified = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token: registration.body.data.token,
    body: {
      action: "register_store",
      providerId: "douyin-ecommerce",
      storeId: "90862283",
      storeName: "TIYES提野星宠物用品旗舰店"
    }
  });

  assert.equal(identified.response.status, 200);
  assert.deepEqual(identified.body.data.store, {
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "TIYES提野星宠物用品旗舰店",
    status: "connected",
    lastSeenAt: identified.body.data.store.lastSeenAt
  });
  assert.equal(db.tables.web_collection_stores.get("douyin-ecommerce:90862283").runner_id, registration.body.data.id);

  const result = await ensureRegisteredWebCollectionPlan(db, {
    now: new Date("2026-07-24T05:30:00+08:00")
  });

  assert.equal(result.jobs.filter(job => job.providerId === "kuaimai").length, 4);
  assert.equal(result.jobs.filter(job => job.providerId === "douyin-ecommerce").length, 4);
  assert.deepEqual(
    result.jobs
      .filter(job => job.providerId === "douyin-ecommerce")
      .map(job => job.storeId),
    ["90862283", "90862283", "90862283", "90862283"]
  );

  const status = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    db,
    session: executive
  });
  assert.equal(status.body.data.stores[0].storeName, "TIYES提野星宠物用品旗舰店");
});

test("runner reads only its enabled store assignments with a safe projection", async () => {
  const db = createWebCollectionD1Mock();
  const first = await register(db);
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token: first.body.data.token,
    body: {
      action: "register_store",
      providerId: "douyin-ecommerce",
      storeId: "90862283",
      storeName: "TIYES 提野星旗舰店"
    }
  });
  const second = await register(db);
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token: second.body.data.token,
    body: {
      action: "register_store",
      providerId: "douyin-ecommerce",
      storeId: "99887766",
      storeName: "第二店"
    }
  });
  db.tables.web_collection_stores.get("douyin-ecommerce:99887766").status = "disabled";

  const assigned = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token: first.body.data.token,
    body: { action: "assigned_stores" }
  });

  assert.equal(assigned.response.status, 200);
  assert.deepEqual(assigned.body.data, {
    stores: [{
      providerId: "douyin-ecommerce",
      storeId: "90862283",
      storeName: "TIYES 提野星旗舰店"
    }]
  });
  assert.doesNotMatch(
    JSON.stringify(assigned.body.data.stores),
    /runnerId|lastSeenAt|updatedAt|url|credential|cookie|token|Users\//
  );
});

test("an executive can add and rename multiple Douyin stores while ordinary operators cannot", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);

  for (const store of [
    { storeId: "90862283", storeName: "TIYES 提野星旗舰店" },
    { storeId: "99887766", storeName: "TIYES 第二店" },
    { storeId: "90862283", storeName: "TIYES 提野星宠物用品旗舰店" }
  ]) {
    const saved = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
      method: "POST",
      db,
      session: executive,
      body: {
        action: "register_store",
        providerId: "douyin-ecommerce",
        ...store
      }
    });
    assert.equal(saved.response.status, 200);
  }

  assert.equal(db.tables.web_collection_stores.size, 2);
  assert.equal(
    db.tables.web_collection_stores.get("douyin-ecommerce:90862283").store_name,
    "TIYES 提野星宠物用品旗舰店"
  );
  assert.equal(
    db.tables.web_collection_stores.get("douyin-ecommerce:90862283").runner_id,
    registration.body.data.id
  );

  const denied = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    body: {
      action: "register_store",
      providerId: "douyin-ecommerce",
      storeId: "11223344",
      storeName: "无权添加"
    }
  });
  assert.equal(denied.response.status, 403);
});

test("a session cannot register a Douyin store before the company collector exists", async () => {
  const db = createWebCollectionD1Mock();
  const result = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: executive,
    body: {
      action: "register_store",
      providerId: "douyin-ecommerce",
      storeId: "90862283",
      storeName: "TIYES 提野星旗舰店"
    }
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error.code, "WEB_COLLECTION_RUNNER_REQUIRED");
});

test("runner store registration rejects unknown providers and unsafe identity fields", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  for (const body of [
    { action: "register_store", providerId: "unknown", storeId: "90862283", storeName: "旗舰店" },
    { action: "register_store", providerId: "douyin-ecommerce", storeId: "../90862283", storeName: "旗舰店" },
    { action: "register_store", providerId: "douyin-ecommerce", storeId: "90862283", storeName: "x\n恶意字段" }
  ]) {
    const result = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
      method: "POST",
      db,
      token: registration.body.data.token,
      body
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "WEB_COLLECTION_STORE_INVALID");
  }
});

test("runner claims Douyin work only for the store identified by its Chrome profile", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  const jobs = ["store-a", "store-b"].map(storeId => ({
    providerId: "douyin-ecommerce",
    storeId,
    resourceType: "store_daily",
    businessDate: "2026-07-23",
    rangeKind: "daily_fact",
    range: { start: "2026-07-23T00:00:00+08:00", end: "2026-07-23T23:59:59+08:00", timeZone: "Asia/Shanghai" },
    scheduleVersion: "v1",
    idempotencyKey: `douyin-ecommerce:${storeId}:store_daily:2026-07-23:v1`
  }));
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token,
    body: { action: "ensure_plan", jobs }
  });

  const unidentified = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "claim", leaseSeconds: 300 }
  });
  assert.equal(unidentified.response.status, 200);
  assert.equal(unidentified.body.data.job, null);

  const claimed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "claim", leaseSeconds: 300, storeId: "store-b" }
  });
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.body.data.job.storeId, "store-b");
});

test("claim lease, legal transitions, completion and cursor are atomic from the runner perspective", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "ensure_plan", jobs: [{
      providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21", rangeKind: "daily_fact",
      range: { start: "2026-07-21T00:00:00+08:00", end: "2026-07-21T23:59:59+08:00", timeZone: "Asia/Shanghai" },
      scheduleVersion: "v1", idempotencyKey: "kuaimai:orders:2026-07-21:v1"
    }] }
  });
  const claimed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "claim", leaseSeconds: 300 }
  });
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.body.data.job.status, "claimed");
  const jobId = claimed.body.data.job.id;

  const invalid = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "transition", jobId, from: "claimed", status: "success", stage: "ingesting" }
  });
  assert.equal(invalid.response.status, 409);
  assert.equal(invalid.body.error.code, "WEB_COLLECTION_TRANSITION_INVALID");

  for (const [from, status] of [["claimed", "opening"], ["opening", "exporting"], ["exporting", "downloading"], ["downloading", "validating"], ["validating", "ingesting"]]) {
    const changed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
      method: "POST", db, token, body: { action: "transition", jobId, from, status, stage: status }
    });
    assert.equal(changed.response.status, 200);
  }
  const completed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    token,
    body: { action: "complete", jobId, run: { batchId: "batch-1", archiveId: "archive-1", rowCount: 42, fileHash: "a".repeat(64) } }
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.data.job.status, "success");
  assert.equal(db.tables.web_collection_cursors.get("kuaimai:orders").business_date, "2026-07-21");

  const status = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    db,
    session: executive
  });
  assert.equal(status.response.status, 200);
  assert.equal(status.body.data.runs.length, 1);
  assert.deepEqual(status.body.data.runs[0], {
    id: completed.body.data.runId,
    jobId,
    runnerId: registration.body.data.id,
    attempt: 1,
    status: "success",
    stage: "ingesting",
    batchId: "batch-1",
    archiveId: "archive-1",
    rowCount: 42,
    errorCode: null,
    errorSummary: null,
    startedAt: status.body.data.jobs[0].startedAt,
    completedAt: status.body.data.jobs[0].completedAt,
    createdAt: status.body.data.jobs[0].completedAt
  });
});

test("failed task does not advance cursor and notification dedupe is durable", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "ensure_plan", jobs: [{
      providerId: "kuaimai", resourceType: "inventory", businessDate: "2026-07-22", rangeKind: "current_snapshot",
      range: null, scheduleVersion: "v1", idempotencyKey: "kuaimai:inventory:2026-07-22:v1"
    }] }
  });
  const claimed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "claim" }
  });
  const jobId = claimed.body.data.job.id;
  const failed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "transition", jobId, from: "claimed", status: "failed", stage: "opening", errorCode: "LOGIN_REQUIRED" }
  });
  assert.equal(failed.response.status, 200);
  assert.equal(db.tables.web_collection_cursors.size, 0);
  assert.equal(db.tables.web_collection_runs.size, 1);
  const failedRun = [...db.tables.web_collection_runs.values()][0];
  assert.equal(failedRun.status, "failed");
  assert.equal(failedRun.error_code, "LOGIN_REQUIRED");

  const notification = { action: "record_notification", jobId, kind: "failure", dedupeKey: "2026-07-22:kuaimai:inventory:LOGIN_REQUIRED:opening", result: "sent" };
  const first = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", { method: "POST", db, token, body: notification });
  const repeated = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", { method: "POST", db, token, body: notification });
  assert.equal(first.body.data.duplicate, false);
  assert.equal(repeated.body.data.duplicate, true);
  assert.equal(db.tables.web_collection_notifications.size, 1);
});

test("runner reclaims an expired non-terminal stage after a local crash", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "ensure_plan", jobs: [{
      providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21", rangeKind: "daily_fact",
      range: { start: "2026-07-21T00:00:00+08:00", end: "2026-07-21T23:59:59+08:00", timeZone: "Asia/Shanghai" },
      scheduleVersion: "v2", idempotencyKey: "kuaimai:orders:2026-07-21:v2"
    }] }
  });
  const first = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "claim" }
  });
  const jobId = first.body.data.job.id;
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "transition", jobId, from: "claimed", status: "opening", stage: "opening" }
  });
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "transition", jobId, from: "opening", status: "collecting", stage: "collecting" }
  });
  db.tables.web_collection_jobs.get(jobId).lease_expires_at = "2026-07-20T00:00:00.000Z";

  const reclaimed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "claim" }
  });
  assert.equal(reclaimed.response.status, 200);
  assert.equal(reclaimed.body.data.job.id, jobId);
  assert.equal(reclaimed.body.data.job.status, "claimed");
  assert.equal(reclaimed.body.data.job.attempt, 2);
});

test("stuck running stage past retry budget self-heals to a retryable failure on status read", async () => {
  const db = createWebCollectionD1Mock();
  const base = {
    provider_id: "douyin-ecommerce", store_id: "90862283", resource_type: "store_daily",
    range_kind: "daily_fact", range_start: null, range_end: null, time_zone: "Asia/Shanghai",
    schedule_version: "v1", selector_version: null, target_environment: "production",
    target_environment_version: 1, runner_id: "web-runner-1", error_code: null, error_summary: null,
    created_at: "2026-07-23T05:00:00.000Z", updated_at: "2026-07-23T05:05:00.000Z",
    started_at: "2026-07-23T05:01:00.000Z", completed_at: null
  };
  // 僵尸任务：opening + 租约已过 + attempt=3，公司 Mac 无法再领取，也从不落到终态。
  db.tables.web_collection_jobs.set("zombie", {
    ...base, id: "zombie", business_date: "2026-07-23", status: "opening", stage: "opening", attempt: 3,
    idempotency_key: "douyin-ecommerce:90862283:store_daily:2026-07-23:v1",
    lease_expires_at: "2026-07-23T06:00:00.000Z"
  });
  // 未耗尽的过期运行中任务（attempt=2）仍应留给公司 Mac 重领，不被自愈扫成失败。
  db.tables.web_collection_jobs.set("reclaimable", {
    ...base, id: "reclaimable", business_date: "2026-07-22", status: "opening", stage: "opening", attempt: 2,
    idempotency_key: "douyin-ecommerce:90862283:store_daily:2026-07-22:v1",
    lease_expires_at: "2026-07-22T06:00:00.000Z"
  });

  const status = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    db, session: executive
  });
  assert.equal(status.response.status, 200);
  const zombie = db.tables.web_collection_jobs.get("zombie");
  assert.equal(zombie.status, "failed");
  assert.equal(zombie.error_code, "WEB_COLLECTION_STAGE_EXPIRED");
  assert.equal(zombie.lease_expires_at, null);
  assert.equal(db.tables.web_collection_jobs.get("reclaimable").status, "opening");
  assert.ok([...db.tables.web_collection_runs.values()].some(run => (
    run.job_id === "zombie" && run.status === "failed" && run.error_code === "WEB_COLLECTION_STAGE_EXPIRED"
  )));

  // 落到 failed 后，运营可强制重触发重新排队，恢复采集。
  const retried = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: operator,
    body: {
      action: "trigger", providerId: "douyin-ecommerce", storeId: "90862283",
      resourceType: "store_daily", businessDate: "2026-07-23", force: true
    }
  });
  assert.equal(retried.response.status, 200);
  assert.equal(db.tables.web_collection_jobs.get("zombie").status, "queued");
});

test("a successful batch supersedes duplicate non-terminal jobs for the same store, resource and business day", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  const runnerId = [...db.tables.web_collection_runners.values()][0].id;
  const base = {
    provider_id: "douyin-ecommerce", store_id: "90862283", resource_type: "store_daily", business_date: "2026-07-23",
    range_kind: "daily_fact", range_start: null, range_end: null, time_zone: "Asia/Shanghai", selector_version: null,
    target_environment: "production", target_environment_version: 1, attempt: 1, runner_id: runnerId,
    lease_expires_at: "2026-07-24T08:33:00.000Z", error_code: null, error_summary: null,
    created_at: "2026-07-24T08:20:00.000Z", updated_at: "2026-07-24T08:20:00.000Z",
    started_at: "2026-07-24T08:20:00.000Z", completed_at: null
  };
  // 正常日采（v1）已进入入库阶段，归当前采集器所有。
  db.tables.web_collection_jobs.set("job-a", {
    ...base, id: "job-a", schedule_version: "v1", status: "ingesting", stage: "ingesting",
    idempotency_key: "douyin-ecommerce:90862283:store_daily:2026-07-23:v1:env:production:v1"
  });
  // 验收测试留下的重复任务（不同 scheduleVersion），卡在 opening。
  db.tables.web_collection_jobs.set("job-b", {
    ...base, id: "job-b", schedule_version: "extension-acceptance-v1", status: "opening", stage: "opening",
    idempotency_key: "douyin-ecommerce:90862283:store_daily:2026-07-23:extension-acceptance-v1:env:production:v1"
  });

  const completed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "complete", jobId: "job-a", run: { batchId: "batch-x", rowCount: 10 } }
  });
  assert.equal(completed.response.status, 200);
  assert.equal(db.tables.web_collection_jobs.get("job-a").status, "success");
  assert.equal(db.tables.web_collection_jobs.get("job-b").status, "superseded");
  assert.equal(db.tables.web_collection_jobs.get("job-b").lease_expires_at, null);
});

test("company session reads safe status while unauthenticated callers are rejected", async () => {
  const db = createWebCollectionD1Mock();
  const denied = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", { db });
  assert.equal(denied.response.status, 401);
  const allowed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", { db, session: executive });
  assert.equal(allowed.response.status, 200);
  assert.equal(JSON.stringify(allowed.body).includes("token_hash"), false);
});

test("authorized operator idempotently triggers the Kuaimai Chrome order-item collection", async () => {
  const db = createWebCollectionD1Mock();
  const input = { action: "trigger", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22" };
  const first = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: operator, body: input
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.created, 1);
  assert.equal(first.body.data.requeued, false);
  assert.equal(first.body.data.job.status, "queued");
  assert.equal(first.body.data.job.idempotencyKey, "kuaimai:order_items:2026-07-22:v1:env:production:v1");

  const repeated = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: operator, body: input
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.data.created, 0);
  assert.equal(repeated.body.data.requeued, false);
  assert.equal(db.tables.web_collection_jobs.size, 1);
});

test("authorized operator triggers the registered rich Kuaimai sales report", async () => {
  const db = createWebCollectionD1Mock();
  const result = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    body: { action: "trigger", providerId: "kuaimai", resourceType: "sales_items", businessDate: "2026-07-22" }
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.job.resourceType, "sales_items");
  assert.equal(result.body.data.job.idempotencyKey, "kuaimai:sales_items:2026-07-22:v3:env:production:v1");
});

test("authorized operator triggers the complete Kuaimai product snapshot group", async () => {
  const db = createWebCollectionD1Mock();
  const input = {
    action: "trigger",
    providerId: "kuaimai",
    resourceType: "products",
    businessDate: "2026-07-24"
  };
  const first = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    dataEnvironment: { id: "display", version: 9 },
    body: input
  });

  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.created, 3);
  assert.deepEqual(
    first.body.data.jobs.map(job => [job.resourceType, job.rangeKind, job.businessDate]),
    [
      ["products", "current_snapshot", "2026-07-24"],
      ["product_kits", "current_snapshot", "2026-07-24"],
      ["product_combinations", "current_snapshot", "2026-07-24"]
    ]
  );
  assert.equal(first.body.data.jobs.every(job => job.status === "queued"), true);
  assert.equal(first.body.data.jobs.every(job => job.targetEnvironment === "display"), true);
  assert.equal(first.body.data.jobs.every(job => job.targetEnvironmentVersion === 9), true);

  const repeated = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    dataEnvironment: { id: "display", version: 9 },
    body: input
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.data.created, 0);
  assert.equal(db.tables.web_collection_jobs.size, 3);
});

test("authorized operator idempotently triggers the Kuaimai current inventory snapshot", async () => {
  const db = createWebCollectionD1Mock();
  const input = {
    action: "trigger",
    providerId: "kuaimai",
    resourceType: "inventory",
    businessDate: "2026-07-26"
  };
  const first = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    body: input
  });

  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.created, 1);
  assert.equal(first.body.data.job.resourceType, "inventory");
  assert.equal(first.body.data.job.rangeKind, "current_snapshot");
  assert.equal(first.body.data.job.range, null);
  assert.equal(
    first.body.data.job.idempotencyKey,
    "kuaimai:inventory:2026-07-26:v1:env:production:v1"
  );

  const repeated = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    body: input
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.data.created, 0);
  assert.equal(db.tables.web_collection_jobs.size, 1);
});

test("authorized operator triggers the repaired Kuaimai orders schedule", async () => {
  const db = createWebCollectionD1Mock();
  const result = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    body: { action: "trigger", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-22" }
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.job.idempotencyKey, "kuaimai:orders:2026-07-22:v2:env:production:v1");
});

test("authorized operator triggers a registered Douyin store resource", async () => {
  const db = createWebCollectionD1Mock();
  const result = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST",
    db,
    session: operator,
    body: {
      action: "trigger",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-23"
    }
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.job.storeId, "store-a");
  assert.equal(
    result.body.data.job.idempotencyKey,
    "douyin-ecommerce:store-a:store_daily:2026-07-23:v1:env:production:v1"
  );
});

test("manual confirmation requeues a Kuaimai job after login is restored", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: operator,
    body: { action: "trigger", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22" }
  });
  const claimed = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "claim" }
  });
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: {
      action: "transition", jobId: claimed.body.data.job.id, from: "claimed", status: "opening", stage: "opening"
    }
  });
  await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: {
      action: "transition",
      jobId: claimed.body.data.job.id,
      from: "opening",
      status: "waiting_human",
      stage: "login",
      errorCode: "KUAIMAI_LOGIN_REQUIRED",
      errorSummary: "快麦登录已过期"
    }
  });

  const retriggered = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: operator,
    body: { action: "trigger", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", force: true }
  });
  assert.equal(retriggered.response.status, 200);
  assert.equal(retriggered.body.data.requeued, true);
  assert.equal(retriggered.body.data.job.status, "queued");
  assert.equal(retriggered.body.data.job.runnerId, null);
  assert.equal(retriggered.body.data.job.errorCode, null);
});

test("ensure plan automatically requeues an eligible transient failure without changing its identity", async () => {
  const db = createWebCollectionD1Mock();
  const registration = await register(db);
  const token = registration.body.data.token;
  const job = {
    providerId: "kuaimai",
    resourceType: "orders",
    businessDate: "2026-07-22",
    rangeKind: "daily_fact",
    range: { start: "2026-07-22T00:00:00+08:00", end: "2026-07-22T23:59:59+08:00", timeZone: "Asia/Shanghai" },
    scheduleVersion: "v1",
    idempotencyKey: "kuaimai:orders:2026-07-22:v1"
  };
  const first = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "ensure_plan", jobs: [job] }
  });
  const stored = db.tables.web_collection_jobs.get(first.body.data.jobs[0].id);
  Object.assign(stored, {
    status: "failed",
    stage: "downloading",
    attempt: 1,
    runner_id: registration.body.data.id,
    error_code: "EXTENSION_DOWNLOAD_TIMEOUT",
    updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString()
  });

  const retried = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, token, body: { action: "ensure_plan", jobs: [job] }
  });
  assert.equal(retried.response.status, 200);
  assert.equal(retried.body.data.created, 0);
  assert.equal(retried.body.data.jobs[0].id, stored.id);
  assert.equal(retried.body.data.jobs[0].status, "queued");
  assert.equal(retried.body.data.jobs[0].attempt, 1);
  assert.equal(retried.body.data.jobs[0].errorCode, null);
});

test("Kuaimai Chrome trigger rejects missing sessions, readonly users and non-triggerable resources", async () => {
  const db = createWebCollectionD1Mock();
  const input = { action: "trigger", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22" };
  const missing = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, body: input
  });
  assert.equal(missing.response.status, 401);

  const readonly = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: { ...operator, role: "readonly" }, body: input
  });
  assert.equal(readonly.response.status, 403);
  assert.equal(readonly.body.error.code, "WEB_COLLECTION_TRIGGER_DENIED");

  const otherResource = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: operator, body: { ...input, resourceType: "purchases" }
  });
  assert.equal(otherResource.response.status, 400);
  assert.equal(otherResource.body.error.code, "WEB_COLLECTION_TRIGGER_INVALID");
});
