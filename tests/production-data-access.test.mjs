import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const accessModulePath = resolve("functions/api/platform/_shared/productionDataAccess.js");
const unlockRoutePath = resolve("functions/api/platform/v1/production-write-session.js");
const stateRoutePath = resolve("functions/api/platform/v1/production-data/state.js");

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(item => item.toString(16).padStart(2, "0")).join("");
}

function createProductionDb() {
  const state = {
    state: {
      version: "v1",
      demands: [], products: [], tasks: [], deliverables: [], reviews: [], feedbackIssues: [], productPlans: [],
      marker: "before"
    },
    version: "v1",
    updatedAt: "2026-07-18T08:00:00.000Z",
    updatedBy: "线上账号"
  };
  const data = {
    access: new Map(),
    org: new Map(),
    unlocks: new Map(),
    snapshots: new Map(),
    snapshotParts: new Map(),
    audits: new Map(),
    stateParts: new Map(),
    state
  };

  function seedStateParts(next = data.state) {
    data.stateParts.clear();
    Object.entries(next.state).forEach(([key, value]) => {
      data.stateParts.set(`company:${key}:0`, {
        state_id: "company", part_key: key, part_index: 0, payload: JSON.stringify(value),
        updated_at: next.updatedAt, updated_by: next.updatedBy
      });
    });
  }
  seedStateParts();

  const db = {
    data,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          const values = statement.values;
          if (normalized.startsWith("insert into production_write_unlocks")) {
            const [unlockHash, accessHash, reason, createdAt, expiresAt] = values;
            data.unlocks.set(unlockHash, { unlock_hash: unlockHash, access_token_hash: accessHash, reason, created_at: createdAt, expires_at: expiresAt, revoked_at: null });
          } else if (normalized.startsWith("update production_write_unlocks set revoked_at")) {
            for (const row of data.unlocks.values()) if (row.access_token_hash === values[1]) row.revoked_at = values[0];
          } else if (normalized.startsWith("update production_data_access_tokens set last_used_at")) {
            const row = data.access.get(values[1]); if (row) row.last_used_at = values[0];
          } else if (normalized.startsWith("insert into production_data_snapshots")) {
            const [id, version, updatedAt, updatedBy, createdAt] = values;
            data.snapshots.set(id, { id, version, state_updated_at: updatedAt, state_updated_by: updatedBy, created_at: createdAt });
          } else if (normalized.startsWith("insert into production_data_snapshot_parts")) {
            const [snapshotId, partIndex, payload] = values;
            data.snapshotParts.set(`${snapshotId}:${partIndex}`, { snapshot_id: snapshotId, part_index: partIndex, payload });
          } else if (normalized.startsWith("insert into production_data_audit")) {
            const [id, action, sourceEnvironment, userId, unionId, name, reason, snapshotId, beforeVersion, beforeUpdatedAt, status, requestId, createdAt] = values;
            data.audits.set(id, { id, action, source_environment: sourceEnvironment, user_id: userId, union_id: unionId, name, reason, snapshot_id: snapshotId, before_version: beforeVersion, before_updated_at: beforeUpdatedAt, after_version: null, after_updated_at: null, status, request_id: requestId, created_at: createdAt });
          } else if (normalized.startsWith("update production_data_audit set after_version")) {
            const row = data.audits.get(values[3]);
            Object.assign(row, { after_version: values[0], after_updated_at: values[1], status: values[2] });
          } else if (normalized.startsWith("delete from product_flow_state_parts")) {
            data.stateParts.clear();
          } else if (normalized.startsWith("insert into product_flow_state_parts")) {
            const [stateId, partKey, partIndex, payload, updatedAt, updatedBy] = values;
            data.stateParts.set(`${stateId}:${partKey}:${partIndex}`, { state_id: stateId, part_key: partKey, part_index: partIndex, payload, updated_at: updatedAt, updated_by: updatedBy });
          }
          return { success: true };
        },
        async first() {
          const values = statement.values;
          if (normalized.includes("from production_data_access_tokens")) return data.access.get(values[0]) || null;
          if (normalized.includes("from product_flow_org_members")) return data.org.get(values[0]) || null;
          if (normalized.includes("from production_write_unlocks")) return data.unlocks.get(values[0]) || null;
          if (normalized.includes("from production_data_audit")) return data.audits.get(values[0]) || null;
          if (normalized.includes("from production_data_snapshots")) return data.snapshots.get(values[0]) || null;
          if (normalized.includes("from product_flow_state where")) return null;
          return null;
        },
        async all() {
          const values = statement.values;
          if (normalized.includes("from product_flow_state_parts")) {
            return { results: [...data.stateParts.values()].sort((a, b) => a.part_key.localeCompare(b.part_key) || a.part_index - b.part_index) };
          }
          if (normalized.includes("from production_data_snapshot_parts")) {
            return { results: [...data.snapshotParts.values()].filter(row => row.snapshot_id === values[0]).sort((a, b) => a.part_index - b.part_index) };
          }
          if (normalized.includes("from production_data_audit")) {
            return { results: [...data.audits.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Number(values[0] || 30)) };
          }
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
  return db;
}

async function seedAccess(db, { raw = "personal-token", capabilities = ["read", "write"], role = "executive", expiresAt = "2099-01-01T00:00:00.000Z" } = {}) {
  const tokenHash = await sha256(raw);
  db.data.access.set(tokenHash, {
    token_hash: tokenHash,
    user_id: "ding-user-1",
    union_id: "ding-union-1",
    name: "最高权限账号",
    capabilities: JSON.stringify(capabilities),
    expires_at: expiresAt,
    revoked_at: null
  });
  db.data.org.set("ding-user-1", { user_id: "ding-user-1", union_id: "ding-union-1", name: "最高权限账号", role, active: 1 });
  return raw;
}

function gatewayRequest(path, { method = "GET", token = "personal-token", unlock = "", body } = {}) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (unlock) headers.set("x-pfs-production-unlock", unlock);
  if (body) headers.set("content-type", "application/json");
  return new Request(`https://product-flow-system.pages.dev${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function loadRoutes() {
  assert.equal(existsSync(accessModulePath), true, "production data access module must exist");
  assert.equal(existsSync(unlockRoutePath), true, "production write session route must exist");
  assert.equal(existsSync(stateRoutePath), true, "production state gateway must exist");
  return {
    access: await import(accessModulePath),
    unlock: await import(unlockRoutePath),
    state: await import(stateRoutePath)
  };
}

test("production data gateway rejects missing personal tokens", async () => {
  const { state } = await loadRoutes();
  const response = await state.onRequest({ request: gatewayRequest("/api/platform/v1/production-data/state", { token: "" }), env: { PRODUCT_FLOW_DB: createProductionDb() } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "PRODUCTION_TOKEN_REQUIRED");
});

test("personal token is stored only as a hash and can read production state", async () => {
  const { state } = await loadRoutes();
  const db = createProductionDb();
  const raw = await seedAccess(db);
  assert.equal(JSON.stringify([...db.data.access.values()]).includes(raw), false);
  const response = await state.onRequest({ request: gatewayRequest("/api/platform/v1/production-data/state", { token: raw }), env: { PRODUCT_FLOW_DB: db } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.state.marker, "before");
  assert.equal(payload.updatedAt, "2026-07-18T08:00:00.000Z");
});

test("production writes require the exact confirmation, reason, and active unlock", async () => {
  const { unlock, state } = await loadRoutes();
  const db = createProductionDb();
  await seedAccess(db);
  const denied = await state.onRequest({
    request: gatewayRequest("/api/platform/v1/production-data/state", { method: "POST", body: { state: db.data.state.state, baseUpdatedAt: db.data.state.updatedAt } }),
    env: { PRODUCT_FLOW_DB: db }
  });
  assert.equal(denied.status, 423);

  const invalid = await unlock.onRequest({
    request: gatewayRequest("/api/platform/v1/production-write-session", { method: "POST", body: { reason: "测试", confirmation: "确认" } }),
    env: { PRODUCT_FLOW_DB: db }
  });
  assert.equal(invalid.status, 400);

  const granted = await unlock.onRequest({
    request: gatewayRequest("/api/platform/v1/production-write-session", { method: "POST", body: { reason: "修正线上产品状态", confirmation: "修改线上真实数据" } }),
    env: { PRODUCT_FLOW_DB: db }
  });
  const grant = await granted.json();
  assert.equal(granted.status, 200);
  assert.equal(typeof grant.unlockToken, "string");
  assert.equal(grant.unlockToken.length > 30, true);
  assert.equal(JSON.stringify([...db.data.unlocks.values()]).includes(grant.unlockToken), false);
});

test("unlocked writes create a snapshot and audit while stale writes return conflict", async () => {
  const { unlock, state } = await loadRoutes();
  const db = createProductionDb();
  await seedAccess(db);
  const grantResponse = await unlock.onRequest({
    request: gatewayRequest("/api/platform/v1/production-write-session", { method: "POST", body: { reason: "修正线上产品状态", confirmation: "修改线上真实数据" } }),
    env: { PRODUCT_FLOW_DB: db }
  });
  const grant = await grantResponse.json();
  const nextState = { ...db.data.state.state, version: "v2", marker: "after" };
  const written = await state.onRequest({
    request: gatewayRequest("/api/platform/v1/production-data/state", { method: "POST", unlock: grant.unlockToken, body: { state: nextState, baseUpdatedAt: "2026-07-18T08:00:00.000Z" } }),
    env: { PRODUCT_FLOW_DB: db }
  });
  const saved = await written.json();
  assert.equal(written.status, 200, saved.message);
  assert.equal(saved.synced, true);
  assert.equal(db.data.snapshots.size, 1);
  assert.equal(db.data.audits.size, 1);
  assert.equal([...db.data.audits.values()][0].status, "succeeded");

  const conflict = await state.onRequest({
    request: gatewayRequest("/api/platform/v1/production-data/state", { method: "POST", unlock: grant.unlockToken, body: { state: nextState, baseUpdatedAt: "2026-07-18T08:00:00.000Z" } }),
    env: { PRODUCT_FLOW_DB: db }
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "PRODUCTION_DATA_VERSION_CONFLICT");
});

test("a successful production write can roll back to its write-before snapshot", async () => {
  const { unlock, state } = await loadRoutes();
  const db = createProductionDb();
  await seedAccess(db);
  const grant = await (await unlock.onRequest({
    request: gatewayRequest("/api/platform/v1/production-write-session", { method: "POST", body: { reason: "修正线上产品状态", confirmation: "修改线上真实数据" } }),
    env: { PRODUCT_FLOW_DB: db }
  })).json();
  const writePayload = await (await state.onRequest({
    request: gatewayRequest("/api/platform/v1/production-data/state", { method: "POST", unlock: grant.unlockToken, body: { state: { ...db.data.state.state, version: "v2", marker: "after" }, baseUpdatedAt: db.data.state.updatedAt } }),
    env: { PRODUCT_FLOW_DB: db }
  })).json();
  const rollback = await state.onRequest({
    request: gatewayRequest("/api/platform/v1/production-data/state", { method: "POST", unlock: grant.unlockToken, body: { action: "rollback", auditId: writePayload.auditId, confirmation: "修改线上真实数据" } }),
    env: { PRODUCT_FLOW_DB: db }
  });
  const rolledBack = await rollback.json();
  assert.equal(rollback.status, 200, rolledBack.message);
  const read = await (await state.onRequest({ request: gatewayRequest("/api/platform/v1/production-data/state"), env: { PRODUCT_FLOW_DB: db } })).json();
  assert.equal(read.state.marker, "before");
  assert.equal([...db.data.audits.values()].some(row => row.action === "rollback"), true);
});

test("production data access requires the active DingTalk identity to remain executive", async () => {
  const { state } = await loadRoutes();
  const db = createProductionDb();
  await seedAccess(db, { role: "product" });
  const response = await state.onRequest({ request: gatewayRequest("/api/platform/v1/production-data/state"), env: { PRODUCT_FLOW_DB: db } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "PRODUCTION_ROLE_REQUIRED");
});
