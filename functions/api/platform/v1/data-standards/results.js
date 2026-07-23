import { dataStandardActor, requireDefinitionView } from "../_shared/dataStandardsAuthorization.js";
import { DataStandardsHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, requireDatabase, requireSession } from "../_shared/dataStandardsHttp.js";
import { dataStandardsDatabase, ensureDataStandardsTables, getCalculationRun, listCurrentResults } from "../_shared/dataStandardsStorage.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const METRIC_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

function invalid(message) {
  throw new DataStandardsHttpError(400, "DATA_STANDARD_QUERY_RANGE_INVALID", message);
}

function parseDate(value) {
  if (!DATE_PATTERN.test(value)) return Number.NaN;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return Number.NaN;
  return Date.parse(`${value}T00:00:00+08:00`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function parseQuery(request) {
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["metricCodes", "from", "to", "runId", "dimensions"]);
  if ([...params.keys()].some(key => !allowed.has(key))) invalid("结果查询包含不支持的参数。");
  const metricCodes = [...new Set(String(params.get("metricCodes") || "").split(",").map(value => value.trim()).filter(Boolean))];
  const from = String(params.get("from") || "");
  const to = String(params.get("to") || "");
  const runId = String(params.get("runId") || "");
  const fromTime = parseDate(from);
  const toTime = parseDate(to);
  if (metricCodes.length > 11 || metricCodes.some(code => code.length > 120 || !METRIC_CODE_PATTERN.test(code)) || runId.length > 160
    || (from || to) && (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || !Number.isFinite(fromTime) || !Number.isFinite(toTime) || from > to)) {
    invalid("结果查询参数或日期范围无效。");
  }
  if (from && (toTime - fromTime) / 86400000 > 369) invalid("结果查询最多支持 370 天。");
  let dimensions = null;
  if (params.has("dimensions")) {
    try {
      const rawDimensions = String(params.get("dimensions") || "{}");
      if (rawDimensions.length > 4000) invalid("结果维度参数过长。");
      dimensions = canonical(JSON.parse(rawDimensions));
    } catch {
      invalid("结果维度参数无效。");
    }
    if (!dimensions || Array.isArray(dimensions) || typeof dimensions !== "object") invalid("结果维度参数无效。");
  }
  return { metricCodes, from, to, runId, dimensions };
}

function publicRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    progress: run.progress,
    errorCode: run.errorCode,
    from: run.rangeStart,
    to: run.rangeEnd,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt
  };
}

function publicResult(result) {
  return {
    metricCode: result.metricCode,
    value: result.value,
    unit: result.unit,
    version: result.definitionVersion,
    from: result.periodStart,
    to: result.periodEnd,
    dimensions: result.dimensions,
    coverageRate: result.coverageRate,
    confidence: result.confidence,
    estimated: result.estimated,
    cutoffAt: result.dataCutoffAt,
    status: result.status,
    reasonCode: result.reason || ""
  };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse(["GET", "OPTIONS"]);
  if (request.method !== "GET") return methodNotAllowed();
  try {
    const actor = dataStandardActor(requireSession(data));
    requireDefinitionView(actor);
    const query = parseQuery(request);
    const db = requireDatabase(dataStandardsDatabase(env, data));
    await ensureDataStandardsTables(db);
    let results = await listCurrentResults(db, {
      metricCodes: query.metricCodes,
      from: query.from,
      to: query.to,
      calculationRunId: query.runId
    });
    if (query.dimensions) {
      const expected = JSON.stringify(query.dimensions);
      results = results.filter(result => JSON.stringify(canonical(result.dimensions)) === expected);
    }
    const run = query.runId ? await getCalculationRun(db, query.runId) : null;
    const missingReason = run?.status === "pending" || run?.status === "running"
      ? "CALCULATION_PENDING"
      : run?.status === "failed" ? run.errorCode || "DATA_STANDARD_CALCULATION_FAILED" : "RESULT_NOT_AVAILABLE";
    return jsonResponse({
      synced: true,
      run: publicRun(run),
      results: results.map(publicResult),
      ...(results.length ? {} : { missing: { reasonCode: missingReason, message: "当前范围还没有有效计算结果。" } })
    });
  } catch (error) {
    return errorResponse(error);
  }
}
