import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as onDataCenterRequest } from "../functions/api/data-center.js";
import { onRequest as onSalesRequest } from "../functions/api/data-center/sales.js";
import { normalizeDataCenterState } from "../src/domain/dataCenter.js";

function createD1Mock() {
  const records = new Map();
  const meta = new Map();
  const sales = [
    { code: "690000000001", date: "2026-07-16", platform: "抖音", qty: 2, sales: 120, net_sales: 110, gross_profit: 55, refund: 10, cost: 55, pre_ship_refund: 4, post_ship_refund: 6 },
    { code: "690000000002", date: "2026-07-17", platform: "天猫", qty: 1, sales: 80, net_sales: 75, gross_profit: 30, refund: 5, cost: 45, pre_ship_refund: 0, post_ship_refund: 5 },
    { code: "690000000003", date: "2026-07-17", platform: "其它", qty: 4, sales: 40, net_sales: 35, gross_profit: 10, refund: 5, cost: 25, pre_ship_refund: 5, post_ship_refund: 0 }
  ];
  return {
    records,
    meta,
    prepare(sql) {
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
              data_metric_definitions: "metricDefinitions",
              data_quality_issues: "qualityIssues",
              data_app_subscriptions: "subscriptions",
              data_audit_logs: "auditLogs"
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
          return null;
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}

const executive = { name: "周总", userId: "u-1", role: "executive", department: "总经办" };

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
});

test("data center sales validates date range and permissions", async () => {
  const badRange = await onSalesRequest({
    request: new Request("https://flow.example.com/api/data-center/sales?from=2026-07-18&to=2026-07-17"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: executive }
  });
  assert.equal(badRange.status, 400);

  const forbidden = await onSalesRequest({
    request: new Request("https://flow.example.com/api/data-center/sales?from=2026-07-01&to=2026-07-17"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "访客", department: "品牌部" } }
  });
  assert.equal(forbidden.status, 403);
});
