import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routePath = resolve("functions/api/platform/v1/environment-readiness.js");
const REQUIRED_PRODUCTION_TABLES = [
  "production_data_access_tokens",
  "production_write_unlocks",
  "production_data_snapshots",
  "production_data_snapshot_parts",
  "production_data_audit",
  "collaboration_items",
  "collaboration_participants",
  "collaboration_activities",
  "platform_credentials",
  "platform_credential_audit"
];
const TEST_PLATFORM_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const HR_CORE_TABLES = [
  "hr_employees",
  "hr_assignments",
  "hr_role_assignments",
  "hr_lifecycle_events",
  "hr_performance_templates",
  "hr_performance_cycles",
  "hr_performance_items",
  "hr_evidence_snapshots",
  "hr_audit_logs",
  "hr_management_meta"
];
const USER_INSIGHT_TABLES = [
  "user_insight_category_mappings",
  "user_insight_rules",
  "user_insight_snapshots",
  "user_insight_entities",
  "user_insight_competitors",
  "user_insight_sync_runs",
  "user_insight_runner_tokens",
  "user_insight_audit_logs",
  "user_insight_meta"
];
const GOODS_FLOW_TABLES = [
  "goods_flow_events",
  "goods_flow_inventory_daily",
  "goods_flow_stocktakes",
  "goods_flow_stocktake_lines",
  "goods_flow_receivable_terms",
  "goods_flow_ccc_monthly",
  "goods_flow_exceptions"
];

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

const businessDataTables = [
  "data_sources",
  "data_runners",
  "data_sync_runs",
  "data_source_files",
  "data_dimension_mappings",
  "data_metric_definitions",
  "data_quality_issues",
  "data_app_subscriptions",
  "data_audit_logs",
  "data_center_meta",
  "product_catalog_items",
  "product_catalog_skus",
  "product_catalog_sync_runs",
  "product_catalog_meta",
  "ecommerce_operation_records",
  "ecommerce_operation_meta",
  "ecommerce_operation_state",
  "performance_management_records",
  "performance_management_meta",
  "performance_management_state"
];

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
  const tables = [...REQUIRED_PRODUCTION_TABLES, ...businessDataTables, ...HR_CORE_TABLES, ...USER_INSIGHT_TABLES, ...GOODS_FLOW_TABLES];
  const response = await onRequest({
    request: request(),
    env: {
      RUNTIME_ENV: "production",
      PRODUCT_FLOW_DB: createTableDb(tables),
      DINGTALK_APP_KEY: "configured",
      DINGTALK_APP_SECRET: "configured",
      PLATFORM_CREDENTIAL_MASTER_KEY: TEST_PLATFORM_MASTER_KEY
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

test("a server-only production data token can read readiness without an employee cookie", async () => {
  const { onRequest } = await loadRoute();
  const rawToken = "local-production-readiness-token";
  const bytes = new TextEncoder().encode(rawToken);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const tokenHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  const tables = [...REQUIRED_PRODUCTION_TABLES, ...businessDataTables, ...HR_CORE_TABLES, ...USER_INSIGHT_TABLES, ...GOODS_FLOW_TABLES];
  const db = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() { return { success: true }; },
        async first() {
          if (/from production_data_access_tokens/i.test(sql) && statement.values[0] === tokenHash) {
            return { token_hash: tokenHash, user_id: "u1", union_id: "union1", name: "最高权限账号", capabilities: "[\"read\"]", expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null };
          }
          if (/from product_flow_org_members/i.test(sql)) return { user_id: "u1", union_id: "union1", name: "最高权限账号", role: "executive", active: 1 };
          return null;
        },
        async all() {
          if (/sqlite_master/i.test(sql)) return { results: tables.map(name => ({ name })) };
          return { results: [] };
        }
      };
      return statement;
    }
  };
  const response = await onRequest({
    request: new Request(request().url, { headers: { authorization: `Bearer ${rawToken}` } }),
    env: {
      RUNTIME_ENV: "production",
      PRODUCT_FLOW_DB: db,
      DINGTALK_APP_KEY: "configured",
      DINGTALK_APP_SECRET: "configured",
      PLATFORM_CREDENTIAL_MASTER_KEY: TEST_PLATFORM_MASTER_KEY
    },
    data: {}
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ready, true);
});
