import { detectLatestSalesAnomaly } from "../../../../../src/domain/dataCenter.js";
import { salesDatabase } from "../../../sales.js";
import { defaultSalesRepairDependencies, repairRunId, SALES_REPAIR_RULE_VERSION } from "./_shared/salesRepair.js";

const WRITE_DEPARTMENTS = new Set(["总经办", "运营部", "运营"]);

function jsonResponse(payload, status = 200) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
  const retryable = Boolean(payload?.error?.retryable);
  const body = {
    ...payload,
    requestId,
    retryable,
    ...(payload?.error ? { error: { ...payload.error, requestId, retryable } } : {})
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function departments(session = {}) {
  return [session.department, session.departmentName, ...(session.departments || [])]
    .flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(value => value.trim())
    .filter(Boolean);
}

function canRepair(session = {}) {
  if (session.readonly === true || session.role === "readonly") return false;
  return session.role === "executive" || departments(session).some(item => WRITE_DEPARTMENTS.has(item));
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function publicRun(run) {
  return run ? {
    id: run.id,
    date: run.date,
    status: run.status,
    attempts: Number(run.attempts) || 0,
    message: run.message || "",
    errorCode: run.errorCode || "",
    startedAt: run.startedAt || "",
    completedAt: run.completedAt || "",
    updatedAt: run.updatedAt || ""
  } : null;
}

export function createSalesRepairRequestHandler(dependencies = defaultSalesRepairDependencies) {
  return async function onSalesRepairRequest(context) {
    const { request, env, data = {} } = context;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
    if (request.method !== "POST") return jsonResponse({ synced: false, message: "Method not allowed", error: { code: "VALIDATION_METHOD_NOT_ALLOWED" } }, 405);
    if (!data.session) return jsonResponse({ synced: false, message: "请先使用钉钉登录。", error: { code: "AUTH_SESSION_REQUIRED" } }, 401);
    if (!canRepair(data.session)) return jsonResponse({ synced: false, message: "当前身份不能自动补拉销售数据。", error: { code: "PERMISSION_WRITE_DENIED" } }, 403);
    const body = await request.json().catch(() => null);
    const date = String(body?.date || "");
    if (!body || !validDate(date)) return jsonResponse({ synced: false, message: "自动补拉日期无效。", error: { code: "SALES_REPAIR_DATE_INVALID" } }, 400);
    const db = salesDatabase(env, data);
    if (!db) return jsonResponse({ synced: false, message: "销售数据存储暂不可用。", error: { code: "DATA_STORAGE_UNAVAILABLE", retryable: true } }, 501);

    try {
      await dependencies.ensure(db);
      const latestDailyFacts = await dependencies.latestFacts(db);
      const anomaly = detectLatestSalesAnomaly(latestDailyFacts);
      if (anomaly.status !== "anomaly" || anomaly.date !== date) {
        return jsonResponse({ synced: true, scheduled: false, reason: "not_anomalous", anomaly });
      }
      const existing = await dependencies.getRun(db, date);
      if (existing && (["running", "success", "manual_required"].includes(existing.status) || Number(existing.attempts) >= 2)) {
        return jsonResponse({ synced: true, scheduled: false, run: publicRun(existing), anomaly });
      }
      const now = new Date().toISOString();
      const run = {
        id: repairRunId(date),
        sourceId: "kuaimai",
        sourceName: "快麦 ERP",
        date,
        from: date,
        to: date,
        status: "running",
        attempts: Number(existing?.attempts || 0) + 1,
        trigger: "sales_completeness_auto_repair",
        ruleVersion: SALES_REPAIR_RULE_VERSION,
        message: "检测到最新日数据疑似截断，正在自动补拉。",
        errorCode: "",
        requestedBy: String(data.session.name || data.session.userId || "系统自动修复").slice(0, 80),
        startedAt: now,
        updatedAt: now,
        completedAt: "",
        before: anomaly
      };
      await dependencies.putRun(db, run);
      const task = dependencies.execute({ db, env, date, run });
      if (typeof context.waitUntil === "function") context.waitUntil(task);
      else void task;
      return jsonResponse({ synced: true, scheduled: true, run: publicRun(run), anomaly }, 202);
    } catch (error) {
      return jsonResponse({
        synced: false,
        message: "自动补拉任务创建失败，请稍后重试。",
        error: { code: error.code || "SALES_REPAIR_SCHEDULE_FAILED", retryable: true }
      }, 500);
    }
  };
}

export const onRequest = createSalesRepairRequestHandler();
