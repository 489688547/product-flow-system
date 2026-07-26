import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/api/platform/v1/data-tasks.js";

const session = {
  userId: "supply-1",
  name: "供应链",
  department: "供应链部"
};

function database() {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (/from web_collection_jobs/i.test(sql)) {
            return {
              results: [{
                id: "web-1",
                provider_id: "kuaimai",
                resource_type: "inventory_snapshot",
                business_date: "2026-07-26",
                status: "waiting_human",
                stage: "opening",
                attempt: 1,
                error_code: "KUAIMAI_LOGIN_REQUIRED",
                updated_at: "2026-07-26T05:10:00.000Z",
                completed_at: null
              }]
            };
          }
          if (/from erp_collection_batches/i.test(sql)) {
            return {
              results: [{
                id: "erp-1",
                platform_id: "kuaimai",
                resource_type: "inventory_snapshot",
                range_end: "2026-07-26",
                status: "completed",
                row_count: 3568,
                updated_at: "2026-07-26T06:20:00.000Z",
                imported_at: "2026-07-26T06:20:00.000Z"
              }]
            };
          }
          return { results: [] };
        }
      };
    }
  };
}

async function call(options = {}) {
  const response = await onRequest({
    request: new Request(`https://flow.example.com/api/platform/v1/data-tasks${options.query || ""}`),
    env: options.db === null ? {} : { PRODUCT_FLOW_DB: options.db || database() },
    data: options.session === null ? {} : { session: options.session || session }
  });
  return { response, body: await response.json() };
}

test("data tasks aggregate safe web and ERP states with actionable recovery", async () => {
  const result = await call();
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.items, [
    {
      id: "erp:erp-1",
      kind: "erp_batch",
      providerId: "kuaimai",
      resourceType: "inventory_snapshot",
      businessDate: "2026-07-26",
      status: "completed",
      stage: "projected",
      attempt: 1,
      rowCount: 3568,
      errorCode: null,
      updatedAt: "2026-07-26T06:20:00.000Z",
      completedAt: "2026-07-26T06:20:00.000Z",
      recoveryAction: null
    },
    {
      id: "web:web-1",
      kind: "web_collection",
      providerId: "kuaimai",
      resourceType: "inventory_snapshot",
      businessDate: "2026-07-26",
      status: "waiting_human",
      stage: "opening",
      attempt: 1,
      rowCount: null,
      errorCode: "KUAIMAI_LOGIN_REQUIRED",
      updatedAt: "2026-07-26T05:10:00.000Z",
      completedAt: null,
      recoveryAction: "open_dedicated_browser"
    }
  ]);
  assert.equal(result.body.quality.status, "partial");
  assert.equal(result.body.quality.lastSuccessfulSyncAt, "2026-07-26T06:20:00.000Z");
  assert.doesNotMatch(JSON.stringify(result.body), /token|cookie|source_file_name|runner_id|error_summary/i);
});

test("data tasks treats successful web collection jobs as trusted completions", async () => {
  const db = database();
  const originalPrepare = db.prepare;
  db.prepare = sql => {
    if (!/from web_collection_jobs/i.test(sql)) return originalPrepare.call(db, sql);
    return {
      bind() { return this; },
      async all() {
        return {
          results: [{
            id: "web-success",
            provider_id: "kuaimai",
            resource_type: "inventory_snapshot",
            business_date: "2026-07-26",
            status: "success",
            stage: "submitted",
            attempt: 1,
            error_code: null,
            updated_at: "2026-07-26T06:25:00.000Z",
            completed_at: "2026-07-26T06:25:00.000Z"
          }]
        };
      }
    };
  };

  const result = await call({ db });
  assert.equal(result.body.quality.status, "trusted");
  assert.equal(result.body.quality.coverage, 1);
  assert.equal(result.body.quality.lastSuccessfulSyncAt, "2026-07-26T06:25:00.000Z");
});

test("data tasks requires session and control D1", async () => {
  assert.equal((await call({ session: null })).response.status, 401);
  const missing = await call({ db: null });
  assert.equal(missing.response.status, 501);
  assert.equal(missing.body.error.code, "DATA_TASKS_STORAGE_UNAVAILABLE");
});

test("data tasks hides unexpected database details", async () => {
  const db = {
    prepare() {
      return {
        async all() {
          throw new Error("SQL failed with token=do-not-leak");
        }
      };
    }
  };
  const result = await call({ db });
  assert.equal(result.response.status, 500);
  assert.equal(result.body.error.code, "DATA_TASKS_QUERY_FAILED");
  assert.doesNotMatch(JSON.stringify(result.body), /SQL|do-not-leak|token=/i);
});
