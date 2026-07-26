import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as resourceRoute } from "../functions/api/platform/v1/supply-chain-workflows/[resource].js";
import { onRequest as actionRoute } from "../functions/api/platform/v1/supply-chain-workflows/[resource]/[id]/actions.js";

const sessions = {
  executive: { userId: "exec-1", name: "总经理", role: "executive", department: "品牌部" },
  supply: { userId: "supply-1", name: "供应链", department: "供应链部" },
  quality: { userId: "quality-1", name: "质量", department: "质量管理部" },
  readonly: { userId: "read-1", name: "只读", role: "readonly", department: "供应链部" }
};

function database() {
  const entities = new Map();
  const events = new Map();
  const key = (resource, id) => `${resource}:${id}`;
  return {
    entities,
    events,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (/from supply_chain_workflow_events where idempotency_key = \?/.test(normalized)) {
            return [...events.values()].find(row => row.idempotency_key === statement.values[0]) || null;
          }
          if (/from supply_chain_workflow_entities where resource_type = \? and id = \?/.test(normalized)) {
            return entities.get(key(statement.values[0], statement.values[1])) || null;
          }
          return null;
        },
        async all() {
          if (/from supply_chain_workflow_entities where resource_type = \?/.test(normalized)) {
            return {
              results: [...entities.values()]
                .filter(row => row.resource_type === statement.values[0])
                .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
            };
          }
          return { results: [] };
        },
        async run() {
          if (/^create (?:table|index)/.test(normalized)) return { success: true, meta: { changes: 0 } };
          if (/^insert into supply_chain_workflow_entities/.test(normalized)) {
            const [resource_type, id, status, version, owner_department, payload, archived_at, created_at, created_by, updated_at, updated_by] = statement.values;
            const entityKey = key(resource_type, id);
            if (entities.has(entityKey)) throw Object.assign(new Error("unique"), { cause: "UNIQUE" });
            entities.set(entityKey, { resource_type, id, status, version, owner_department, payload, archived_at, created_at, created_by, updated_at, updated_by });
            return { success: true, meta: { changes: 1 } };
          }
          if (/^update supply_chain_workflow_entities/.test(normalized)) {
            const [status, version, payload, archived_at, updated_at, updated_by, resource, id, expected] = statement.values;
            const entityKey = key(resource, id);
            const current = entities.get(entityKey);
            if (!current || current.version !== expected) return { success: true, meta: { changes: 0 } };
            entities.set(entityKey, {
              ...current, status, version, payload, archived_at, updated_at, updated_by
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/^insert into supply_chain_workflow_events/.test(normalized)) {
            const [id, resource_type, entity_id, action, from_status, to_status, expected_version, result_version, idempotency_key, reason, fields, actor_id, actor_name, actor_department, created_at] = statement.values;
            if ([...events.values()].some(row => row.idempotency_key === idempotency_key)) {
              throw Object.assign(new Error("unique"), { cause: "UNIQUE" });
            }
            events.set(id, { id, resource_type, entity_id, action, from_status, to_status, expected_version, result_version, idempotency_key, reason, fields, actor_id, actor_name, actor_department, created_at });
            return { success: true, meta: { changes: 1 } };
          }
          throw new Error(`unsupported SQL ${normalized}`);
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}

async function call(handler, {
  method = "GET",
  resource = "purchase-plans",
  id = "",
  session = sessions.supply,
  db,
  body,
  key = ""
} = {}) {
  const response = await handler({
    request: new Request(`https://flow.example.com/api/platform/v1/supply-chain-workflows/${resource}${id ? `/${id}/actions` : ""}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session },
    params: { resource, id }
  });
  return { response, body: await response.json() };
}

test("workflow create, list and action are versioned and idempotent", async () => {
  const db = database();
  const created = await call(resourceRoute, {
    method: "POST",
    db,
    key: "create-plan-1",
    body: { id: "plan-1", fields: { title: "7 月补货", suggestedQuantity: 100 } }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.entity.version, 1);
  assert.equal(created.body.entity.status, "draft");
  assert.equal(created.body.entity.ownerDepartment, "供应链部");

  const replay = await call(resourceRoute, {
    method: "POST",
    db,
    key: "create-plan-1",
    body: { id: "plan-1", fields: { title: "不能覆盖" } }
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.idempotentReplay, true);
  assert.equal(replay.body.entity.fields.title, "7 月补货");

  const submitted = await call(actionRoute, {
    method: "POST",
    resource: "purchase-plans",
    id: "plan-1",
    db,
    key: "submit-plan-1",
    body: { expectedVersion: 1, action: "submit", reason: "提交审批", fields: { adjustedQuantity: 90 } }
  });
  assert.equal(submitted.body.entity.version, 2);
  assert.equal(submitted.body.entity.status, "submitted");
  assert.equal(submitted.body.entity.fields.adjustedQuantity, 90);
  assert.equal(submitted.body.event.fromStatus, "draft");
  assert.equal(submitted.body.event.toStatus, "submitted");

  const listed = await call(resourceRoute, { db });
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].version, 2);
  assert.deepEqual(listed.body.coverage.sourceVersions, [2]);
  assert.equal(db.events.size, 2);
});

test("workflow actions enforce optimistic versions, departments and readonly identity", async () => {
  const db = database();
  await call(resourceRoute, {
    method: "POST",
    resource: "quality-incidents",
    session: sessions.quality,
    db,
    key: "create-quality-1",
    body: { id: "quality-1", fields: { summary: "包装破损" } }
  });
  const denied = await call(actionRoute, {
    method: "POST",
    resource: "quality-incidents",
    id: "quality-1",
    session: sessions.supply,
    db,
    key: "classify-quality-denied",
    body: { expectedVersion: 1, action: "classify", fields: {} }
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error.code, "SUPPLY_WORKFLOW_ACTION_DENIED");

  const stale = await call(actionRoute, {
    method: "POST",
    resource: "quality-incidents",
    id: "quality-1",
    session: sessions.quality,
    db,
    key: "classify-quality-stale",
    body: { expectedVersion: 9, action: "classify", fields: {} }
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error.code, "SUPPLY_WORKFLOW_VERSION_CONFLICT");

  const readonly = await call(resourceRoute, {
    method: "POST",
    session: sessions.readonly,
    db,
    key: "readonly-create",
    body: { id: "plan-2", fields: {} }
  });
  assert.equal(readonly.response.status, 403);
});

test("workflow API rejects client-owned identities and secrets", async () => {
  const db = database();
  const identity = await call(resourceRoute, {
    method: "POST",
    db,
    key: "identity-spoof",
    body: { id: "plan-1", fields: { ownerDepartment: "伪造" } }
  });
  assert.equal(identity.response.status, 400);
  assert.equal(identity.body.error.code, "SUPPLY_WORKFLOW_SERVER_FIELD_DENIED");

  const secret = await call(resourceRoute, {
    method: "POST",
    resource: "suppliers",
    db,
    key: "supplier-secret",
    body: { id: "supplier-1", fields: { password: "secret" } }
  });
  assert.equal(secret.response.status, 400);
  assert.equal(secret.body.error.code, "SUPPLY_WORKFLOW_SENSITIVE_FIELD_DENIED");
});

test("workflow API hides unexpected storage details", async () => {
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async run() {
          throw new Error("SQL failed with authorization=do-not-leak");
        }
      };
    }
  };
  const result = await call(resourceRoute, { db });
  assert.equal(result.response.status, 500);
  assert.equal(result.body.error.code, "SUPPLY_WORKFLOW_INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(result.body), /SQL|do-not-leak|authorization=/i);
});
