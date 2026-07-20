import { executeCalculationRun } from "../_shared/dataStandardsCalculation.js";
import { dataStandardActor, requireDefinitionView, requireRecalculation } from "../_shared/dataStandardsAuthorization.js";
import { DataStandardsHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireDatabase, requireSession } from "../_shared/dataStandardsHttp.js";
import { createCalculationRun, dataStandardsDatabase, ensureDataStandardsTables, getDefinitionDetail, listDefinitions } from "../_shared/dataStandardsStorage.js";
import { resolveEffectiveVersion } from "../../../../../src/domain/dataStandards.js";
import { ensureSalesTables } from "../../../sales.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const METRIC_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const MODES = new Set(["ensure_current", "explicit_recalculation"]);
const ALLOWED_FIELDS = new Set(["metricCodes", "from", "to", "targetVersions", "mode", "confirmed", "idempotencyKey"]);

function id(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
}

function invalid(message, code = "DATA_STANDARD_INVALID") {
  throw new DataStandardsHttpError(400, code, message);
}

function parseDate(value) {
  if (!DATE_PATTERN.test(value)) return Number.NaN;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return Number.NaN;
  return Date.parse(`${value}T00:00:00+08:00`);
}

function validateInput(body) {
  if (Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) invalid("重算请求包含不支持的字段。");
  const metricCodes = [...new Set((Array.isArray(body.metricCodes) ? body.metricCodes : []).map(value => String(value || "").trim()).filter(Boolean))];
  const from = String(body.from || "");
  const to = String(body.to || "");
  const mode = String(body.mode || "ensure_current");
  if (!metricCodes.length || metricCodes.length > 11 || metricCodes.some(code => code.length > 120 || !METRIC_CODE_PATTERN.test(code))
    || !MODES.has(mode) || !DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    invalid("重算指标或日期范围无效。", "DATA_STANDARD_QUERY_RANGE_INVALID");
  }
  const fromTime = parseDate(from);
  const toTime = parseDate(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime || (toTime - fromTime) / 86400000 > 369) {
    invalid("重算日期范围最多 370 天。", "DATA_STANDARD_QUERY_RANGE_INVALID");
  }
  if (mode === "explicit_recalculation" && body.confirmed !== true) invalid("显式历史重算需要再次确认。");
  const targetVersions = body.targetVersions && typeof body.targetVersions === "object" && !Array.isArray(body.targetVersions)
    ? Object.fromEntries(Object.entries(body.targetVersions).map(([code, version]) => {
      if (code.length > 120 || !METRIC_CODE_PATTERN.test(code) || !Number.isInteger(version) || version < 1) invalid("目标版本无效。");
      return [code, version];
    }))
    : {};
  return { metricCodes, from, to, mode, targetVersions };
}

async function loadDefinitionDetails(db) {
  return Promise.all((await listDefinitions(db, { status: "active" })).map(definition => getDefinitionDetail(db, definition.id)));
}

function includeDependencies(details, requestedCodes, targetVersions, periodEnd) {
  const byCode = new Map(details.map(detail => [detail.metricCode, detail]));
  const included = new Map();
  function visit(code, depth = 1) {
    if (depth > 8) invalid("口径依赖深度超过限制。");
    if (included.has(code)) return;
    const detail = byCode.get(code);
    if (!detail) invalid(`未找到数据口径：${code}`);
    const target = targetVersions[code];
    const version = target == null
      ? resolveEffectiveVersion(detail.versions, periodEnd)
      : detail.versions.find(item => item.version === target);
    if (!version) invalid(`未找到目标口径版本：${code}`);
    included.set(code, detail);
    for (const dependency of version.dependencies || []) visit(dependency, depth + 1);
  }
  requestedCodes.forEach(code => visit(code));
  if (included.size > 11) invalid("单次计算最多支持 11 项指标（含依赖）。", "DATA_STANDARD_QUERY_RANGE_INVALID");
  if (Object.keys(targetVersions).some(code => !included.has(code))) invalid("目标版本包含本次计算范围之外的口径。");
  return [...included.values()];
}

async function factWatermark(db, from, to) {
  const row = await db.prepare(`SELECT MAX(date) AS fact_watermark, COUNT(*) AS fact_rows
    FROM product_sales_daily WHERE date >= ? AND date <= ?
      AND TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')`).bind(from, to).first();
  return `${row?.fact_watermark || "none"}:${Number(row?.fact_rows || 0)}`;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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

export async function onRequest(context) {
  const { request, env, data = {} } = context;
  if (request.method === "OPTIONS") return optionsResponse(["POST", "OPTIONS"]);
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const actor = dataStandardActor(requireSession(data));
    requireDefinitionView(actor);
    const input = validateInput(await readJson(request));
    const db = requireDatabase(dataStandardsDatabase(env));
    await ensureDataStandardsTables(db);
    await ensureSalesTables(db);
    const definitions = includeDependencies(await loadDefinitionDetails(db), input.metricCodes, input.targetVersions, input.to);
    if (input.mode === "explicit_recalculation") requireRecalculation(actor, definitions);
    const selectedVersions = Object.fromEntries(definitions.map(definition => [
      definition.metricCode,
      input.targetVersions[definition.metricCode]
        || resolveEffectiveVersion(definition.versions, input.to)?.version
        || definition.currentVersion
    ]));
    for (const definition of definitions) {
      if (!definition.versions.some(version => version.version === selectedVersions[definition.metricCode])) {
        invalid(`未找到目标口径版本：${definition.metricCode}`);
      }
    }
    const serverKey = await digest(JSON.stringify({
      metricCodes: [...input.metricCodes].sort(),
      from: input.from,
      to: input.to,
      mode: input.mode,
      targetVersions: Object.fromEntries(Object.entries(selectedVersions).sort(([left], [right]) => left.localeCompare(right))),
      factWatermark: await factWatermark(db, input.from, input.to)
    }));
    const requestedRunId = id("metric_run");
    const run = await createCalculationRun(db, {
      id: requestedRunId,
      idempotencyKey: serverKey,
      definitionIds: definitions.map(definition => definition.id),
      rangeStart: input.from,
      rangeEnd: input.to,
      targetVersion: null,
      status: "pending",
      requestedBy: actor.id
    });
    if (run.id === requestedRunId && run.status === "pending") {
      const promise = executeCalculationRun({
        db,
        run,
        definitions,
        from: input.from,
        to: input.to,
        targetVersions: selectedVersions
      });
      if (typeof context.waitUntil === "function") context.waitUntil(promise);
      else void promise;
    }
    return jsonResponse({ synced: true, run: publicRun(run) }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
