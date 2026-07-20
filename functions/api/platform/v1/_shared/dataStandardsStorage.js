function storageError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function canonicalJson(value) {
  function canonicalize(nested) {
    if (Array.isArray(nested)) return nested.map(canonicalize);
    if (!nested || typeof nested !== "object") return nested;
    return Object.fromEntries(Object.keys(nested).sort().map(key => [key, canonicalize(nested[key])]));
  }
  return JSON.stringify(canonicalize(value));
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function definitionFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    metricCode: row.metric_code,
    category: row.category,
    name: row.name,
    ownerDepartment: row.owner_department,
    unit: row.unit,
    period: row.period,
    currentVersion: Number(row.current_version),
    status: row.status,
    archivedAt: row.archived_at || "",
    archivedBy: row.archived_by || "",
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
}

function versionFromRow(row) {
  if (!row) return null;
  return {
    definitionId: row.definition_id,
    version: Number(row.version),
    name: row.name,
    category: row.category,
    ownerDepartment: row.owner_department,
    unit: row.unit,
    period: row.period,
    effectiveFrom: row.effective_from,
    displayFormula: row.display_formula,
    formulaAst: parseJson(row.formula_ast, null),
    sourceFields: parseJson(row.source_fields, []),
    dependencies: parseJson(row.dependencies, []),
    executable: Boolean(row.executable),
    coverageStatus: row.coverage_status,
    createdAt: row.created_at,
    createdBy: row.created_by
  };
}

function auditFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    definitionId: row.definition_id,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    definitionVersion: row.definition_version == null ? null : Number(row.definition_version),
    changedFields: parseJson(row.changed_fields, []),
    rangeStart: row.range_start || "",
    rangeEnd: row.range_end || "",
    createdAt: row.created_at
  };
}

function runFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    definitionIds: parseJson(row.definition_ids, []),
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    targetVersion: row.target_version == null ? null : Number(row.target_version),
    status: row.status,
    progress: Number(row.progress || 0),
    requestedBy: row.requested_by,
    errorCode: row.error_code || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || ""
  };
}

function resultFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    definitionId: row.definition_id,
    definitionVersion: Number(row.definition_version),
    metricCode: row.metric_code,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dimensions: parseJson(row.dimensions_json, {}),
    value: row.value == null ? null : Number(row.value),
    unit: row.unit,
    coverageRate: row.coverage_rate == null ? null : Number(row.coverage_rate),
    confidence: row.confidence,
    estimated: Boolean(row.estimated),
    status: row.status,
    reason: row.reason || "",
    dataCutoffAt: row.data_cutoff_at || "",
    calculationRunId: row.calculation_run_id,
    isCurrent: Boolean(row.is_current),
    createdAt: row.created_at
  };
}

function versionValues(definitionId, version) {
  return [
    definitionId,
    Number(version.version),
    version.name,
    version.category,
    version.ownerDepartment,
    version.unit,
    version.period,
    version.effectiveFrom,
    version.displayFormula,
    JSON.stringify(version.formulaAst ?? null),
    JSON.stringify(version.sourceFields || []),
    JSON.stringify(version.dependencies || []),
    version.executable === false ? 0 : 1,
    version.coverageStatus || "COMPLETE",
    version.createdAt,
    version.createdBy
  ];
}

function auditValues(definitionId, audit) {
  return [
    audit.id,
    definitionId,
    audit.action,
    audit.actorId,
    audit.actorName,
    audit.definitionVersion ?? null,
    JSON.stringify(audit.changedFields || []),
    audit.rangeStart || null,
    audit.rangeEnd || null,
    audit.createdAt
  ];
}

function auditInsert(db, definitionId, audit) {
  return db.prepare(`INSERT INTO data_metric_audit_logs
    (id, definition_id, action, actor_id, actor_name, definition_version, changed_fields, range_start, range_end, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditValues(definitionId, audit));
}

function mapConstraintError(error) {
  if (error?.code?.startsWith?.("DATA_STANDARD_")) return error;
  const message = String(error?.message || "");
  if (/effective_from|definition_id,\s*version/i.test(message)) {
    return storageError("同一口径不能在同一天发布多个版本。", "DATA_STANDARD_EFFECTIVE_DATE_CONFLICT");
  }
  if (/metric_code/i.test(message)) {
    return storageError("metricCode 已存在。", "DATA_STANDARD_METRIC_CODE_CONFLICT");
  }
  return error;
}

export function dataStandardsDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureDataStandardsTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_metric_definitions (
    id TEXT PRIMARY KEY, metric_code TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
    name TEXT NOT NULL, owner_department TEXT NOT NULL, unit TEXT NOT NULL, period TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    archived_at TEXT, archived_by TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_metric_definition_versions (
    definition_id TEXT NOT NULL, version INTEGER NOT NULL, effective_from TEXT NOT NULL,
    name TEXT NOT NULL, category TEXT NOT NULL, owner_department TEXT NOT NULL,
    unit TEXT NOT NULL, period TEXT NOT NULL,
    display_formula TEXT NOT NULL, formula_ast TEXT, source_fields TEXT NOT NULL,
    dependencies TEXT NOT NULL, executable INTEGER NOT NULL DEFAULT 1, coverage_status TEXT NOT NULL,
    created_at TEXT NOT NULL, created_by TEXT NOT NULL,
    PRIMARY KEY (definition_id, version), UNIQUE (definition_id, effective_from)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_metric_results (
    id TEXT PRIMARY KEY, definition_id TEXT NOT NULL, definition_version INTEGER NOT NULL,
    metric_code TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
    dimensions_json TEXT NOT NULL, value REAL, unit TEXT NOT NULL, coverage_rate REAL,
    confidence TEXT NOT NULL, estimated INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
    reason TEXT, data_cutoff_at TEXT, calculation_run_id TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    UNIQUE (calculation_run_id, definition_id, definition_version, period_start, period_end, dimensions_json)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_metric_calculation_runs (
    id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, definition_ids TEXT NOT NULL,
    range_start TEXT NOT NULL, range_end TEXT NOT NULL, target_version INTEGER,
    status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, requested_by TEXT NOT NULL,
    error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_metric_audit_logs (
    id TEXT PRIMARY KEY, definition_id TEXT NOT NULL, action TEXT NOT NULL,
    actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, definition_version INTEGER,
    changed_fields TEXT NOT NULL, range_start TEXT, range_end TEXT, created_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS data_metric_definitions_filter ON data_metric_definitions (category, owner_department, status)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS data_metric_versions_effective ON data_metric_definition_versions (definition_id, effective_from DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS data_metric_results_current ON data_metric_results (metric_code, period_start, period_end, is_current)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS data_metric_audit_definition ON data_metric_audit_logs (definition_id, created_at DESC)").run();
}

export async function listDefinitions(db, filters = {}) {
  const conditions = [];
  const bindings = [];
  for (const [column, value] of [["category", filters.category], ["owner_department", filters.ownerDepartment], ["status", filters.status]]) {
    if (value) {
      conditions.push(`${column} = ?`);
      bindings.push(value);
    }
  }
  let sql = "SELECT * FROM data_metric_definitions";
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY category, metric_code";
  const result = await db.prepare(sql).bind(...bindings).all();
  return (result?.results || []).map(definitionFromRow);
}

export async function appendDataStandardAudit(db, definitionId, audit) {
  await auditInsert(db, definitionId, audit).run();
}

export async function getDefinitionDetail(db, id) {
  const row = await db.prepare("SELECT * FROM data_metric_definitions WHERE id = ?").bind(id).first();
  if (!row) return null;
  const [versions, auditLogs] = await Promise.all([
    db.prepare("SELECT * FROM data_metric_definition_versions WHERE definition_id = ? ORDER BY version DESC").bind(id).all(),
    db.prepare("SELECT * FROM data_metric_audit_logs WHERE definition_id = ? ORDER BY created_at DESC").bind(id).all()
  ]);
  return {
    ...definitionFromRow(row),
    versions: (versions?.results || []).map(versionFromRow),
    auditLogs: (auditLogs?.results || []).map(auditFromRow)
  };
}

export async function insertDefinitionWithVersion(db, definition, version, audit) {
  const definitionStatement = db.prepare(`INSERT INTO data_metric_definitions
    (id, metric_code, category, name, owner_department, unit, period, current_version, status,
      archived_at, archived_by, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    definition.id, definition.metricCode, definition.category, definition.name,
    definition.ownerDepartment, definition.unit, definition.period,
    Number(definition.currentVersion || version.version || 1), definition.status || "active",
    definition.archivedAt || null, definition.archivedBy || null,
    definition.createdAt, definition.createdBy, definition.updatedAt, definition.updatedBy
  );
  const versionStatement = db.prepare(`INSERT INTO data_metric_definition_versions
    (definition_id, version, name, category, owner_department, unit, period,
      effective_from, display_formula, formula_ast, source_fields,
      dependencies, executable, coverage_status, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...versionValues(definition.id, {
      name: definition.name,
      category: definition.category,
      ownerDepartment: definition.ownerDepartment,
      unit: definition.unit,
      period: definition.period,
      ...version
    }));
  try {
    await db.batch([definitionStatement, versionStatement, auditInsert(db, definition.id, audit)]);
  } catch (error) {
    throw mapConstraintError(error);
  }
  return getDefinitionDetail(db, definition.id);
}

export async function appendDefinitionVersion(db, id, expectedVersion, version, audit) {
  const current = await db.prepare("SELECT * FROM data_metric_definitions WHERE id = ?").bind(id).first();
  if (!current || current.status !== "active" || Number(current.current_version) !== Number(expectedVersion)) {
    throw storageError("口径版本已更新，请刷新后重试。", "DATA_STANDARD_VERSION_CONFLICT");
  }
  const nextVersion = Number(version.version || Number(expectedVersion) + 1);
  if (nextVersion !== Number(expectedVersion) + 1) {
    throw storageError("口径版本必须连续追加。", "DATA_STANDARD_VERSION_CONFLICT");
  }
  const latest = await db.prepare(`SELECT effective_from FROM data_metric_definition_versions
    WHERE definition_id = ? ORDER BY effective_from DESC LIMIT 1`).bind(id).first();
  if (latest && String(version.effectiveFrom) <= String(latest.effective_from)) {
    throw storageError("新版本生效日期必须晚于当前最新版本。", "DATA_STANDARD_EFFECTIVE_DATE_CONFLICT");
  }

  const versionStatement = db.prepare(`INSERT INTO data_metric_definition_versions
    (definition_id, version, name, category, owner_department, unit, period,
      effective_from, display_formula, formula_ast, source_fields,
      dependencies, executable, coverage_status, created_at, created_by)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM data_metric_definitions
    WHERE id = ? AND current_version = ? AND status = 'active'`).bind(
    ...versionValues(id, { ...version, version: nextVersion }), id, Number(expectedVersion)
  );
  const auditStatement = db.prepare(`INSERT INTO data_metric_audit_logs
    (id, definition_id, action, actor_id, actor_name, definition_version, changed_fields, range_start, range_end, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM data_metric_definitions
    WHERE id = ? AND current_version = ? AND status = 'active'`).bind(
    ...auditValues(id, { ...audit, definitionVersion: nextVersion }), id, Number(expectedVersion)
  );
  const updateStatement = db.prepare(`UPDATE data_metric_definitions SET name = ?, category = ?,
    owner_department = ?, unit = ?, period = ?, current_version = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND current_version = ? AND status = 'active'`).bind(
    version.name, version.category, version.ownerDepartment, version.unit, version.period,
    nextVersion, version.createdAt, version.createdBy, id, Number(expectedVersion)
  );
  let batchResults;
  try {
    batchResults = await db.batch([versionStatement, auditStatement, updateStatement]);
  } catch (error) {
    throw mapConstraintError(error);
  }
  if (changes(batchResults?.[2]) !== 1) {
    throw storageError("口径版本已更新，请刷新后重试。", "DATA_STANDARD_VERSION_CONFLICT");
  }
  return definitionFromRow(await db.prepare("SELECT * FROM data_metric_definitions WHERE id = ?").bind(id).first());
}

export async function archiveDefinition(db, id, expectedVersion, audit) {
  const current = await db.prepare("SELECT * FROM data_metric_definitions WHERE id = ?").bind(id).first();
  if (!current || current.status !== "active" || Number(current.current_version) !== Number(expectedVersion)) {
    throw storageError("口径版本已更新，请刷新后重试。", "DATA_STANDARD_VERSION_CONFLICT");
  }
  const archivedAt = audit.createdAt;
  const updateStatement = db.prepare(`UPDATE data_metric_definitions SET status = ?, archived_at = ?, archived_by = ?,
    updated_at = ?, updated_by = ? WHERE id = ? AND current_version = ? AND status = 'active'`).bind(
    "archived", archivedAt, audit.actorId, archivedAt, audit.actorId, id, Number(expectedVersion)
  );
  const auditStatement = db.prepare(`INSERT INTO data_metric_audit_logs
    (id, definition_id, action, actor_id, actor_name, definition_version, changed_fields, range_start, range_end, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM data_metric_definitions
    WHERE id = ? AND current_version = ? AND status = 'active'`).bind(
    ...auditValues(id, { ...audit, definitionVersion: Number(expectedVersion) }), id, Number(expectedVersion)
  );
  const batchResults = await db.batch([auditStatement, updateStatement]);
  if (changes(batchResults?.[1]) !== 1) {
    throw storageError("口径版本已更新，请刷新后重试。", "DATA_STANDARD_VERSION_CONFLICT");
  }
  return definitionFromRow(await db.prepare("SELECT * FROM data_metric_definitions WHERE id = ?").bind(id).first());
}

export async function createCalculationRun(db, input) {
  const createdAt = input.createdAt || new Date().toISOString();
  await db.prepare(`INSERT INTO data_metric_calculation_runs
    (id, idempotency_key, definition_ids, range_start, range_end, target_version, status,
      progress, requested_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING`).bind(
    input.id, input.idempotencyKey, JSON.stringify(input.definitionIds || []),
    input.rangeStart, input.rangeEnd, input.targetVersion ?? null, input.status || "pending",
    Number(input.progress || 0), input.requestedBy, createdAt, createdAt
  ).run();
  const row = await db.prepare("SELECT * FROM data_metric_calculation_runs WHERE idempotency_key = ?")
    .bind(input.idempotencyKey).first();
  return runFromRow(row);
}

export async function writeCalculationBatch(db, run, results) {
  const runId = run.id;
  const statements = [];
  const scopes = new Map();
  for (const result of results) {
    const dimensionsJson = canonicalJson(result.dimensions || {});
    statements.push(db.prepare(`INSERT INTO data_metric_results
      (id, definition_id, definition_version, metric_code, period_start, period_end,
        dimensions_json, value, unit, coverage_rate, confidence, estimated, status, reason,
        data_cutoff_at, calculation_run_id, is_current, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(calculation_run_id, definition_id, definition_version, period_start, period_end, dimensions_json) DO NOTHING`).bind(
      result.id, result.definitionId, Number(result.definitionVersion), result.metricCode,
      result.periodStart, result.periodEnd, dimensionsJson, result.value ?? null, result.unit,
      result.coverageRate ?? null, result.confidence, result.estimated ? 1 : 0,
      result.status, result.reason || null, result.dataCutoffAt || null, runId, 0,
      result.createdAt || new Date().toISOString()
    ));
    scopes.set(`${result.definitionId}\n${result.periodStart}\n${result.periodEnd}\n${dimensionsJson}`, {
      definitionId: result.definitionId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      dimensionsJson
    });
  }
  for (const scope of scopes.values()) {
    statements.push(db.prepare(`UPDATE data_metric_results SET is_current = 0
      WHERE definition_id = ? AND period_start = ? AND period_end = ? AND dimensions_json = ?
        AND calculation_run_id <> ? AND is_current = 1`).bind(
      scope.definitionId, scope.periodStart, scope.periodEnd, scope.dimensionsJson, runId
    ));
  }
  statements.push(db.prepare("UPDATE data_metric_results SET is_current = 1 WHERE calculation_run_id = ?").bind(runId));
  const completedAt = run.completedAt || new Date().toISOString();
  statements.push(db.prepare(`UPDATE data_metric_calculation_runs SET status = 'succeeded', progress = 100,
    error_code = NULL, updated_at = ?, completed_at = ? WHERE id = ?`).bind(completedAt, completedAt, runId));
  await db.batch(statements);
  return listCurrentResults(db, { calculationRunId: runId });
}

export async function failCalculationRun(db, runId, errorCode) {
  const completedAt = new Date().toISOString();
  await db.prepare(`UPDATE data_metric_calculation_runs SET status = 'failed', error_code = ?,
    updated_at = ?, completed_at = ? WHERE id = ?`).bind(errorCode, completedAt, completedAt, runId).run();
  return runFromRow(await db.prepare("SELECT * FROM data_metric_calculation_runs WHERE id = ?").bind(runId).first());
}

export async function listCurrentResults(db, query = {}) {
  const conditions = ["is_current = 1"];
  const bindings = [];
  for (const [condition, value] of [
    ["definition_id = ?", query.definitionId],
    ["metric_code = ?", query.metricCode],
    ["period_start >= ?", query.from],
    ["period_end <= ?", query.to],
    ["calculation_run_id = ?", query.calculationRunId]
  ]) {
    if (value) {
      conditions.push(condition);
      bindings.push(value);
    }
  }
  const result = await db.prepare(`SELECT * FROM data_metric_results WHERE ${conditions.join(" AND ")}
    ORDER BY period_start, metric_code, dimensions_json`).bind(...bindings).all();
  return (result?.results || []).map(resultFromRow);
}
