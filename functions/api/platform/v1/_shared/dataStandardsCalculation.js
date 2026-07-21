import { orderMetricDependencies, resolveEffectiveVersion } from "../../../../../src/domain/dataStandards.js";
import { compileDataStandard } from "./dataStandardsCompiler.js";
import { failCalculationRun, writeCalculationBatch } from "./dataStandardsStorage.js";

function resultMeta(value, rowCount = 0, dataCutoffAt = "", reasonCode = "") {
  const complete = value != null && rowCount > 0;
  return {
    value: value == null ? null : Number(value),
    rowCount,
    coverageRate: rowCount > 0 ? 1 : 0,
    confidence: complete ? "high" : "unavailable",
    estimated: false,
    status: complete ? "complete" : "incomplete",
    reasonCode: complete ? "" : reasonCode || "DATA_NOT_COVERED",
    dataCutoffAt: dataCutoffAt || ""
  };
}

function filterSql(filter, bindings) {
  const column = filter.column;
  if (filter.operation === "equals") {
    bindings.push(filter.value);
    return `${column} = ?`;
  }
  if (filter.operation === "contains") {
    bindings.push(`%${String(filter.value ?? "")}%`);
    return `${column} LIKE ?`;
  }
  if (["in", "not_in"].includes(filter.operation)) {
    const values = Array.isArray(filter.value) ? filter.value : [];
    if (!values.length) return filter.operation === "in" ? "1 = 0" : "1 = 1";
    bindings.push(...values);
    return `${column} ${filter.operation === "in" ? "IN" : "NOT IN"} (${values.map(() => "?").join(", ")})`;
  }
  if (filter.operation === "between") {
    const values = Array.isArray(filter.value) ? filter.value.slice(0, 2) : [];
    if (values.length !== 2) return "1 = 0";
    bindings.push(...values);
    return `${column} BETWEEN ? AND ?`;
  }
  if (filter.operation === "is_null") return `${column} IS NULL`;
  if (filter.operation === "not_null") return `${column} IS NOT NULL`;
  throw Object.assign(new Error("不支持的安全过滤条件。"), { code: "DATA_STANDARD_INVALID", status: 400 });
}

async function executeAggregate(db, plan, from, to) {
  if (plan.source !== "product_sales_daily") {
    return resultMeta(null, 0, "", "DATA_NOT_COVERED");
  }
  const bindings = [from, to];
  const conditions = [
    "date >= ?",
    "date <= ?",
    "TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')",
    ...plan.filters.map(filter => filterSql(filter, bindings))
  ];
  const row = await db.prepare(`SELECT SUM(${plan.column}) AS aggregate_value,
    COUNT(*) AS row_count, MAX(date) AS data_cutoff_at
    FROM product_sales_daily WHERE ${conditions.join(" AND ")}`).bind(...bindings).first();
  return resultMeta(row?.aggregate_value ?? null, Number(row?.row_count || 0), row?.data_cutoff_at || "");
}

function mergeMeta(left, right) {
  return {
    rowCount: Math.min(left.rowCount ?? 0, right.rowCount ?? 0),
    coverageRate: Math.min(left.coverageRate ?? 0, right.coverageRate ?? 0),
    dataCutoffAt: [left.dataCutoffAt, right.dataCutoffAt].filter(Boolean).sort()[0] || "",
    estimated: Boolean(left.estimated || right.estimated)
  };
}

async function executePlan(db, plan, from, to, dependencyResults) {
  if (plan.type === "aggregate") return executeAggregate(db, plan, from, to);
  if (plan.type === "constant") return resultMeta(plan.value, 1, to);
  if (plan.type === "metric") {
    return dependencyResults.get(plan.metricCode) || resultMeta(null, 0, "", "DATA_NOT_COVERED");
  }
  if (plan.type !== "arithmetic") return resultMeta(null, 0, "", "DATA_NOT_COVERED");
  const left = await executePlan(db, plan.left, from, to, dependencyResults);
  const right = await executePlan(db, plan.right, from, to, dependencyResults);
  const meta = mergeMeta(left, right);
  if (left.value == null || right.value == null) return { ...resultMeta(null, meta.rowCount, meta.dataCutoffAt, left.reasonCode || right.reasonCode), ...meta };
  if (plan.operation === "divide" && right.value === 0) return { ...resultMeta(null, meta.rowCount, meta.dataCutoffAt, "DIVISION_BY_ZERO"), ...meta };
  const value = plan.operation === "add" ? left.value + right.value
    : plan.operation === "subtract" ? left.value - right.value
      : plan.operation === "multiply" ? left.value * right.value
        : left.value / right.value;
  return { ...resultMeta(value, meta.rowCount, meta.dataCutoffAt), ...meta, confidence: "high", status: "complete", reasonCode: "" };
}

export async function calculateMetricRange({ db, definition, version, from, to, dependencyResults = new Map() }) {
  const base = {
    definitionId: definition.id,
    metricCode: definition.metricCode,
    definitionVersion: Number(version?.version || 0),
    version: Number(version?.version || 0),
    from,
    to,
    unit: version?.unit || definition.unit,
    dimensions: {}
  };
  const plan = compileDataStandard(version, { definitions: [definition] });
  if (plan.type === "uncovered") {
    return { ...base, ...resultMeta(null, 0, "", "DATA_NOT_COVERED"), status: "data_not_covered" };
  }
  return { ...base, ...await executePlan(db, plan, from, to, dependencyResults) };
}

export async function calculateMetricSet({ db, definitions = [], from, to, targetVersions = {} }) {
  const selected = definitions.map(definition => {
    const requestedVersion = targetVersions?.[definition.metricCode];
    const version = requestedVersion == null
      ? resolveEffectiveVersion(definition.versions || [], to)
      : (definition.versions || []).find(item => Number(item.version) === Number(requestedVersion)) || null;
    return { definition, version };
  }).filter(item => item.version);
  const graphDefinitions = selected.map(({ definition, version }) => ({ ...definition, formulaAst: version.formulaAst }));
  const ordered = orderMetricDependencies(graphDefinitions);
  const byCode = new Map(selected.map(item => [item.definition.metricCode, item]));
  const dependencyResults = new Map();
  for (const metricCode of ordered) {
    const item = byCode.get(metricCode);
    if (!item) continue;
    const result = await calculateMetricRange({ db, definition: item.definition, version: item.version, from, to, dependencyResults });
    dependencyResults.set(metricCode, result);
  }
  return [...dependencyResults.values()];
}

export async function executeCalculationRun({ db, run, definitions, from, to, targetVersions = {} }) {
  try {
    const calculated = await calculateMetricSet({ db, definitions, from, to, targetVersions });
    const createdAt = new Date().toISOString();
    const results = calculated.map(result => ({
      id: `${run.id}:${result.definitionId}:${result.definitionVersion}`,
      definitionId: result.definitionId,
      definitionVersion: result.definitionVersion,
      metricCode: result.metricCode,
      periodStart: from,
      periodEnd: to,
      dimensions: result.dimensions || {},
      value: result.value,
      unit: result.unit,
      coverageRate: result.coverageRate,
      confidence: result.confidence,
      estimated: result.estimated,
      status: result.status,
      reason: result.reasonCode || "",
      dataCutoffAt: result.dataCutoffAt,
      createdAt
    }));
    await writeCalculationBatch(db, { ...run, completedAt: createdAt }, results);
    return { ...run, status: "succeeded", progress: 100, results };
  } catch (error) {
    await failCalculationRun(db, run.id, error?.code || "DATA_STANDARD_CALCULATION_FAILED");
    return { ...run, status: "failed", errorCode: error?.code || "DATA_STANDARD_CALCULATION_FAILED" };
  }
}
