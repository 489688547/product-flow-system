import assert from "node:assert/strict";
import test from "node:test";
import { CORE_DATA_STANDARDS } from "../src/domain/dataStandards.js";
import { onRequest as recalculateRequest } from "../functions/api/platform/v1/data-standards/recalculate.js";
import { onRequest as resultsRequest } from "../functions/api/platform/v1/data-standards/results.js";

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function runtimeDb({ failAggregate = false } = {}) {
  const seed = CORE_DATA_STANDARDS.find(item => item.metricCode === "sales.net_sales");
  const definitions = new Map([[seed.id, {
    id: seed.id, metric_code: seed.metricCode, category: seed.category, name: seed.name,
    owner_department: seed.ownerDepartment, unit: seed.unit, period: seed.period,
    current_version: 1, status: "active", created_at: "2026-01-01", created_by: "seed",
    updated_at: "2026-01-01", updated_by: "seed"
  }]]);
  const versions = [{
    definition_id: seed.id, version: 1, name: seed.name, category: seed.category,
    owner_department: seed.ownerDepartment, unit: seed.unit, period: seed.period,
    effective_from: "2026-01-01", display_formula: seed.displayFormula,
    formula_ast: JSON.stringify(seed.formulaAst), source_fields: JSON.stringify(["sales.net_sales"]),
    dependencies: "[]", executable: 1, coverage_status: "COMPLETE", created_at: "2026-01-01", created_by: "seed"
  }];
  const runs = new Map();
  const results = new Map();
  const audits = [];
  const db = {
    runs, results, audits,
    prepare(sql) {
      const normalized = normalizeSql(sql);
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          if (normalized.startsWith("create table") || normalized.startsWith("create index")) return { meta: { changes: 0 } };
          if (normalized.startsWith("insert into data_metric_calculation_runs")) {
            const [id, key, definitionIds, from, to, targetVersion, status, progress, requestedBy, createdAt, updatedAt] = statement.values;
            if (![...runs.values()].some(run => run.idempotency_key === key)) {
              runs.set(id, { id, idempotency_key: key, definition_ids: definitionIds, range_start: from, range_end: to,
                target_version: targetVersion, status, progress, requested_by: requestedBy, error_code: null,
                created_at: createdAt, updated_at: updatedAt, completed_at: null });
            }
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_results")) {
            const [id, definitionId, definitionVersion, metricCode, from, to, dimensionsJson, value, unit,
              coverageRate, confidence, estimated, status, reason, cutoff, runId, isCurrent, createdAt] = statement.values;
            results.set(id, { id, definition_id: definitionId, definition_version: definitionVersion, metric_code: metricCode,
              period_start: from, period_end: to, dimensions_json: dimensionsJson, value, unit, coverage_rate: coverageRate,
              confidence, estimated, status, reason, data_cutoff_at: cutoff, calculation_run_id: runId,
              is_current: isCurrent, created_at: createdAt });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_results set is_current = 0")) {
            const [definitionId, from, to, dimensionsJson, runId] = statement.values;
            for (const [id, row] of results) {
              if (row.definition_id === definitionId && row.period_start === from && row.period_end === to
                && row.dimensions_json === dimensionsJson && row.calculation_run_id !== runId && row.is_current === 1) {
                results.set(id, { ...row, is_current: 0 });
              }
            }
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_results set is_current = 1")) {
            for (const [id, row] of results) if (row.calculation_run_id === statement.values[0]) results.set(id, { ...row, is_current: 1 });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_calculation_runs set status = 'succeeded'")) {
            const [updatedAt, completedAt, id] = statement.values;
            runs.set(id, { ...runs.get(id), status: "succeeded", progress: 100, error_code: null, updated_at: updatedAt, completed_at: completedAt });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_calculation_runs set status = 'failed'")) {
            const [errorCode, updatedAt, completedAt, id] = statement.values;
            runs.set(id, { ...runs.get(id), status: "failed", error_code: errorCode, updated_at: updatedAt, completed_at: completedAt });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_audit_logs")) {
            audits.push(statement.values);
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected run SQL: ${sql}`);
        },
        async first() {
          if (normalized.includes("max(date) as fact_watermark")) return { fact_watermark: "2026-07-19", fact_rows: 3 };
          if (normalized.includes("sum(net_sales) as aggregate_value")) {
            if (failAggregate) throw new Error("simulated calculation failure");
            return { aggregate_value: 800, row_count: 3, data_cutoff_at: "2026-07-19" };
          }
          if (normalized.includes("from data_metric_calculation_runs") && normalized.includes("idempotency_key = ?")) {
            return [...runs.values()].find(run => run.idempotency_key === statement.values[0]) || null;
          }
          if (normalized.includes("from data_metric_calculation_runs") && normalized.includes("where id = ?")) return runs.get(statement.values[0]) || null;
          if (normalized.includes("from data_metric_definitions") && normalized.includes("where id = ?")) return definitions.get(statement.values[0]) || null;
          return null;
        },
        async all() {
          if (normalized.includes("from data_metric_definitions") && !normalized.includes("join")) return { results: [...definitions.values()] };
          if (normalized.includes("from data_metric_definition_versions")) return { results: versions.filter(row => row.definition_id === statement.values[0]) };
          if (normalized.includes("from data_metric_audit_logs")) return { results: [] };
          if (normalized.includes("from data_metric_results")) {
            let rows = [...results.values()];
            let offset = 0;
            if (normalized.includes("is_current = 1")) rows = rows.filter(row => row.is_current === 1);
            if (normalized.includes("metric_code in")) {
              const inClause = normalized.match(/metric_code in \(([^)]+)\)/)?.[1] || "";
              const count = (inClause.match(/\?/g) || []).length;
              const codes = statement.values.slice(offset, offset + count);
              offset += count;
              rows = rows.filter(row => codes.includes(row.metric_code));
            }
            for (const [fragment, column, predicate] of [
              ["period_start = ?", "period_start", (a, b) => a === b],
              ["period_end = ?", "period_end", (a, b) => a === b],
              ["calculation_run_id = ?", "calculation_run_id", (a, b) => a === b]
            ]) {
              if (normalized.includes(fragment)) rows = rows.filter(row => predicate(row[column], statement.values[offset++]));
            }
            return { results: rows };
          }
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      const output = [];
      for (const statement of statements) output.push(await statement.run());
      return output;
    }
  };
  return db;
}

function request(body) {
  return new Request("https://flow.example.com/api/platform/v1/data-standards/recalculate", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
}

const financeSession = { userId: "finance-1", name: "财务", department: "财务部" };

test("ensure_current creates one asynchronous idempotent run and publishes current results", async () => {
  const db = runtimeDb();
  const background = [];
  const input = { metricCodes: ["sales.net_sales"], from: "2026-07-01", to: "2026-07-19", mode: "ensure_current", idempotencyKey: "client-value-is-ignored" };
  const first = await recalculateRequest({ request: request(input), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession }, waitUntil: promise => background.push(promise) });
  assert.equal(first.status, 202);
  const firstPayload = await first.json();
  assert.equal(firstPayload.run.status, "pending");
  assert.equal("idempotencyKey" in firstPayload.run, false);
  assert.equal(background.length, 1);
  await Promise.all(background);
  assert.equal([...db.runs.values()][0].status, "succeeded");
  assert.equal([...db.results.values()].filter(row => row.is_current === 1).length, 1);

  const secondBackground = [];
  const second = await recalculateRequest({ request: request({ ...input, idempotencyKey: "different-client-value" }), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession }, waitUntil: promise => secondBackground.push(promise) });
  const secondPayload = await second.json();
  assert.equal(secondPayload.run.id, firstPayload.run.id);
  assert.equal(db.runs.size, 1);
  assert.equal(secondBackground.length, 0);
});

test("recalculation validates range, target version and explicit department permission", async () => {
  const db = runtimeDb();
  const tooWide = await recalculateRequest({ request: request({ metricCodes: ["sales.net_sales"], from: "2025-01-01", to: "2026-07-19", mode: "ensure_current" }), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession }, waitUntil() {} });
  assert.equal(tooWide.status, 400);
  assert.equal((await tooWide.json()).error.code, "DATA_STANDARD_QUERY_RANGE_INVALID");

  const forbidden = await recalculateRequest({ request: request({ metricCodes: ["sales.net_sales"], from: "2026-07-01", to: "2026-07-19", mode: "explicit_recalculation", confirmed: true }), env: { PRODUCT_FLOW_DB: db }, data: { session: { userId: "ops", name: "运营", department: "运营部" } }, waitUntil() {} });
  assert.equal(forbidden.status, 403);

  const unknownVersion = await recalculateRequest({ request: request({ metricCodes: ["sales.net_sales"], from: "2026-07-01", to: "2026-07-19", mode: "explicit_recalculation", confirmed: true, targetVersions: { "sales.net_sales": 99 } }), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession }, waitUntil() {} });
  assert.equal(unknownVersion.status, 400);

  const unrelatedVersion = await recalculateRequest({ request: request({ metricCodes: ["sales.net_sales"], from: "2026-07-01", to: "2026-07-19", mode: "ensure_current", targetVersions: { "sales.quantity": 1 } }), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession }, waitUntil() {} });
  assert.equal(unrelatedVersion.status, 400);

  const invalidCalendarDate = await resultsRequest({ request: new Request("https://flow.example.com/api/platform/v1/data-standards/results?metricCodes=sales.net_sales&from=2026-07-01&to=2026-02-31"), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession } });
  assert.equal(invalidCalendarDate.status, 400);
});

test("failed background calculation marks the run failed without current results", async () => {
  const db = runtimeDb({ failAggregate: true });
  const background = [];
  const response = await recalculateRequest({ request: request({ metricCodes: ["sales.net_sales"], from: "2026-07-01", to: "2026-07-19", mode: "ensure_current" }), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession }, waitUntil: promise => background.push(promise) });
  assert.equal(response.status, 202);
  await Promise.all(background);
  assert.equal([...db.runs.values()][0].status, "failed");
  assert.equal([...db.results.values()].filter(row => row.is_current === 1).length, 0);
});

test("results returns governed metadata and an explicit missing reason without writing", async () => {
  const db = runtimeDb();
  const beforeRuns = db.runs.size;
  const missing = await resultsRequest({ request: new Request("https://flow.example.com/api/platform/v1/data-standards/results?metricCodes=sales.net_sales&from=2026-07-01&to=2026-07-19"), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession } });
  const missingPayload = await missing.json();
  assert.deepEqual(missingPayload.results, []);
  assert.equal(missingPayload.missing.reasonCode, "RESULT_NOT_AVAILABLE");
  assert.equal(db.runs.size, beforeRuns);

  const background = [];
  await recalculateRequest({ request: request({ metricCodes: ["sales.net_sales"], from: "2026-07-01", to: "2026-07-19", mode: "ensure_current" }), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession }, waitUntil: promise => background.push(promise) });
  await Promise.all(background);
  const response = await resultsRequest({ request: new Request("https://flow.example.com/api/platform/v1/data-standards/results?metricCodes=sales.net_sales&from=2026-07-01&to=2026-07-19"), env: { PRODUCT_FLOW_DB: db }, data: { session: financeSession } });
  const payload = await response.json();
  assert.equal(payload.results[0].metricCode, "sales.net_sales");
  assert.equal(payload.results[0].value, 800);
  assert.equal(payload.results[0].version, 1);
  assert.equal(payload.results[0].coverageRate, 1);
  assert.equal(payload.results[0].confidence, "high");
  assert.equal(payload.results[0].estimated, false);
  assert.equal(payload.results[0].cutoffAt, "2026-07-19");
  assert.equal(payload.results[0].status, "complete");
});
