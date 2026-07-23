import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as onJobs } from "../functions/api/platform/v1/web-collection/jobs.js";
import { onRequest as onRunners } from "../functions/api/platform/v1/web-collection/runners.js";
import { createWebCollectionD1Mock } from "./helpers/web-collection-d1-mock.mjs";

const executive = { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };
const operator = { userId: "ops-1", name: "运营主管", role: "operations", department: "运营部" };

async function jsonCall(handler, url, { method = "GET", db, session, token, body } = {}) {
  const request = new Request(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const response = await handler({ request, env: db ? { PRODUCT_FLOW_DB: db } : {}, data: session ? { session } : {} });
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

  const notification = { action: "record_notification", jobId, kind: "failure", dedupeKey: "2026-07-22:kuaimai:inventory:LOGIN_REQUIRED:opening", result: "sent" };
  const first = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", { method: "POST", db, token, body: notification });
  const repeated = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", { method: "POST", db, token, body: notification });
  assert.equal(first.body.data.duplicate, false);
  assert.equal(repeated.body.data.duplicate, true);
  assert.equal(db.tables.web_collection_notifications.size, 1);
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
  assert.equal(first.body.data.job.idempotencyKey, "kuaimai:order_items:2026-07-22:v1");

  const repeated = await jsonCall(onJobs, "https://flow.example.com/api/platform/v1/web-collection/jobs", {
    method: "POST", db, session: operator, body: input
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.data.created, 0);
  assert.equal(repeated.body.data.requeued, false);
  assert.equal(db.tables.web_collection_jobs.size, 1);
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

test("Kuaimai Chrome trigger rejects missing sessions, readonly users and unregistered resources", async () => {
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
    method: "POST", db, session: operator, body: { ...input, resourceType: "inventory" }
  });
  assert.equal(otherResource.response.status, 400);
  assert.equal(otherResource.body.error.code, "WEB_COLLECTION_TRIGGER_INVALID");
});
