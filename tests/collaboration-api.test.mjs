import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as collectionRoute } from "../functions/api/platform/v1/collaboration-items.js";
import { onRequest as itemRoute } from "../functions/api/platform/v1/collaboration-items/[id].js";
import { onRequest as activitiesRoute } from "../functions/api/platform/v1/collaboration-items/[id]/activities.js";
import { onRequest as transitionsRoute } from "../functions/api/platform/v1/collaboration-items/[id]/transitions.js";

function normalizeSql(sql = "") {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function createCollaborationD1Mock() {
  const items = new Map();
  const participants = new Map();
  const activities = new Map();

  function participantKey(type, id, itemId) {
    return `${type}:${id}:${itemId}`;
  }

  return {
    items,
    participants,
    activities,
    prepare(sql) {
      const normalized = normalizeSql(sql);
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (normalized.startsWith("create table") || normalized.startsWith("create index")) return { success: true, meta: { changes: 0 } };
          if (normalized.startsWith("insert into collaboration_items")) {
            const [id, idempotencyKey, kind, status, impactLevel, requesterUserId, requesterDepartmentId, ownerUserId, ownerDepartmentId, dueAt, sourceAppId, payload, version, createdAt, updatedAt, archivedAt] = statement.values;
            items.set(id, { id, idempotency_key: idempotencyKey, kind, status, impact_level: impactLevel, requester_user_id: requesterUserId, requester_department_id: requesterDepartmentId, owner_user_id: ownerUserId, owner_department_id: ownerDepartmentId, due_at: dueAt, source_app_id: sourceAppId, payload, version, created_at: createdAt, updated_at: updatedAt, archived_at: archivedAt });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update collaboration_items")) {
            const [kind, status, impactLevel, requesterUserId, requesterDepartmentId, ownerUserId, ownerDepartmentId, dueAt, sourceAppId, payload, nextVersion, updatedAt, archivedAt, id, expectedVersion] = statement.values;
            const row = items.get(id);
            if (!row || row.version !== expectedVersion) return { success: true, meta: { changes: 0 } };
            Object.assign(row, { kind, status, impact_level: impactLevel, requester_user_id: requesterUserId, requester_department_id: requesterDepartmentId, owner_user_id: ownerUserId, owner_department_id: ownerDepartmentId, due_at: dueAt, source_app_id: sourceAppId, payload, version: nextVersion, updated_at: updatedAt, archived_at: archivedAt });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("delete from collaboration_participants")) {
            const [itemId] = statement.values;
            for (const [key, value] of participants) if (value.item_id === itemId) participants.delete(key);
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into collaboration_participants")) {
            const [subjectType, subjectId, itemId, createdAt] = statement.values;
            participants.set(participantKey(subjectType, subjectId, itemId), { subject_type: subjectType, subject_id: subjectId, item_id: itemId, created_at: createdAt });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into collaboration_activities")) {
            const [id, itemId, idempotencyKey, action, payload, createdAt] = statement.values;
            const duplicate = [...activities.values()].find(value => value.item_id === itemId && value.idempotency_key && value.idempotency_key === idempotencyKey);
            if (!duplicate) activities.set(id, { id, item_id: itemId, idempotency_key: idempotencyKey, action, payload, created_at: createdAt });
            return { success: true, meta: { changes: duplicate ? 0 : 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async first() {
          if (normalized.includes("from collaboration_items") && normalized.includes("idempotency_key = ?")) {
            return [...items.values()].find(row => row.idempotency_key === statement.values[0]) || null;
          }
          if (normalized.includes("from collaboration_items") && normalized.includes("where id = ?")) return items.get(statement.values[0]) || null;
          if (normalized.includes("from collaboration_activities") && normalized.includes("idempotency_key = ?")) {
            const [itemId, key] = statement.values;
            return [...activities.values()].find(row => row.item_id === itemId && row.idempotency_key === key) || null;
          }
          return null;
        },
        async all() {
          if (normalized.includes("from collaboration_activities")) {
            const [itemId] = statement.values;
            return { results: [...activities.values()].filter(row => row.item_id === itemId).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
          }
          if (normalized.includes("from collaboration_items")) {
            let rows = [...items.values()];
            if (normalized.includes("collaboration_participants")) {
              const subjectValues = new Set(statement.values.slice(0, -1));
              rows = rows.filter(row => [...participants.values()].some(value => value.item_id === row.id && subjectValues.has(value.subject_id)));
            }
            rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
            return { results: rows };
          }
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}

const productUser = { userId: "u-product", unionId: "union-product", name: "产品同事", department: "产品部", departmentId: "dept-product", role: "employee" };
const supplyUser = { userId: "u-supply", unionId: "union-supply", name: "供应链同事", department: "供应链", departmentId: "dept-supply", role: "employee" };
const executive = { userId: "u-executive", unionId: "union-executive", name: "总经办同事", department: "总经办", departmentId: "dept-executive", role: "executive" };

function draft(title = "确认首批包装到货时间") {
  return {
    idempotencyKey: `product-flow:product:p1:${title}`,
    kind: "handoff",
    title,
    description: "新品上市前确认包装进度。",
    requestedAction: "供应链确认排期和预计到仓日期。",
    impactLevel: "high",
    businessImpact: "延期会影响新品上市。",
    ownerDepartment: { id: "dept-supply", name: "供应链" },
    partnerDepartments: [],
    dueAt: "2026-07-25T18:00:00+08:00",
    source: { appId: "product-flow", entityType: "product", entityId: "p1", sourceRecordId: "task-1", sourceRoute: "#/progress/p1", sourceLabel: "鹦鹉谷物棒 · 包装到货" }
  };
}

async function createItem(db, session = productUser, body = draft()) {
  const response = await collectionRoute({
    request: new Request("https://flow.example.com/api/platform/v1/collaboration-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session }
  });
  return { response, payload: await response.json() };
}

test("collaboration API requires a session and D1 while readonly cannot write", async () => {
  const anonymous = await collectionRoute({ request: new Request("https://flow.example.com/api/platform/v1/collaboration-items"), env: {}, data: {} });
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "AUTH_SESSION_REQUIRED");

  const missingD1 = await collectionRoute({ request: new Request("https://flow.example.com/api/platform/v1/collaboration-items"), env: {}, data: { session: productUser } });
  assert.equal(missingD1.status, 501);

  const readonly = await createItem(createCollaborationD1Mock(), { ...productUser, role: "readonly" });
  assert.equal(readonly.response.status, 403);
  assert.equal(readonly.payload.error.code, "PERMISSION_WRITE_DENIED");
});

test("creation uses server identity, appends one activity and deduplicates the source", async () => {
  const db = createCollaborationD1Mock();
  const first = await createItem(db, productUser, { ...draft(), requesterUser: { userId: "spoofed" }, requesterDepartment: { id: "spoofed" } });
  assert.equal(first.response.status, 201);
  assert.equal(first.payload.item.requesterUser.userId, productUser.userId);
  assert.equal(first.payload.item.requesterDepartment.name, productUser.department);
  assert.equal(db.items.size, 1);
  assert.equal(db.activities.size, 1);

  const duplicate = await createItem(db);
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.payload.deduplicated, true);
  assert.equal(db.items.size, 1);
  assert.equal(db.activities.size, 1);
});

test("department users only list their scope and executives can list every item", async () => {
  const db = createCollaborationD1Mock();
  const productOwned = await createItem(db, productUser);
  const supplyOwned = await createItem(db, supplyUser, { ...draft("处理补货异常"), ownerDepartment: { id: "dept-product", name: "产品部" } });
  assert.equal(productOwned.response.status, 201);
  assert.equal(supplyOwned.response.status, 201);

  const productResponse = await collectionRoute({ request: new Request("https://flow.example.com/api/platform/v1/collaboration-items"), env: { PRODUCT_FLOW_DB: db }, data: { session: productUser } });
  const productPayload = await productResponse.json();
  assert.deepEqual(productPayload.items.map(item => item.id).sort(), [productOwned.payload.item.id, supplyOwned.payload.item.id].sort());

  const unrelated = { userId: "u-brand", unionId: "union-brand", name: "品牌同事", department: "品牌部", departmentId: "dept-brand", role: "employee" };
  const unrelatedResponse = await collectionRoute({ request: new Request("https://flow.example.com/api/platform/v1/collaboration-items"), env: { PRODUCT_FLOW_DB: db }, data: { session: unrelated } });
  assert.deepEqual((await unrelatedResponse.json()).items, []);

  const executiveResponse = await collectionRoute({ request: new Request("https://flow.example.com/api/platform/v1/collaboration-items"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  assert.equal((await executiveResponse.json()).items.length, 2);
});

test("unauthorized detail is hidden while owner can accept and activity remains auditable", async () => {
  const db = createCollaborationD1Mock();
  const created = await createItem(db);
  const id = created.payload.item.id;
  const unrelated = { userId: "u-brand", name: "品牌同事", department: "品牌部", departmentId: "dept-brand", role: "employee" };
  const hidden = await itemRoute({ request: new Request(`https://flow.example.com/api/platform/v1/collaboration-items/${id}`), env: { PRODUCT_FLOW_DB: db }, data: { session: unrelated }, params: { id } });
  assert.equal(hidden.status, 404);

  const accepted = await transitionsRoute({
    request: new Request(`https://flow.example.com/api/platform/v1/collaboration-items/${id}/transitions`, { method: "POST", body: JSON.stringify({ version: 1, transition: "accept", idempotencyKey: "accept-1", fields: { ownerUser: { userId: supplyUser.userId, unionId: supplyUser.unionId, name: supplyUser.name } } }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: supplyUser }, params: { id }
  });
  const acceptedPayload = await accepted.json();
  assert.equal(accepted.status, 200);
  assert.equal(acceptedPayload.item.status, "in_progress");
  assert.equal(acceptedPayload.item.version, 2);

  const activities = await activitiesRoute({ request: new Request(`https://flow.example.com/api/platform/v1/collaboration-items/${id}/activities`), env: { PRODUCT_FLOW_DB: db }, data: { session: productUser }, params: { id } });
  const activityPayload = await activities.json();
  assert.deepEqual(activityPayload.activities.map(activity => activity.action).sort(), ["accept", "create"]);
});

test("stale versions return conflict and do not append another activity", async () => {
  const db = createCollaborationD1Mock();
  const created = await createItem(db);
  const id = created.payload.item.id;
  const stale = await transitionsRoute({
    request: new Request(`https://flow.example.com/api/platform/v1/collaboration-items/${id}/transitions`, { method: "POST", body: JSON.stringify({ version: 0, transition: "accept", idempotencyKey: "stale", fields: { ownerUser: supplyUser } }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: supplyUser }, params: { id }
  });
  const payload = await stale.json();
  assert.equal(stale.status, 409);
  assert.equal(payload.error.code, "COLLABORATION_VERSION_CONFLICT");
  assert.equal(db.activities.size, 1);
});

test("item patch archives without physical deletion and validates methods", async () => {
  const db = createCollaborationD1Mock();
  const created = await createItem(db);
  const id = created.payload.item.id;
  const archived = await itemRoute({
    request: new Request(`https://flow.example.com/api/platform/v1/collaboration-items/${id}`, { method: "PATCH", body: JSON.stringify({ version: 1, patch: { archived: true }, reason: "来源任务已经撤销" }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: productUser }, params: { id }
  });
  const payload = await archived.json();
  assert.equal(archived.status, 200);
  assert.ok(payload.item.archivedAt);
  assert.equal(db.items.size, 1);

  const deleted = await itemRoute({ request: new Request(`https://flow.example.com/api/platform/v1/collaboration-items/${id}`, { method: "DELETE" }), env: { PRODUCT_FLOW_DB: db }, data: { session: executive }, params: { id } });
  assert.equal(deleted.status, 405);
});
