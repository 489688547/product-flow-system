import assert from "node:assert/strict";
import test from "node:test";
import { CORE_DATA_STANDARDS } from "../src/domain/dataStandards.js";
import { summarizeDataCenterSales } from "../src/domain/dataCenter.js";
import { compileDataStandard } from "../functions/api/platform/v1/_shared/dataStandardsCompiler.js";
import { calculateMetricRange, calculateMetricSet } from "../functions/api/platform/v1/_shared/dataStandardsCalculation.js";
import { onRequest as previewRequest } from "../functions/api/platform/v1/data-standards/preview.js";

function versionFor(definition, overrides = {}) {
  return {
    definitionId: definition.id,
    version: 1,
    name: definition.name,
    category: definition.category,
    ownerDepartment: definition.ownerDepartment,
    unit: definition.unit,
    period: definition.period,
    effectiveFrom: "2026-01-01",
    displayFormula: definition.displayFormula,
    formulaAst: definition.formulaAst,
    sourceFields: [],
    dependencies: [],
    executable: definition.executable,
    coverageStatus: definition.coverageStatus,
    ...overrides
  };
}

function governedDefinitions() {
  return CORE_DATA_STANDARDS.map(definition => ({
    ...definition,
    currentVersion: 1,
    versions: [versionFor(definition)]
  }));
}

function calculationDb(values = {}, { rowCount = 3, cutoff = "2026-07-19" } = {}) {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      return {
        values: [],
        bind(...bound) { this.values = bound; return this; },
        async first() {
          queries.push({ sql: normalized, values: this.values });
          const match = normalized.match(/sum\(([a-z_]+)\) as aggregate_value/);
          if (!match) return null;
          return { aggregate_value: values[match[1]] ?? null, row_count: rowCount, data_cutoff_at: cutoff };
        }
      };
    }
  };
}

function storageDb(values = {}) {
  const definitions = governedDefinitions();
  const audits = [];
  const db = {
    audits,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...bound) { statement.values = bound; return statement; },
        async run() {
          if (normalized.startsWith("create table") || normalized.startsWith("create index")) return { meta: { changes: 0 } };
          if (normalized.startsWith("insert into data_metric_audit_logs")) {
            audits.push(statement.values);
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected run SQL: ${sql}`);
        },
        async first() {
          if (normalized.includes("sum(")) {
            const match = normalized.match(/sum\(([a-z_]+)\) as aggregate_value/);
            return { aggregate_value: values[match?.[1]] ?? null, row_count: 3, data_cutoff_at: "2026-07-19" };
          }
          if (normalized.includes("from data_metric_definitions") && normalized.includes("where id = ?")) {
            const definition = definitions.find(item => item.id === statement.values[0]);
            return definition ? {
              id: definition.id, metric_code: definition.metricCode, category: definition.category, name: definition.name,
              owner_department: definition.ownerDepartment, unit: definition.unit, period: definition.period,
              current_version: 1, status: "active", created_at: "2026-01-01", created_by: "seed",
              updated_at: "2026-01-01", updated_by: "seed"
            } : null;
          }
          return null;
        },
        async all() {
          if (normalized.includes("from data_metric_definitions") && !normalized.includes("join")) {
            return { results: definitions.map(definition => ({
              id: definition.id, metric_code: definition.metricCode, category: definition.category, name: definition.name,
              owner_department: definition.ownerDepartment, unit: definition.unit, period: definition.period,
              current_version: 1, status: "active", created_at: "2026-01-01", created_by: "seed",
              updated_at: "2026-01-01", updated_by: "seed"
            })) };
          }
          if (normalized.includes("from data_metric_definition_versions")) {
            const definition = definitions.find(item => item.id === statement.values[0]);
            return { results: definition ? [versionFor(definition)].map(version => ({
              definition_id: definition.id, version: version.version, name: version.name, category: version.category,
              owner_department: version.ownerDepartment, unit: version.unit, period: version.period,
              effective_from: version.effectiveFrom, display_formula: version.displayFormula,
              formula_ast: JSON.stringify(version.formulaAst), source_fields: "[]", dependencies: "[]",
              executable: version.executable ? 1 : 0, coverage_status: version.coverageStatus,
              created_at: "2026-01-01", created_by: "seed"
            })) : [] };
          }
          if (normalized.includes("from data_metric_audit_logs") || normalized.includes("from data_metric_results")) return { results: [] };
          return { results: [] };
        }
      };
      return statement;
    }
  };
  return db;
}

test("compiler maps only registered sales fields into a safe execution plan", () => {
  const definition = CORE_DATA_STANDARDS.find(item => item.metricCode === "sales.net_sales");
  const plan = compileDataStandard(versionFor(definition));
  assert.equal(plan.type, "aggregate");
  assert.equal(plan.source, "product_sales_daily");
  assert.equal(plan.column, "net_sales");
  assert.deepEqual(plan.operationalExclusions, ["", "其它", "其他", "未知", "未知平台"]);
  assert.throws(
    () => compileDataStandard({ ...versionFor(definition), formulaAst: { type: "field", field: "sales.toString" } }),
    error => error.code === "DATA_STANDARD_FIELD_UNKNOWN"
  );
});

test("the five governed sales metrics calculate from create-time daily facts", async () => {
  const db = calculationDb({ net_sales: 800, gross_profit: 240, qty: 10, refund: 200, sales: 1000 });
  const results = await calculateMetricSet({ db, definitions: governedDefinitions(), from: "2026-07-01", to: "2026-07-19" });
  const values = Object.fromEntries(results.map(result => [result.metricCode, result.value]));
  assert.equal(values["sales.net_sales"], 800);
  assert.equal(values["sales.gross_profit"], 240);
  assert.equal(values["sales.quantity"], 10);
  assert.equal(values["sales.refund_rate"], 20);
  assert.equal(values["sales.gross_margin_rate"], 30);
  assert.equal(results.find(result => result.metricCode === "sales.net_sales").coverageRate, 1);
  assert.ok(db.queries.every(query => query.values.slice(0, 2).join("|") === "2026-07-01|2026-07-19"));
  assert.ok(db.queries.every(query => query.sql.includes("not in ('', '其它', '其他', '未知', '未知平台')")));
});

test("governed sales results reconcile with the legacy fact summary except intentional null ratios", async () => {
  const rows = [
    { date: "2026-07-01", platform: "抖音", qty: 7, sales: 700, netSales: 600, grossProfit: 180, refund: 100, cost: 420 },
    { date: "2026-07-02", platform: "天猫", qty: 3, sales: 300, netSales: 200, grossProfit: 60, refund: 100, cost: 140 },
    { date: "2026-07-02", platform: "其它", qty: 99, sales: 9999, netSales: 9999, grossProfit: 9999, refund: 0, cost: 0 }
  ];
  const legacy = summarizeDataCenterSales(rows, { from: "2026-07-01", to: "2026-07-02" });
  const governed = await calculateMetricSet({
    db: calculationDb({ net_sales: 800, gross_profit: 240, qty: 10, refund: 200, sales: 1000 }),
    definitions: governedDefinitions(),
    from: "2026-07-01",
    to: "2026-07-02"
  });
  const values = Object.fromEntries(governed.map(result => [result.metricCode, result.value]));
  assert.equal(values["sales.net_sales"], legacy.totals.netSales);
  assert.equal(values["sales.quantity"], legacy.totals.qty);
  assert.equal(values["sales.gross_profit"], legacy.totals.grossProfit);
  assert.equal(values["sales.refund_rate"], legacy.totals.refundRate);
  assert.equal(values["sales.gross_margin_rate"], legacy.totals.grossMarginRate);

  const legacyZero = summarizeDataCenterSales([{ date: "2026-07-01", platform: "抖音", sales: 0, netSales: 0, refund: 10, grossProfit: 10 }], { from: "2026-07-01", to: "2026-07-01" });
  const governedZero = await calculateMetricSet({ db: calculationDb({ sales: 0, net_sales: 0, refund: 10, gross_profit: 10 }), definitions: governedDefinitions(), from: "2026-07-01", to: "2026-07-01" });
  assert.equal(legacyZero.totals.refundRate, 0, "legacy summary collapsed a zero denominator to zero");
  assert.equal(governedZero.find(result => result.metricCode === "sales.refund_rate").value, null, "governed result preserves an invalid ratio as missing");
});

test("zero denominators and missing rows stay null instead of becoming zero", async () => {
  const definitions = governedDefinitions();
  const zeroDb = calculationDb({ refund: 20, sales: 0, gross_profit: 30, net_sales: 0 });
  const zeroResults = await calculateMetricSet({ db: zeroDb, definitions, from: "2026-07-01", to: "2026-07-19" });
  assert.equal(zeroResults.find(result => result.metricCode === "sales.refund_rate").value, null);
  assert.equal(zeroResults.find(result => result.metricCode === "sales.refund_rate").status, "incomplete");

  const emptyDb = calculationDb({}, { rowCount: 0, cutoff: null });
  const netSales = definitions.find(item => item.metricCode === "sales.net_sales");
  const empty = await calculateMetricRange({ db: emptyDb, definition: netSales, version: netSales.versions[0], from: "2026-07-01", to: "2026-07-19" });
  assert.equal(empty.value, null);
  assert.equal(empty.coverageRate, 0);
  assert.equal(empty.status, "incomplete");
});

test("historical ranges select the version effective at the period end", async () => {
  const base = CORE_DATA_STANDARDS.find(item => item.metricCode === "sales.net_sales");
  const definition = {
    ...base,
    versions: [
      versionFor(base, { version: 1, effectiveFrom: "2026-01-01" }),
      versionFor(base, { version: 2, effectiveFrom: "2026-08-01" })
    ]
  };
  const [result] = await calculateMetricSet({ db: calculationDb({ net_sales: 50 }), definitions: [definition], from: "2026-07-01", to: "2026-07-31" });
  assert.equal(result.definitionVersion, 1);
});

test("uncovered goods-flow standards return an explicit non-simulated result", async () => {
  const definition = governedDefinitions().find(item => item.metricCode === "goods_flow.inventory_cash");
  const result = await calculateMetricRange({ db: calculationDb({}), definition, version: definition.versions[0], from: "2026-07-01", to: "2026-07-19" });
  assert.equal(result.value, null);
  assert.equal(result.status, "data_not_covered");
  assert.equal(result.reasonCode, "DATA_NOT_COVERED");
  assert.equal(result.estimated, false);
});

test("preview enforces publish permission, 31-day range, shared calculation and audit", async () => {
  const db = storageDb({ net_sales: 800 });
  const definition = CORE_DATA_STANDARDS.find(item => item.metricCode === "sales.net_sales");
  const body = {
    metricCode: definition.metricCode,
    name: definition.name,
    category: definition.category,
    ownerDepartment: definition.ownerDepartment,
    unit: definition.unit,
    period: definition.period,
    effectiveFrom: "2026-08-01",
    displayFormula: definition.displayFormula,
    formulaAst: definition.formulaAst,
    sourceFields: ["sales.net_sales"],
    from: "2026-07-01",
    to: "2026-07-19"
  };
  const response = await previewRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-standards/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { userId: "finance-1", name: "财务", department: "财务部" } }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.result.value, 800);
  assert.equal(payload.result.version, 1);
  assert.equal(db.audits.length, 1);

  const forbidden = await previewRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-standards/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { userId: "ops-1", name: "运营", department: "运营部" } }
  });
  assert.equal(forbidden.status, 403);

  const tooWide = await previewRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-standards/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, to: "2026-08-02" }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { userId: "finance-1", name: "财务", department: "财务部" } }
  });
  assert.equal(tooWide.status, 400);
  assert.equal(db.audits.length, 3);
});
