import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as onDataCenterRequest } from "../functions/api/data-center.js";
import { onRequest as onSalesRequest } from "../functions/api/data-center/sales.js";
import { normalizeDataCenterState } from "../src/domain/dataCenter.js";

function createD1Mock() {
  const records = new Map();
  const meta = new Map();
  const batchSizes = [];
  const sqlLog = [];
  const sales = [
    { code: "690000000001", date: "2026-07-16", platform: "抖音", qty: 2, sales: 120, net_sales: 110, gross_profit: 55, refund: 10, cost: 55, pre_ship_refund: 4, post_ship_refund: 6 },
    { code: "690000000002", date: "2026-07-17", platform: "天猫", qty: 1, sales: 80, net_sales: 75, gross_profit: 30, refund: 5, cost: 45, pre_ship_refund: 0, post_ship_refund: 5 },
    { code: "690000000003", date: "2026-07-17", platform: "其它", qty: 4, sales: 40, net_sales: 35, gross_profit: 10, refund: 5, cost: 25, pre_ship_refund: 5, post_ship_refund: 0 }
  ];
  return {
    records,
    meta,
    batchSizes,
    sqlLog,
    prepare(sql) {
      sqlLog.push(sql.replace(/\s+/g, " ").trim());
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/delete from data_\w+ where entity_type/i.test(sql)) {
            const [entityType] = statement.values;
            [...records.keys()].filter(key => key.startsWith(`${entityType}:`)).forEach(key => records.delete(key));
          } else if (/insert into data_\w+ \(entity_type/i.test(sql)) {
            const [entityType, id, payload, updatedAt, updatedBy] = statement.values;
            records.set(`${entityType}:${id}`, { entity_type: entityType, id, payload, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/insert into data_center_meta/i.test(sql)) {
            const [key, value] = statement.values;
            meta.set(key, value);
          }
          return { success: true };
        },
        async all() {
          if (/select entity_type/i.test(sql)) {
            const tableToCollection = {
              data_sources: "sources",
              data_runners: "runners",
              data_sync_runs: "syncRuns",
              data_source_files: "sourceFiles",
              data_dimension_mappings: "mappings",
              data_metric_definitions_legacy: "metricDefinitions",
              data_quality_issues: "qualityIssues",
              data_app_subscriptions: "subscriptions",
              data_audit_logs: "auditLogs",
              data_ai_providers: "aiProviders",
              data_ai_policies: "aiDataPolicies"
            };
            const table = Object.keys(tableToCollection).find(name => new RegExp(`from ${name}`, "i").test(sql));
            const collection = tableToCollection[table];
            return { results: [...records.values()].filter(row => row.entity_type === collection) };
          }
          if (/from product_sales_daily/i.test(sql)) {
            const [from, to] = statement.values;
            return { results: sales.filter(row => row.date >= from && row.date <= to && !["其它", "其他", "未知", "未知平台", ""].includes(row.platform)) };
          }
          return { results: [] };
        },
        async first() {
          if (/from data_center_meta/i.test(sql)) return meta.has(statement.values[0]) ? { value: meta.get(statement.values[0]) } : null;
          if (/from product_sales_meta/i.test(sql)) return { payload: JSON.stringify({ imports: [{ importedAt: "2026-07-18T00:10:00.000Z" }], titles: {} }) };
          if (/max\(date\)[\s\S]*from product_sales_daily/i.test(sql)) return { latest_data_date: sales.reduce((latest, row) => row.date > latest ? row.date : latest, "") };
          return null;
        }
      };
      return statement;
    },
    async batch(statements) {
      batchSizes.push(statements.length);
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}

const executive = { name: "周总", userId: "u-1", role: "executive", department: "总经办" };

test("executive role can view data center with multi-department organization data", async () => {
  const response = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { ...executive, department: "总经办 / 运营部 / 品牌部" } }
  });
  assert.equal(response.status, 200);
});

test("executive role can read sales with multi-department organization data", async () => {
  const response = await onSalesRequest({
    request: new Request("https://flow.example.com/api/data-center/sales?from=2026-07-01&to=2026-07-20"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { ...executive, department: "总经办 / 运营部 / 品牌部" } }
  });
  assert.equal(response.status, 200);
});

test("data center API requires a session, allowed department and D1", async () => {
  const missingSession = await onDataCenterRequest({ request: new Request("https://flow.example.com/api/data-center"), env: {}, data: {} });
  assert.equal(missingSession.status, 401);

  const forbidden = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "品牌同事", department: "品牌部" } }
  });
  assert.equal(forbidden.status, 403);

  const missingD1 = await onDataCenterRequest({ request: new Request("https://flow.example.com/api/data-center"), env: {}, data: { session: executive } });
  assert.equal(missingD1.status, 501);
});

test("data center metadata round-trips by collection without credentials", async () => {
  const db = createD1Mock();
  const state = normalizeDataCenterState({
    sources: [{ id: "douyin-shop", name: "抖音旗舰店", platform: "抖音", consoleUrl: "https://fxg.jinritemai.com", password: "must-not-persist", status: "healthy" }],
    qualityIssues: [{ id: "quality-1", title: "一个商品未映射", status: "open" }]
  });
  const post = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center", { method: "POST", body: JSON.stringify({ state }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  assert.equal(post.status, 200);
  assert.ok(db.records.has("sources:douyin-shop"));
  assert.doesNotMatch(db.records.get("sources:douyin-shop").payload, /must-not-persist|password/i);

  const get = await onDataCenterRequest({ request: new Request("https://flow.example.com/api/data-center"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  const payload = await get.json();
  assert.equal(get.status, 200);
  assert.equal(payload.state.sources[0].name, "抖音旗舰店");
  assert.equal(payload.state.qualityIssues[0].title, "一个商品未映射");
});

test("data center metadata rejects readonly writes", async () => {
  const response = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center", { method: "POST", body: JSON.stringify({ state: normalizeDataCenterState() }) }),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "只读访客", role: "readonly", department: "总经办" } }
  });
  assert.equal(response.status, 403);
});

test("fresh data center storage keeps default metrics and chunks metadata writes", async () => {
  const db = createD1Mock();
  const fresh = await onDataCenterRequest({ request: new Request("https://flow.example.com/api/data-center"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  const freshPayload = await fresh.json();
  assert.equal(fresh.status, 200);
  assert.ok(freshPayload.state.metricDefinitions.some(metric => metric.metricCode === "sales.net_sales"));

  const sources = Array.from({ length: 120 }, (_, index) => ({ id: `source-${index}`, name: `来源 ${index}` }));
  const post = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center", { method: "POST", body: JSON.stringify({ state: normalizeDataCenterState({ sources }) }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  assert.equal(post.status, 200);
  assert.ok(Math.max(...db.batchSizes) <= 50);
});

test("generic data center writes never delete or overwrite governed or legacy metric definitions", async () => {
  const db = createD1Mock();
  db.records.set("metricDefinitions:legacy-net-sales", {
    entity_type: "metricDefinitions",
    id: "legacy-net-sales",
    payload: JSON.stringify({ id: "legacy-net-sales", metricCode: "sales.net_sales", name: "迁移前净销售额" }),
    updated_at: "2026-07-18T00:00:00.000Z",
    updated_by: "legacy-user"
  });
  const state = normalizeDataCenterState({
    metricDefinitions: [{ id: "attacker", metricCode: "sales.replaced", name: "不应落库" }]
  });
  const post = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center", { method: "POST", body: JSON.stringify({ state }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  assert.equal(post.status, 200);
  assert.equal(db.records.has("metricDefinitions:legacy-net-sales"), true);
  assert.equal(db.records.has("metricDefinitions:attacker"), false);
  assert.equal(db.sqlLog.some(sql => /(?:delete from|insert into) data_metric_definitions(?:_legacy)?/i.test(sql)), false);

  const get = await onDataCenterRequest({ request: new Request("https://flow.example.com/api/data-center"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  assert.equal((await get.json()).state.metricDefinitions[0].name, "迁移前净销售额");
});

test("data center sales uses creation-date range and excludes Other", async () => {
  const response = await onSalesRequest({
    request: new Request("https://flow.example.com/api/data-center/sales?from=2026-07-01&to=2026-07-17"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: executive }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.rows.length, 2);
  assert.deepEqual(payload.rows.map(row => row.platform), ["抖音", "天猫"]);
  assert.equal(payload.meta.timeBasis, "create_time");
  assert.equal(payload.meta.timezone, "Asia/Shanghai");
  assert.equal(payload.meta.excludeOther, true);
  assert.equal(payload.meta.lastSuccessfulSyncAt, "2026-07-18T00:10:00.000Z");
  assert.equal(payload.meta.latestDataDate, "2026-07-17");
});

test("data center sales validates date range and permissions", async () => {
  const badRange = await onSalesRequest({
    request: new Request("https://flow.example.com/api/data-center/sales?from=2026-07-18&to=2026-07-17"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: executive }
  });
  assert.equal(badRange.status, 400);

  const impossibleDate = await onSalesRequest({
    request: new Request("https://flow.example.com/api/data-center/sales?from=2026-02-30&to=2026-03-05"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: executive }
  });
  assert.equal(impossibleDate.status, 400);

  const forbidden = await onSalesRequest({
    request: new Request("https://flow.example.com/api/data-center/sales?from=2026-07-01&to=2026-07-17"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "访客", department: "品牌部" } }
  });
  assert.equal(forbidden.status, 403);
});

test("data center state includes protected AI metadata and blocks operations overrides", async () => {
  const db = createD1Mock();
  const initial = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const initialPayload = await initial.json();
  assert.equal(initialPayload.state.aiProviders[0].providerId, "lingsuan-responses");
  assert.equal(initialPayload.state.aiDataPolicies.find(item => item.domainId === "finance").providerTransfer["lingsuan-responses"], "blocked");

  const attempted = normalizeDataCenterState({
    ...initialPayload.state,
    aiProviders: [{ ...initialPayload.state.aiProviders[0], model: "untrusted-model", enabled: true }],
    aiDataPolicies: initialPayload.state.aiDataPolicies.map(item => item.domainId === "finance"
      ? { ...item, providerTransfer: { "lingsuan-responses": "allowed" } }
      : item)
  });
  const saved = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center", {
      method: "POST",
      body: JSON.stringify({ state: attempted })
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { name: "运营", department: "运营部", role: "operator" } }
  });
  assert.equal(saved.status, 200);

  const reloaded = await onDataCenterRequest({
    request: new Request("https://flow.example.com/api/data-center"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const reloadedPayload = await reloaded.json();
  assert.equal(reloadedPayload.state.aiProviders[0].model, "gpt-5.6-sol");
  assert.equal(reloadedPayload.state.aiProviders[0].enabled, false);
  assert.equal(reloadedPayload.state.aiDataPolicies.find(item => item.domainId === "finance").providerTransfer["lingsuan-responses"], "blocked");
});
