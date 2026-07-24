import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as indexRoute } from "../functions/api/platform/v1/development-backlog/index.js";
import { onRequest as itemRoute } from "../functions/api/platform/v1/development-backlog/[id].js";
import { onRequest as actionRoute } from "../functions/api/platform/v1/development-backlog/[id]/actions.js";

function normalizeSql(sql = "") {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function createBacklogD1Mock({ fail = false } = {}) {
  const items = new Map();
  const events = new Map();
  let sequence = 0;
  return {
    items,
    events,
    prepare(sql) {
      const normalized = normalizeSql(sql);
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first() {
          if (fail) throw new Error("raw database detail");
          if (normalized.includes("max(sequence_no)")) return { next_sequence: sequence + 1 };
          if (normalized.includes("from development_backlog_items") && normalized.includes("where id = ?")) {
            return items.get(statement.values[0]) || null;
          }
          return null;
        },
        async all() {
          if (fail) throw new Error("raw database detail");
          if (normalized.includes("from development_backlog_events")) {
            return {
              results: [...events.values()]
                .filter(event => event.item_id === statement.values[0])
                .sort((left, right) => right.created_at.localeCompare(left.created_at))
            };
          }
          if (normalized.includes("from development_backlog_items")) {
            return { results: [...items.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at)) };
          }
          return { results: [] };
        },
        async run() {
          if (fail) throw new Error("raw database detail");
          if (normalized.startsWith("insert into development_backlog_items")) {
            const [
              sequenceNo, id, displayId, title, background, moduleId, priority, status,
              acceptanceCriteriaJson, scopePathsJson, dependencyIdsJson, sourceType,
              ownerUserId, ownerNameSnapshot, claimedBranch, pullRequestUrl,
              acceptanceEvidence, blockedReason, resumeCondition, version,
              createdBy, updatedBy, createdAt, updatedAt, completedAt, cancelledAt
            ] = statement.values;
            sequence = Math.max(sequence, Number(sequenceNo));
            items.set(id, {
              sequence_no: sequenceNo, id, display_id: displayId, title, background,
              module_id: moduleId, priority, status,
              acceptance_criteria_json: acceptanceCriteriaJson,
              scope_paths_json: scopePathsJson,
              dependency_ids_json: dependencyIdsJson,
              source_type: sourceType,
              owner_user_id: ownerUserId,
              owner_name_snapshot: ownerNameSnapshot,
              claimed_branch: claimedBranch,
              pull_request_url: pullRequestUrl,
              acceptance_evidence: acceptanceEvidence,
              blocked_reason: blockedReason,
              resume_condition: resumeCondition,
              version, created_by: createdBy, updated_by: updatedBy,
              created_at: createdAt, updated_at: updatedAt,
              completed_at: completedAt, cancelled_at: cancelledAt
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into development_backlog_events")) {
            const [id, itemId, action, fromStatus, toStatus, changedFieldsJson, actorUserId, actorNameSnapshot, branchSnapshot, evidenceSummary, createdAt] = statement.values;
            events.set(id, {
              id, item_id: itemId, action, from_status: fromStatus, to_status: toStatus,
              changed_fields_json: changedFieldsJson, actor_user_id: actorUserId,
              actor_name_snapshot: actorNameSnapshot, branch_snapshot: branchSnapshot,
              evidence_summary: evidenceSummary, created_at: createdAt
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update development_backlog_items")) {
            const [
              title, background, moduleId, priority, status, acceptanceCriteriaJson,
              scopePathsJson, dependencyIdsJson, ownerUserId, ownerNameSnapshot,
              claimedBranch, pullRequestUrl, acceptanceEvidence, blockedReason,
              resumeCondition, nextVersion, updatedBy, updatedAt, completedAt,
              cancelledAt, id, expectedVersion
            ] = statement.values;
            const current = items.get(id);
            if (!current || Number(current.version) !== Number(expectedVersion)) return { success: true, meta: { changes: 0 } };
            Object.assign(current, {
              title, background, module_id: moduleId, priority, status,
              acceptance_criteria_json: acceptanceCriteriaJson,
              scope_paths_json: scopePathsJson,
              dependency_ids_json: dependencyIdsJson,
              owner_user_id: ownerUserId,
              owner_name_snapshot: ownerNameSnapshot,
              claimed_branch: claimedBranch,
              pull_request_url: pullRequestUrl,
              acceptance_evidence: acceptanceEvidence,
              blocked_reason: blockedReason,
              resume_condition: resumeCondition,
              version: nextVersion, updated_by: updatedBy, updated_at: updatedAt,
              completed_at: completedAt, cancelled_at: cancelledAt
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    }
  };
}

const employee = { userId: "dev-1", name: "产品同事", department: "产品部", role: "employee" };
const executive = { userId: "exec-1", name: "总经办同事", department: "总经办", role: "executive" };
const validDraft = {
  title: "Chrome 扩展重载后自动接收任务",
  background: "扩展重载后恢复受控身份与任务领取。",
  moduleId: "data-acquisition",
  priority: "p1",
  acceptanceCriteria: ["扩展重载后能自动领取任务"],
  scopePaths: ["chrome-extension/company-data-collector/"],
  dependencyIds: [],
  sourceType: "manual"
};

function requestContext({
  route = "index",
  id = "",
  method = "GET",
  session = employee,
  db = createBacklogD1Mock(),
  body,
  query = ""
} = {}) {
  const suffix = route === "action" ? `/${id}/actions` : route === "item" ? `/${id}` : "";
  return {
    request: new Request(`https://flow.example.com/api/platform/v1/development-backlog${suffix}${query}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }),
    env: db ? { PRODUCT_FLOW_DB: db } : {},
    data: session ? { session } : {},
    params: { id }
  };
}

async function createItem(db, draft = validDraft) {
  const response = await indexRoute(requestContext({ method: "POST", session: executive, db, body: draft }));
  return { response, payload: await response.json() };
}

test("backlog API requires a session and control D1", async () => {
  const anonymous = await indexRoute(requestContext({ session: null }));
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "AUTH_SESSION_REQUIRED");

  const missingDb = await indexRoute(requestContext({ db: null }));
  assert.equal(missingDb.status, 503);
  assert.equal((await missingDb.json()).error.code, "BACKLOG_STORAGE_UNAVAILABLE");
});

test("all employees read but only executives create backlog items", async () => {
  const db = createBacklogD1Mock();
  const list = await indexRoute(requestContext({ db }));
  assert.equal(list.status, 200);

  const denied = await indexRoute(requestContext({ method: "POST", session: employee, db, body: validDraft }));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "BACKLOG_FORBIDDEN");

  const created = await createItem(db);
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.item.displayId, "DEV-000001");
  assert.equal(created.payload.item.status, "ready");
  assert.equal(db.events.size, 1);
});

test("list filters only when requested and returns summary plus pagination", async () => {
  const db = createBacklogD1Mock();
  await createItem(db);
  await createItem(db, { ...validDraft, title: "AI 模型设置", moduleId: "ai-platform", priority: "p2", scopePaths: ["src/features/data-center/AiModelWorkspace.jsx"] });
  const response = await indexRoute(requestContext({ db, query: "?moduleId=ai-platform&page=1&pageSize=20" }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.items.map(item => item.title), ["AI 模型设置"]);
  assert.equal(payload.summary.ready, 2);
  assert.deepEqual(payload.pagination, { page: 1, pageSize: 20, total: 1, totalPages: 1 });
});

test("claim records owner and stale versions are rejected", async () => {
  const db = createBacklogD1Mock();
  const created = await createItem(db);
  const id = created.payload.item.id;
  const claimed = await actionRoute(requestContext({
    route: "action",
    id,
    method: "POST",
    session: employee,
    db,
    body: { action: "claim", expectedVersion: 1, branch: "codex/development-backlog" }
  }));
  const claimedPayload = await claimed.json();
  assert.equal(claimed.status, 200);
  assert.equal(claimedPayload.item.ownerUserId, employee.userId);
  assert.equal(claimedPayload.item.version, 2);

  const stale = await actionRoute(requestContext({
    route: "action",
    id,
    method: "POST",
    session: employee,
    db,
    body: { action: "submit_review", expectedVersion: 1, acceptanceEvidence: "测试通过" }
  }));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "BACKLOG_VERSION_CONFLICT");
  assert.equal(db.events.size, 2);
});

test("overlapping active work blocks claim with safe conflict details", async () => {
  const db = createBacklogD1Mock();
  const first = await createItem(db);
  const second = await createItem(db, { ...validDraft, title: "扩展下载恢复", scopePaths: ["chrome-extension/company-data-collector/providers/"] });
  const response = await actionRoute(requestContext({
    route: "action",
    id: second.payload.item.id,
    method: "POST",
    session: employee,
    db,
    body: { action: "claim", expectedVersion: 1, branch: "codex/extension-download" }
  }));
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "BACKLOG_ACTIVE_CONFLICT");
  assert.equal(payload.error.details.conflicts[0].displayId, first.payload.item.displayId);
  assert.doesNotMatch(JSON.stringify(payload), /Users\/roger|cookie|credential/i);
});

test("detail includes append-only events and content edits are executive-only", async () => {
  const db = createBacklogD1Mock();
  const created = await createItem(db);
  const id = created.payload.item.id;
  const detail = await itemRoute(requestContext({ route: "item", id, db }));
  const detailPayload = await detail.json();
  assert.equal(detail.status, 200);
  assert.equal(detailPayload.events.length, 1);

  const denied = await itemRoute(requestContext({
    route: "item", id, method: "PATCH", session: employee, db,
    body: { expectedVersion: 1, patch: { priority: "p0" } }
  }));
  assert.equal(denied.status, 403);

  const updated = await itemRoute(requestContext({
    route: "item", id, method: "PATCH", session: executive, db,
    body: { expectedVersion: 1, patch: { priority: "p0" } }
  }));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).item.priority, "p0");
  assert.equal(db.events.size, 2);
});

test("unexpected storage failures return safe messages without raw details", async () => {
  const response = await indexRoute(requestContext({ db: createBacklogD1Mock({ fail: true }) }));
  const payload = await response.json();
  assert.equal(response.status, 500);
  assert.equal(payload.error.code, "BACKLOG_QUERY_FAILED");
  assert.equal(payload.error.retryable, true);
  assert.doesNotMatch(JSON.stringify(payload), /raw database detail/i);
});
