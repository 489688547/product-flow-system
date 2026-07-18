import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routePath = resolve("functions/api/platform/v1/environment-readiness.js");

async function loadRoute() {
  assert.equal(existsSync(routePath), true, "environment readiness route must exist");
  return import(routePath);
}

function request() {
  return new Request("https://product-flow-system.pages.dev/api/platform/v1/environment-readiness");
}

function createTableDb(tables = []) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (!sql.toLowerCase().includes("sqlite_master")) throw new Error(`Unexpected SQL: ${sql}`);
          return { results: tables.map(name => ({ name })) };
        }
      };
    }
  };
}

test("environment readiness defensively requires an employee session", async () => {
  const { onRequest } = await loadRoute();
  const response = await onRequest({ request: request(), env: {}, data: {} });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "AUTH_SESSION_REQUIRED");
});

test("environment readiness reports missing production bindings and variables without values", async () => {
  const { onRequest } = await loadRoute();
  const response = await onRequest({
    request: request(),
    env: { RUNTIME_ENV: "production", DINGTALK_APP_KEY: "must-not-leak" },
    data: { session: { name: "平台管理员", role: "executive", department: "总经办" } }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.environment, "production");
  assert.equal(payload.ready, false);
  assert.equal(payload.capabilities.some(item => item.missing.includes("PRODUCT_FLOW_DB")), true);
  assert.equal(payload.capabilities.some(item => item.missing.includes("DINGTALK_APP_SECRET")), true);
  assert.equal(JSON.stringify(payload).includes("must-not-leak"), false);
});

test("warning capabilities do not block an otherwise ready production environment", async () => {
  const { onRequest } = await loadRoute();
  const tables = [
    "production_data_access_tokens",
    "production_write_unlocks",
    "production_data_snapshots",
    "production_data_snapshot_parts",
    "production_data_audit"
  ];
  const response = await onRequest({
    request: request(),
    env: {
      RUNTIME_ENV: "production",
      PRODUCT_FLOW_DB: createTableDb(tables),
      DINGTALK_APP_KEY: "configured",
      DINGTALK_APP_SECRET: "configured"
    },
    data: { session: { name: "员工", role: "product", department: "产品部" } }
  });
  const payload = await response.json();
  assert.equal(payload.ready, true);
  assert.equal(payload.capabilities.find(item => item.id === "kuaimai-sales-sync").status, "warning");
  assert.equal(payload.capabilities.find(item => item.id === "production-data-control").status, "ready");
  assert.equal(payload.checkedAt.endsWith("Z"), true);
});

test("environment readiness rejects unsupported methods", async () => {
  const { onRequest } = await loadRoute();
  const response = await onRequest({
    request: new Request(request().url, { method: "POST" }),
    env: {},
    data: { session: { name: "员工" } }
  });
  assert.equal(response.status, 405);
});
