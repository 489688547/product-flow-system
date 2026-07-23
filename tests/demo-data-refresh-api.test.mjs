import assert from "node:assert/strict";
import test from "node:test";
import { createDataEnvironmentD1Mock } from "./helpers/data-environment-d1-mock.mjs";
import { onRequest as createRefresh } from "../functions/api/platform/v1/data-environment/refresh.js";
import { onRequest as getRefresh } from "../functions/api/platform/v1/data-environment/refresh/[id].js";
import { onRequest as stepRefresh } from "../functions/api/platform/v1/data-environment/refresh/[id]/step.js";

const executive = { userId: "executive-1", role: "executive" };

function memoryRepository() {
  const jobs = new Map();
  let leased = false;
  return {
    jobs,
    async findActiveJob() {
      return [...jobs.values()].find(job => ["queued", "running"].includes(job.status)) || null;
    },
    async createJob(job) {
      jobs.set(job.id, { ...job });
      return jobs.get(job.id);
    },
    async getJob(id) {
      return jobs.get(id) || null;
    },
    async acquireLease(id) {
      if (leased) return false;
      leased = true;
      jobs.get(id).status = "running";
      return true;
    },
    async saveJob(id, patch) {
      Object.assign(jobs.get(id), patch);
      leased = false;
      return jobs.get(id);
    },
    async failJob(id, code) {
      Object.assign(jobs.get(id), { status: "failed", lastErrorCode: code, finishedAt: new Date().toISOString() });
      leased = false;
      return jobs.get(id);
    },
    async activateJob(id) {
      Object.assign(jobs.get(id), { status: "succeeded", finishedAt: new Date().toISOString() });
      leased = false;
      return jobs.get(id);
    }
  };
}

function context({
  method = "POST",
  path = "/api/platform/v1/data-environment/refresh",
  session = executive,
  repository = memoryRepository(),
  params = {}
} = {}) {
  const controlDb = createDataEnvironmentD1Mock();
  return {
    request: new Request(`https://example.com${path}`, { method }),
    env: {
      PRODUCT_FLOW_DB: controlDb,
      DEMO_FLOW_DB: {},
      DEMO_DATA_MASKING_KEY: "test-masking-key-123456"
    },
    data: {
      session,
      controlDb,
      refreshRepository: repository,
      refreshData: {
        async preflightTable(entry) {
          return { available: entry.required, count: entry.required ? 1 : 0 };
        },
        async clearTable() {},
        async copyBatch() {
          return { rows: 0, done: true, cursor: {} };
        },
        async recalculateTable() {},
        async validate() {
          return { valid: true };
        }
      }
    },
    params
  };
}

test("refresh API creates one resumable job and exposes only safe progress", async () => {
  const repository = memoryRepository();
  const createdResponse = await createRefresh(context({ repository }));
  const created = await createdResponse.json();

  assert.equal(createdResponse.status, 202);
  assert.equal(created.job.status, "queued");
  assert.equal(created.job.stage, "preflight");
  assert.equal(JSON.stringify(created).includes("masking-key"), false);

  const secondResponse = await createRefresh(context({ repository }));
  const second = await secondResponse.json();
  assert.equal(secondResponse.status, 200);
  assert.equal(second.job.id, created.job.id);

  const getResponse = await getRefresh(context({
    method: "GET",
    path: `/api/platform/v1/data-environment/refresh/${created.job.id}`,
    repository,
    params: { id: created.job.id }
  }));
  const current = await getResponse.json();
  assert.equal(getResponse.status, 200);
  assert.equal(current.job.id, created.job.id);
  assert.equal("cursor" in current.job, false);
});

test("step endpoint advances one bounded unit and is safe to retry", async () => {
  const repository = memoryRepository();
  const created = await (await createRefresh(context({ repository }))).json();
  const stepContext = context({
    path: `/api/platform/v1/data-environment/refresh/${created.job.id}/step`,
    repository,
    params: { id: created.job.id }
  });
  const first = await stepRefresh(stepContext);
  const payload = await first.json();

  assert.equal(first.status, 200);
  assert.equal(payload.job.status, "running");
  assert.equal(payload.job.stage, "preflight");
  assert.equal(payload.job.terminal, false);
});

test("refresh endpoints reject non-executives and missing masking configuration", async () => {
  const denied = await createRefresh(context({
    session: { userId: "employee-1", role: "product" }
  }));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "DATA_ENVIRONMENT_PERMISSION_DENIED");

  const missing = context();
  delete missing.env.DEMO_DATA_MASKING_KEY;
  const unavailable = await createRefresh(missing);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.code, "DEMO_MASKING_KEY_MISSING");
});
