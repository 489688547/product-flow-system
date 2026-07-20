import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  appendDefinitionVersion,
  archiveDefinition,
  createCalculationRun,
  dataStandardsDatabase,
  ensureDataStandardsTables,
  failCalculationRun,
  getDefinitionDetail,
  insertDefinitionWithVersion,
  listCurrentResults,
  listDefinitions,
  writeCalculationBatch
} from "../functions/api/platform/v1/_shared/dataStandardsStorage.js";

const migrationPath = resolve("migrations/0004_data_standards.sql");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function definitionInput(overrides = {}) {
  return {
    id: "sales-net-sales",
    metricCode: "sales.net_sales",
    category: "sales",
    name: "净销售额",
    ownerDepartment: "财务部",
    unit: "CNY",
    period: "day",
    currentVersion: 1,
    status: "active",
    createdAt: "2026-07-20T01:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-07-20T01:00:00.000Z",
    updatedBy: "user-1",
    ...overrides
  };
}

function versionInput(overrides = {}) {
  return {
    version: 1,
    effectiveFrom: "2026-07-01",
    displayFormula: "净销售额按订单创建日汇总",
    formulaAst: { type: "aggregate", operation: "sum", input: { type: "field", field: "sales.net_sales" }, filters: [] },
    sourceFields: ["sales.net_sales"],
    dependencies: [],
    executable: true,
    coverageStatus: "COMPLETE",
    createdAt: "2026-07-20T01:00:00.000Z",
    createdBy: "user-1",
    ...overrides
  };
}

function auditInput(overrides = {}) {
  return {
    id: "audit-1",
    action: "create",
    actorId: "user-1",
    actorName: "财务同事",
    definitionVersion: 1,
    changedFields: ["name", "formulaAst"],
    createdAt: "2026-07-20T01:00:00.000Z",
    ...overrides
  };
}

function createD1Mock() {
  const definitions = new Map();
  const versions = new Map();
  const audits = [];
  const runs = new Map();
  const results = new Map();
  const tables = new Set();
  const batches = [];
  let failBatchPattern = null;

  function cloneState() {
    return {
      definitions: structuredClone(definitions),
      versions: structuredClone(versions),
      audits: structuredClone(audits),
      runs: structuredClone(runs),
      results: structuredClone(results)
    };
  }

  function restoreState(snapshot) {
    definitions.clear();
    snapshot.definitions.forEach((value, key) => definitions.set(key, value));
    versions.clear();
    snapshot.versions.forEach((value, key) => versions.set(key, value));
    audits.splice(0, audits.length, ...snapshot.audits);
    runs.clear();
    snapshot.runs.forEach((value, key) => runs.set(key, value));
    results.clear();
    snapshot.results.forEach((value, key) => results.set(key, value));
  }

  function definitionRow(values) {
    const [id, metricCode, category, name, ownerDepartment, unit, period, currentVersion, status,
      archivedAt, archivedBy, createdAt, createdBy, updatedAt, updatedBy] = values;
    return {
      id, metric_code: metricCode, category, name, owner_department: ownerDepartment,
      unit, period, current_version: currentVersion, status, archived_at: archivedAt,
      archived_by: archivedBy, created_at: createdAt, created_by: createdBy,
      updated_at: updatedAt, updated_by: updatedBy
    };
  }

  function versionRow(values, offset = 0) {
    const [definitionId, version, effectiveFrom, displayFormula, formulaAst, sourceFields,
      dependencies, executable, coverageStatus, createdAt, createdBy] = values.slice(offset);
    return {
      definition_id: definitionId, version, effective_from: effectiveFrom,
      display_formula: displayFormula, formula_ast: formulaAst, source_fields: sourceFields,
      dependencies, executable, coverage_status: coverageStatus, created_at: createdAt,
      created_by: createdBy
    };
  }

  const db = {
    definitions,
    versions,
    audits,
    runs,
    results,
    tables,
    batches,
    setBatchFailure(pattern) { failBatchPattern = pattern; },
    prepare(sql) {
      const normalized = normalizeSql(sql);
      const statement = {
        sql,
        normalized,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (normalized.startsWith("create table")) {
            const match = normalized.match(/create table if not exists ([a-z0-9_]+)/);
            if (match) tables.add(match[1]);
            return { success: true, meta: { changes: 0 } };
          }
          if (normalized.startsWith("create index")) return { success: true, meta: { changes: 0 } };
          if (normalized.startsWith("insert into data_metric_definitions")) {
            const row = definitionRow(statement.values);
            if ([...definitions.values()].some(item => item.metric_code === row.metric_code)) throw new Error("UNIQUE constraint failed: data_metric_definitions.metric_code");
            definitions.set(row.id, row);
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_definition_versions") && normalized.includes("select")) {
            const row = versionRow(statement.values);
            const expectedVersion = statement.values.at(-1);
            const current = definitions.get(row.definition_id);
            if (!current || current.current_version !== expectedVersion) return { success: true, meta: { changes: 0 } };
            const duplicateDate = [...versions.values()].some(item => item.definition_id === row.definition_id && item.effective_from === row.effective_from);
            if (duplicateDate) throw new Error("UNIQUE constraint failed: data_metric_definition_versions.definition_id, data_metric_definition_versions.effective_from");
            versions.set(`${row.definition_id}:${row.version}`, row);
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_definition_versions")) {
            const row = versionRow(statement.values);
            const duplicateDate = [...versions.values()].some(item => item.definition_id === row.definition_id && item.effective_from === row.effective_from);
            if (duplicateDate) throw new Error("UNIQUE constraint failed: data_metric_definition_versions.definition_id, data_metric_definition_versions.effective_from");
            versions.set(`${row.definition_id}:${row.version}`, row);
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_definitions set current_version")) {
            const [nextVersion, updatedAt, updatedBy, id, expectedVersion] = statement.values;
            const current = definitions.get(id);
            if (!current || current.current_version !== expectedVersion || current.status !== "active") return { success: true, meta: { changes: 0 } };
            definitions.set(id, { ...current, current_version: nextVersion, updated_at: updatedAt, updated_by: updatedBy });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_definitions set status")) {
            const [status, archivedAt, archivedBy, updatedAt, updatedBy, id, expectedVersion] = statement.values;
            const current = definitions.get(id);
            if (!current || current.current_version !== expectedVersion || current.status !== "active") return { success: true, meta: { changes: 0 } };
            definitions.set(id, { ...current, status, archived_at: archivedAt, archived_by: archivedBy, updated_at: updatedAt, updated_by: updatedBy });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_audit_logs")) {
            const [id, definitionId, action, actorId, actorName, definitionVersion, changedFields, rangeStart, rangeEnd, createdAt] = statement.values;
            if (normalized.includes("select") && !definitions.has(definitionId)) return { success: true, meta: { changes: 0 } };
            audits.push({ id, definition_id: definitionId, action, actor_id: actorId, actor_name: actorName, definition_version: definitionVersion, changed_fields: changedFields, range_start: rangeStart, range_end: rangeEnd, created_at: createdAt });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_calculation_runs")) {
            const [id, idempotencyKey, definitionIds, rangeStart, rangeEnd, targetVersion, status, progress, requestedBy, createdAt, updatedAt] = statement.values;
            const duplicate = [...runs.values()].find(run => run.idempotency_key === idempotencyKey);
            if (duplicate) return { success: true, meta: { changes: 0 } };
            runs.set(id, { id, idempotency_key: idempotencyKey, definition_ids: definitionIds, range_start: rangeStart, range_end: rangeEnd, target_version: targetVersion, status, progress, requested_by: requestedBy, error_code: null, created_at: createdAt, updated_at: updatedAt, completed_at: null });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_results")) {
            const [id, definitionId, definitionVersion, metricCode, periodStart, periodEnd,
              dimensionsJson, value, unit, coverageRate, confidence, estimated, status, reason,
              dataCutoffAt, calculationRunId, isCurrent, createdAt] = statement.values;
            if (!results.has(id)) results.set(id, { id, definition_id: definitionId, definition_version: definitionVersion, metric_code: metricCode, period_start: periodStart, period_end: periodEnd, dimensions_json: dimensionsJson, value, unit, coverage_rate: coverageRate, confidence, estimated, status, reason, data_cutoff_at: dataCutoffAt, calculation_run_id: calculationRunId, is_current: isCurrent, created_at: createdAt });
            return { success: true, meta: { changes: results.has(id) ? 0 : 1 } };
          }
          if (normalized.startsWith("update data_metric_results set is_current = 0")) {
            const [definitionId, periodStart, periodEnd, dimensionsJson, runId] = statement.values;
            let changes = 0;
            results.forEach((row, key) => {
              if (row.definition_id === definitionId && row.period_start === periodStart && row.period_end === periodEnd && row.dimensions_json === dimensionsJson && row.calculation_run_id !== runId && row.is_current === 1) {
                results.set(key, { ...row, is_current: 0 });
                changes += 1;
              }
            });
            return { success: true, meta: { changes } };
          }
          if (normalized.startsWith("update data_metric_results set is_current = 1")) {
            const [runId] = statement.values;
            let changes = 0;
            results.forEach((row, key) => {
              if (row.calculation_run_id === runId) {
                results.set(key, { ...row, is_current: 1 });
                changes += 1;
              }
            });
            return { success: true, meta: { changes } };
          }
          if (normalized.startsWith("update data_metric_calculation_runs set status = 'succeeded'")) {
            const [updatedAt, completedAt, id] = statement.values;
            const current = runs.get(id);
            if (!current) return { success: true, meta: { changes: 0 } };
            runs.set(id, { ...current, status: "succeeded", progress: 100, updated_at: updatedAt, completed_at: completedAt });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_calculation_runs set status = 'failed'")) {
            const [errorCode, updatedAt, completedAt, id] = statement.values;
            const current = runs.get(id);
            if (!current) return { success: true, meta: { changes: 0 } };
            runs.set(id, { ...current, status: "failed", error_code: errorCode, updated_at: updatedAt, completed_at: completedAt });
            return { success: true, meta: { changes: 1 } };
          }
          throw new Error(`Unexpected run SQL: ${sql}`);
        },
        async first() {
          if (normalized.includes("from data_metric_definition_versions") && normalized.includes("effective_from = ?")) {
            const [definitionId, effectiveFrom] = statement.values;
            return [...versions.values()].find(row => row.definition_id === definitionId && row.effective_from === effectiveFrom) || null;
          }
          if (normalized.includes("from data_metric_definitions") && normalized.includes("where id = ?")) return definitions.get(statement.values[0]) || null;
          if (normalized.includes("from data_metric_calculation_runs") && normalized.includes("idempotency_key = ?")) return [...runs.values()].find(run => run.idempotency_key === statement.values[0]) || null;
          return null;
        },
        async all() {
          if (normalized.includes("from data_metric_definitions") && !normalized.includes("join")) {
            let rows = [...definitions.values()];
            let offset = 0;
            for (const condition of ["category = ?", "owner_department = ?", "status = ?"]) {
              if (normalized.includes(condition)) {
                const column = condition.split(" ")[0];
                rows = rows.filter(row => row[column] === statement.values[offset]);
                offset += 1;
              }
            }
            return { results: rows };
          }
          if (normalized.includes("from data_metric_definition_versions")) {
            return { results: [...versions.values()].filter(row => row.definition_id === statement.values[0]).sort((a, b) => b.version - a.version) };
          }
          if (normalized.includes("from data_metric_audit_logs")) {
            return { results: audits.filter(row => row.definition_id === statement.values[0]) };
          }
          if (normalized.includes("from data_metric_results")) {
            let rows = [...results.values()].filter(row => row.is_current === 1);
            let offset = 0;
            for (const condition of ["definition_id = ?", "metric_code = ?", "period_start >= ?", "period_end <= ?"]) {
              if (normalized.includes(condition)) {
                const [column, operator] = condition.split(" ");
                const value = statement.values[offset++];
                rows = rows.filter(row => operator === "=" ? row[column] === value : operator === ">=" ? row[column] >= value : row[column] <= value);
              }
            }
            return { results: rows };
          }
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements.map(statement => statement.normalized));
      const snapshot = cloneState();
      try {
        const batchResults = [];
        for (const statement of statements) {
          if (failBatchPattern?.test(statement.normalized)) throw new Error("simulated batch failure");
          batchResults.push(await statement.run());
        }
        return batchResults;
      } catch (error) {
        restoreState(snapshot);
        throw error;
      }
    }
  };
  return db;
}

test("migration preserves the legacy payload table and seeds 11 versioned definitions", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /ALTER TABLE data_metric_definitions RENAME TO data_metric_definitions_legacy/i);
  for (const table of ["data_metric_definitions", "data_metric_definition_versions", "data_metric_results", "data_metric_calculation_runs", "data_metric_audit_logs"]) {
    assert.match(sql, new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${table}`, "i"));
  }
  assert.match(sql, /UNIQUE\s*\(definition_id,\s*effective_from\)/i);
  assert.match(sql, /ON CONFLICT[^;]*DO NOTHING/is);
  assert.doesNotMatch(sql, /DROP TABLE\s+data_metric_definitions_legacy/i);

  const directory = mkdtempSync(join(tmpdir(), "data-standards-migration-"));
  const database = join(directory, "test.sqlite");
  const legacyNetSales = JSON.stringify({ id: "legacy-net-sales", metricCode: "sales.net_sales", name: "旧净销售额", formula: "旧净销售额口径", owner: "财务部" }).replaceAll("'", "''");
  const legacyGrossProfit = JSON.stringify({ id: "legacy-gross-profit", metricCode: "sales.gross_profit", name: "旧毛利", formula: "旧毛利口径", owner: "财务部" }).replaceAll("'", "''");
  try {
    execFileSync("sqlite3", [database], {
      input: `CREATE TABLE data_metric_definitions (entity_type TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY (entity_type, id));\nINSERT INTO data_metric_definitions VALUES ('metricDefinitions', 'legacy-net-sales', '${legacyNetSales}', '2026-07-18T00:00:00.000Z', 'legacy-user');\nINSERT INTO data_metric_definitions VALUES ('metricDefinitions', 'legacy-gross-profit', '${legacyGrossProfit}', '2026-07-18T00:00:00.000Z', 'legacy-user');\n${sql}`
    });
    const definitions = JSON.parse(execFileSync("sqlite3", ["-json", database, "SELECT metric_code, name, current_version FROM data_metric_definitions ORDER BY metric_code"], { encoding: "utf8" }));
    const versions = JSON.parse(execFileSync("sqlite3", ["-json", database, "SELECT d.metric_code, v.version, v.display_formula FROM data_metric_definition_versions v JOIN data_metric_definitions d ON d.id = v.definition_id ORDER BY d.metric_code"], { encoding: "utf8" }));
    const legacyCount = Number(execFileSync("sqlite3", [database, "SELECT COUNT(*) FROM data_metric_definitions_legacy"], { encoding: "utf8" }).trim());
    assert.equal(definitions.length, 11);
    assert.equal(new Set(definitions.map(item => item.metric_code)).size, 11);
    assert.equal(versions.length, 11);
    assert.equal(definitions.find(item => item.metric_code === "sales.net_sales").name, "旧净销售额");
    assert.equal(versions.find(item => item.metric_code === "sales.net_sales").display_formula, "旧净销售额口径");
    assert.equal(legacyCount, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("environment and integration manifests declare versioned data-standard persistence", () => {
  const environment = JSON.parse(readFileSync(resolve("docs/platform/environment-capabilities.json"), "utf8"));
  const registry = JSON.parse(readFileSync(resolve("docs/platform/integration-registry.json"), "utf8"));
  const capability = environment.capabilities.find(item => item.id === "business-data-apps");
  for (const table of [
    "data_metric_definitions_legacy",
    "data_metric_definition_versions",
    "data_metric_results",
    "data_metric_calculation_runs",
    "data_metric_audit_logs"
  ]) {
    assert.ok(capability.tables.includes(table), `${table} must be required by business-data-apps`);
  }
  const d1 = registry.platforms.find(item => item.id === "cloudflare-d1");
  const pages = registry.platforms.find(item => item.id === "cloudflare-pages");
  assert.ok(d1.capabilities.includes("版本化数据口径与计算结果"));
  for (const platform of [d1, pages]) {
    assert.ok(platform.apiRoutes.includes("/api/platform/v1/data-standards"));
    assert.ok(platform.codePaths.some(path => path.includes("dataStandards") || path.includes("data-standards")));
    assert.ok(platform.evidence.some(path => path.includes("dataStandards") || path.includes("0004_data_standards")));
  }
});

test("storage uses the governed D1 binding and creates all normalized tables", async () => {
  const db = createD1Mock();
  assert.equal(dataStandardsDatabase({ PRODUCT_FLOW_DB: db }), db);
  assert.equal(dataStandardsDatabase({ product_flow_db: db }), db);
  assert.equal(dataStandardsDatabase({ DB: db }), db);
  await ensureDataStandardsTables(db);
  assert.deepEqual([...db.tables].sort(), [
    "data_metric_audit_logs",
    "data_metric_calculation_runs",
    "data_metric_definition_versions",
    "data_metric_definitions",
    "data_metric_results"
  ]);
});

test("definition versions append and reject stale or same-day writes", async () => {
  const db = createD1Mock();
  await insertDefinitionWithVersion(db, definitionInput(), versionInput(), auditInput());
  const appended = await appendDefinitionVersion(
    db,
    "sales-net-sales",
    1,
    versionInput({ version: 2, effectiveFrom: "2026-08-01", displayFormula: "净销售额 v2", createdAt: "2026-07-20T02:00:00.000Z" }),
    auditInput({ id: "audit-2", action: "publish_version", definitionVersion: 2, createdAt: "2026-07-20T02:00:00.000Z" })
  );
  assert.equal(appended.currentVersion, 2);
  assert.equal(db.versions.size, 2);
  assert.equal(db.audits.length, 2);

  await assert.rejects(
    () => appendDefinitionVersion(db, "sales-net-sales", 1, versionInput({ version: 2, effectiveFrom: "2026-09-01" }), auditInput({ id: "audit-stale" })),
    error => error.code === "DATA_STANDARD_VERSION_CONFLICT"
  );
  await assert.rejects(
    () => appendDefinitionVersion(db, "sales-net-sales", 2, versionInput({ version: 3, effectiveFrom: "2026-08-01" }), auditInput({ id: "audit-date" })),
    error => error.code === "DATA_STANDARD_EFFECTIVE_DATE_CONFLICT"
  );
  assert.equal(db.versions.size, 2);
  assert.equal(db.audits.length, 2);

  const listed = await listDefinitions(db, { category: "sales", ownerDepartment: "财务部", status: "active" });
  const detail = await getDefinitionDetail(db, "sales-net-sales");
  assert.equal(listed.length, 1);
  assert.equal(detail.versions.length, 2);
  assert.equal(detail.auditLogs.length, 2);
});

test("archive keeps definition versions and audit history", async () => {
  const db = createD1Mock();
  await insertDefinitionWithVersion(db, definitionInput(), versionInput(), auditInput());
  const archived = await archiveDefinition(db, "sales-net-sales", 1, auditInput({ id: "audit-archive", action: "archive", changedFields: ["status"] }));
  assert.equal(archived.status, "archived");
  assert.equal(db.definitions.has("sales-net-sales"), true);
  assert.equal(db.versions.size, 1);
  assert.equal(db.audits.some(item => item.action === "archive"), true);
  await assert.rejects(
    () => archiveDefinition(db, "sales-net-sales", 1, auditInput({ id: "audit-archive-again" })),
    error => error.code === "DATA_STANDARD_VERSION_CONFLICT"
  );
  assert.equal(db.audits.length, 2);
});

test("calculation runs are idempotent and a batch atomically switches current results", async () => {
  const db = createD1Mock();
  const first = await createCalculationRun(db, {
    id: "run-1", idempotencyKey: "sales:2026-07-01:2026-07-31", definitionIds: ["sales-net-sales"],
    rangeStart: "2026-07-01", rangeEnd: "2026-07-31", targetVersion: 1, requestedBy: "user-1", createdAt: "2026-07-20T01:00:00.000Z"
  });
  const duplicate = await createCalculationRun(db, {
    id: "run-duplicate", idempotencyKey: "sales:2026-07-01:2026-07-31", definitionIds: ["sales-net-sales"],
    rangeStart: "2026-07-01", rangeEnd: "2026-07-31", targetVersion: 1, requestedBy: "user-2", createdAt: "2026-07-20T02:00:00.000Z"
  });
  assert.equal(first.id, "run-1");
  assert.equal(duplicate.id, "run-1");
  assert.equal(db.runs.size, 1);

  db.results.set("old-result", {
    id: "old-result", definition_id: "sales-net-sales", definition_version: 1, metric_code: "sales.net_sales",
    period_start: "2026-07-01", period_end: "2026-07-31", dimensions_json: "{}", value: 100,
    unit: "CNY", coverage_rate: 1, confidence: "high", estimated: 0, status: "complete", reason: null,
    data_cutoff_at: "2026-07-31", calculation_run_id: "run-old", is_current: 1, created_at: "2026-07-19T00:00:00.000Z"
  });
  await writeCalculationBatch(db, first, [{
    id: "new-result", definitionId: "sales-net-sales", definitionVersion: 1, metricCode: "sales.net_sales",
    periodStart: "2026-07-01", periodEnd: "2026-07-31", dimensions: {}, value: 120, unit: "CNY",
    coverageRate: 1, confidence: "high", estimated: false, status: "complete", reason: null,
    dataCutoffAt: "2026-07-31", createdAt: "2026-07-20T03:00:00.000Z"
  }]);
  assert.equal(db.results.get("old-result").is_current, 0);
  assert.equal(db.results.get("new-result").is_current, 1);
  assert.equal(db.runs.get("run-1").status, "succeeded");
  const switchBatch = db.batches.at(-1);
  const insertIndex = switchBatch.findIndex(sql => sql.startsWith("insert into data_metric_results"));
  const deactivateIndex = switchBatch.findIndex(sql => sql.startsWith("update data_metric_results set is_current = 0"));
  const activateIndex = switchBatch.findIndex(sql => sql.startsWith("update data_metric_results set is_current = 1"));
  const succeedIndex = switchBatch.findIndex(sql => sql.startsWith("update data_metric_calculation_runs set status = 'succeeded'"));
  assert.ok(insertIndex >= 0 && insertIndex < deactivateIndex && deactivateIndex < activateIndex && activateIndex < succeedIndex);

  const current = await listCurrentResults(db, { metricCode: "sales.net_sales", from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual(current.map(item => item.id), ["new-result"]);
});

test("a failed calculation batch leaves the previous current result visible", async () => {
  const db = createD1Mock();
  const run = await createCalculationRun(db, {
    id: "run-fail", idempotencyKey: "fail-on-activate", definitionIds: ["sales-net-sales"],
    rangeStart: "2026-07-01", rangeEnd: "2026-07-31", targetVersion: 1, requestedBy: "user-1", createdAt: "2026-07-20T01:00:00.000Z"
  });
  db.results.set("old-result", {
    id: "old-result", definition_id: "sales-net-sales", definition_version: 1, metric_code: "sales.net_sales",
    period_start: "2026-07-01", period_end: "2026-07-31", dimensions_json: "{}", value: 100,
    unit: "CNY", coverage_rate: 1, confidence: "high", estimated: 0, status: "complete", reason: null,
    data_cutoff_at: "2026-07-31", calculation_run_id: "run-old", is_current: 1, created_at: "2026-07-19T00:00:00.000Z"
  });
  db.setBatchFailure(/update data_metric_results set is_current = 1/);
  await assert.rejects(() => writeCalculationBatch(db, run, [{
    id: "new-result", definitionId: "sales-net-sales", definitionVersion: 1, metricCode: "sales.net_sales",
    periodStart: "2026-07-01", periodEnd: "2026-07-31", dimensions: {}, value: 120, unit: "CNY",
    coverageRate: 1, confidence: "high", estimated: false, status: "complete", reason: null,
    dataCutoffAt: "2026-07-31", createdAt: "2026-07-20T03:00:00.000Z"
  }]));
  await failCalculationRun(db, "run-fail", "DATA_STANDARD_CALCULATION_FAILED");
  assert.equal(db.results.get("old-result").is_current, 1);
  assert.equal(db.results.has("new-result"), false);
  assert.equal(db.runs.get("run-fail").status, "failed");
});
