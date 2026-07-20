import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as onInsightsRequest } from "../functions/api/platform/v1/user-insights.js";
import { onRequest as onCategoryMappingsRequest } from "../functions/api/platform/v1/user-insights/category-mappings.js";
import { onRequest as onRulesRequest } from "../functions/api/platform/v1/user-insights/rules.js";
import { onRequest as onCompetitorsRequest } from "../functions/api/platform/v1/user-insights/competitors.js";
import { onRequest as onCollectorRequest } from "../functions/api/platform/v1/user-insights/collector.js";
import { onRequest as onIngestRequest } from "../functions/api/platform/v1/user-insights/ingest.js";

const TABLES = [
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

function tableFromSql(sql) {
  return TABLES.find(table => new RegExp(`(?:from|into|update)\\s+${table}\\b`, "i").test(sql));
}

function createD1Mock() {
  const tables = Object.fromEntries(TABLES.map(table => [table, new Map()]));
  return {
    tables,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async all() {
          const table = tableFromSql(sql);
          const rows = table ? [...tables[table].values()] : [];
          return { results: rows };
        },
        async first() {
          const table = tableFromSql(sql);
          if (!table) return null;
          if (/token_hash/i.test(sql)) return [...tables[table].values()].find(row => row.token_hash === statement.values[0] && row.status === "active") || null;
          return tables[table].get(statement.values[0]) || null;
        },
        async run() {
          const table = tableFromSql(sql);
          if (!table) return { success: true };
          if (/insert/i.test(sql)) {
            if (table === "user_insight_runner_tokens") {
              const [id, tokenHash, name, allowedScope, status, createdAt, createdBy] = statement.values;
              tables[table].set(id, { id, token_hash: tokenHash, name, allowed_scope: allowedScope, status, created_at: createdAt, created_by: createdBy, last_seen_at: "" });
            } else if (table === "user_insight_meta") {
              tables[table].set(statement.values[0], { key: statement.values[0], value: statement.values[1] });
            } else {
              const [id, payload, version, updatedAt, updatedBy] = statement.values;
              tables[table].set(id, { id, payload, version, updated_at: updatedAt, updated_by: updatedBy });
            }
          }
          if (/update user_insight_runner_tokens/i.test(sql)) {
            const [lastSeenAt, id] = statement.values;
            const current = tables[table].get(id);
            if (current) tables[table].set(id, { ...current, last_seen_at: lastSeenAt });
          }
          return { success: true };
        }
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(item => item.run())); }
  };
}

const executive = { name: "周总", userId: "u-exec", role: "executive", department: "总经办" };
const product = { name: "产品负责人", userId: "u-product", role: "member", department: "产品部" };
const operations = { name: "运营主管", userId: "u-ops", role: "member", department: "运营部" };

function jsonRequest(url, method, body, headers = {}) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test("user insight query requires an allowed session and D1", async () => {
  const missing = await onInsightsRequest({ request: new Request("https://flow.example.com/api/platform/v1/user-insights"), env: {}, data: {} });
  assert.equal(missing.status, 401);
  const forbidden = await onInsightsRequest({
    request: new Request("https://flow.example.com/api/platform/v1/user-insights"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "访客", department: "品牌部" } }
  });
  assert.equal(forbidden.status, 403);
  const unavailable = await onInsightsRequest({ request: new Request("https://flow.example.com/api/platform/v1/user-insights"), env: {}, data: { session: executive } });
  assert.equal(unavailable.status, 501);
});

test("category mappings require product or operations confirmation and preserve audit identity", async () => {
  const db = createD1Mock();
  const response = await onCategoryMappingsRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/category-mappings", "POST", {
      mapping: { id: "mapping-1", platform: "抖音", categoryId: "cat-1", categoryName: "宠物用品", status: "suggested" },
      action: "confirm"
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: product }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mapping.status, "confirmed");
  assert.equal(payload.mapping.confirmedBy, "产品负责人");
  assert.equal(db.tables.user_insight_audit_logs.size, 1);
});

test("rule ownership is app scoped and copied rules never overwrite their source", async () => {
  const db = createD1Mock();
  const create = await onRulesRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/rules", "POST", {
      rule: { id: "product-rule", consumerAppId: "product-flow", ownerDepartment: "产品部", platform: "抖音", name: "产品竞品规则", version: 1 }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: product }
  });
  assert.equal(create.status, 200);

  const denied = await onRulesRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/rules", "POST", {
      rule: { id: "stolen", consumerAppId: "product-flow", ownerDepartment: "产品部", platform: "抖音", name: "越权规则" }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: operations }
  });
  assert.equal(denied.status, 403);

  const copied = await onRulesRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/rules", "POST", {
      action: "copy",
      sourceRuleId: "product-rule",
      target: { id: "ops-rule", consumerAppId: "ecommerce-operations", ownerDepartment: "运营部" }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: operations }
  });
  const payload = await copied.json();
  assert.equal(copied.status, 200);
  assert.equal(payload.rule.id, "ops-rule");
  assert.equal(payload.rule.sourceRuleId, "product-rule");
  assert.equal(JSON.parse(db.tables.user_insight_rules.get("product-rule").payload).consumerAppId, "product-flow");

  const published = await onRulesRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/rules", "POST", {
      action: "publish",
      expectedVersion: 1,
      rule: { id: "product-rule", consumerAppId: "product-flow", ownerDepartment: "产品部", platform: "抖音", name: "产品竞品规则", competitorConditions: [{ field: "salesVolume", operator: "gte", value: 1000 }] }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: product }
  });
  assert.equal((await published.json()).rule.status, "published");

  const query = await onInsightsRequest({
    request: new Request("https://flow.example.com/api/platform/v1/user-insights?platform=%E6%8A%96%E9%9F%B3"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: product }
  });
  const queried = await query.json();
  assert.equal(queried.data.ruleHistory.some(item => item.action === "publish_rule" && item.version === 2), true);
});

test("competitor candidates need a human reason before becoming core", async () => {
  const db = createD1Mock();
  db.tables.user_insight_competitors.set("competitor-1", {
    id: "competitor-1",
    payload: JSON.stringify({ id: "competitor-1", status: "candidate", ownerDepartment: "运营部", consumerAppId: "ecommerce-operations" }),
    version: 1,
    updated_at: "",
    updated_by: ""
  });
  const missingReason = await onCompetitorsRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/competitors", "PATCH", { id: "competitor-1", status: "core" }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: operations }
  });
  assert.equal(missingReason.status, 400);
  const confirmed = await onCompetitorsRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/competitors", "PATCH", { id: "competitor-1", status: "core", reason: "主卖款与用户重合" }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: operations }
  });
  const payload = await confirmed.json();
  assert.equal(confirmed.status, 200);
  assert.equal(payload.competitor.status, "core");
  assert.equal(payload.competitor.confirmedBy, "运营主管");
});

test("collector tokens are returned once, stored as hashes and limited to confirmed mappings", async () => {
  const db = createD1Mock();
  const register = await onCollectorRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/collector", "POST", {
      action: "register",
      name: "公司 Mac 采集器",
      allowedScope: { platforms: ["抖音"], shopIds: ["shop-1"] }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const registration = await register.json();
  assert.equal(register.status, 201);
  assert.match(registration.token, /^uic_/);
  const stored = [...db.tables.user_insight_runner_tokens.values()][0];
  assert.notEqual(stored.token_hash, registration.token);
  assert.doesNotMatch(JSON.stringify(stored), /uic_/);

  db.tables.user_insight_category_mappings.set("mapping-1", {
    id: "mapping-1",
    payload: JSON.stringify({ id: "mapping-1", status: "confirmed", platform: "抖音", shopId: "shop-1", categoryId: "cat-1" }),
    version: 1,
    updated_at: "",
    updated_by: ""
  });
  const tasks = await onCollectorRequest({
    request: new Request("https://flow.example.com/api/platform/v1/user-insights/collector", { headers: { authorization: `Bearer ${registration.token}` } }),
    env: { PRODUCT_FLOW_DB: db },
    data: {}
  });
  const taskPayload = await tasks.json();
  assert.equal(tasks.status, 200);
  assert.equal(taskPayload.tasks.length, 1);
  assert.equal(taskPayload.tasks[0].categoryId, "cat-1");
});

test("ingest is idempotent, rejects unconfirmed ranges and never stores browser secrets", async () => {
  const db = createD1Mock();
  const register = await onCollectorRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/collector", "POST", {
      action: "register",
      name: "公司 Mac 采集器",
      allowedScope: { platforms: ["抖音"], shopIds: ["shop-1"] }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const { token } = await register.json();
  db.tables.user_insight_category_mappings.set("mapping-1", {
    id: "mapping-1",
    payload: JSON.stringify({ id: "mapping-1", status: "confirmed", platform: "抖音", shopId: "shop-1", categoryId: "cat-1" }),
    version: 1,
    updated_at: "",
    updated_by: ""
  });
  const batch = {
    action: "complete",
    idempotencyKey: "抖音:shop-1:cat-1:audience:2026-07-19:v1:hash-1",
    run: { id: "run-1", platform: "抖音", shopId: "shop-1", categoryId: "cat-1", dimension: "audience", status: "healthy" },
    snapshot: { id: "snapshot-1", platform: "抖音", shopId: "shop-1", categoryId: "cat-1", dimension: "audience", coverage: 1, metrics: { audienceCount: 100 }, cookie: "secret", rawHtml: "secret" },
    entities: [{ id: "entity-1", platform: "抖音", dimension: "audience", metrics: { share: 0.4 }, authorization: "secret" }]
  };
  const first = await onIngestRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/ingest", "POST", batch, { authorization: `Bearer ${token}` }),
    env: { PRODUCT_FLOW_DB: db }, data: {}
  });
  assert.equal(first.status, 200);
  const second = await onIngestRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/ingest", "POST", batch, { authorization: `Bearer ${token}` }),
    env: { PRODUCT_FLOW_DB: db }, data: {}
  });
  const duplicate = await second.json();
  assert.equal(second.status, 200);
  assert.equal(duplicate.duplicate, true);
  assert.equal(db.tables.user_insight_snapshots.size, 1);
  assert.doesNotMatch(db.tables.user_insight_snapshots.get("snapshot-1").payload, /cookie|rawHtml|secret/i);

  const unconfirmed = await onIngestRequest({
    request: jsonRequest("https://flow.example.com/api/platform/v1/user-insights/ingest", "POST", {
      ...batch,
      idempotencyKey: "new",
      run: { ...batch.run, categoryId: "cat-unconfirmed" },
      snapshot: { ...batch.snapshot, id: "snapshot-2", categoryId: "cat-unconfirmed" }
    }, { authorization: `Bearer ${token}` }),
    env: { PRODUCT_FLOW_DB: db }, data: {}
  });
  assert.equal(unconfirmed.status, 403);
});
