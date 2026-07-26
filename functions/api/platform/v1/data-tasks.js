import { jsonResponse, optionsResponse } from "../../dingtalk/_shared/dingtalk.js";
import { controlDatabase } from "../_shared/dataEnvironment.js";

const VIEW_DEPARTMENTS = new Set([
  "总经办", "数据中心", "数据部", "运营部", "运营", "供应链部", "供应链",
  "供应链团队", "采购部", "财务部", "财务", "质量管理部", "产品部", "仓库", "仓储部"
]);

function departments(session = {}) {
  return [...new Set([
    session.department,
    session.departmentName,
    ...(Array.isArray(session.departments) ? session.departments : []),
    ...(Array.isArray(session.departmentNames) ? session.departmentNames : [])
  ].flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/)).map(value => value.trim()).filter(Boolean))];
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `data-tasks-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorResponse(message, status, code, retryable = false) {
  return jsonResponse({
    synced: false,
    error: { code, message, requestId: requestId(), retryable }
  }, status);
}

function recoveryAction(status, errorCode) {
  if (status === "waiting_human" || /LOGIN|VERIFY|CAPTCHA|SLIDER|SMS/.test(String(errorCode || ""))) {
    return "open_dedicated_browser";
  }
  if (status === "failed") return "retry_collection";
  return null;
}

function webTask(row) {
  return {
    id: `web:${row.id}`,
    kind: "web_collection",
    providerId: String(row.provider_id || ""),
    resourceType: String(row.resource_type || ""),
    businessDate: String(row.business_date || ""),
    status: String(row.status || "unknown"),
    stage: String(row.stage || "queued"),
    attempt: Number(row.attempt) || 0,
    rowCount: null,
    errorCode: row.error_code || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
    recoveryAction: recoveryAction(row.status, row.error_code)
  };
}

function erpTask(row) {
  const completed = row.status === "completed";
  return {
    id: `erp:${row.id}`,
    kind: "erp_batch",
    providerId: String(row.platform_id || ""),
    resourceType: String(row.resource_type || ""),
    businessDate: String(row.range_end || row.collected_at || "").slice(0, 10),
    status: String(row.status || "unknown"),
    stage: completed ? "projected" : "ingesting",
    attempt: 1,
    rowCount: Number(row.row_count) || 0,
    errorCode: null,
    updatedAt: row.updated_at || null,
    completedAt: row.imported_at || null,
    recoveryAction: completed ? null : recoveryAction(row.status, null)
  };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  const session = data.session;
  if (!session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  if (session.role !== "executive" && !departments(session).some(value => VIEW_DEPARTMENTS.has(value))) {
    return errorResponse("当前部门无权查看数据任务。", 403, "DATA_TASKS_VIEW_DENIED");
  }
  let db;
  try {
    db = controlDatabase(env);
  } catch {
    return errorResponse("数据任务控制数据库暂不可用。", 501, "DATA_TASKS_STORAGE_UNAVAILABLE", true);
  }
  try {
    const [web, erp] = await Promise.all([
      db.prepare(`SELECT id, provider_id, resource_type, business_date, status, stage, attempt,
          error_code, updated_at, completed_at
        FROM web_collection_jobs ORDER BY updated_at DESC LIMIT 500`).all(),
      db.prepare(`SELECT id, platform_id, resource_type, range_end, collected_at, status, row_count,
          updated_at, imported_at
        FROM erp_collection_batches ORDER BY updated_at DESC LIMIT 500`).all()
    ]);
    const url = new URL(request.url);
    const providerId = String(url.searchParams.get("providerId") || "");
    const resourceType = String(url.searchParams.get("resourceType") || "");
    const status = String(url.searchParams.get("status") || "");
    const cursor = Number(url.searchParams.get("cursor") || 0);
    if (!Number.isInteger(cursor) || cursor < 0 || [providerId, resourceType, status].some(value => value.length > 160)) {
      return errorResponse("数据任务筛选无效。", 400, "DATA_TASKS_QUERY_INVALID");
    }
    const all = [
      ...(web?.results || []).map(webTask),
      ...(erp?.results || []).map(erpTask)
    ].filter(item => (
      (!providerId || item.providerId === providerId)
      && (!resourceType || item.resourceType === resourceType)
      && (!status || item.status === status)
    )).sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    const pageSize = 500;
    const items = all.slice(cursor, cursor + pageSize);
    const completed = all.filter(item => ["completed", "success"].includes(item.status));
    const failed = all.filter(item => !["completed", "success"].includes(item.status));
    return jsonResponse({
      synced: true,
      items,
      quality: {
        status: !all.length ? "unavailable" : failed.length ? "partial" : "trusted",
        lastSuccessfulSyncAt: completed.map(item => item.completedAt).filter(Boolean).sort().at(-1) || null,
        coverage: all.length ? completed.length / all.length : 0,
        confidence: failed.length ? "partial" : all.length ? "complete" : "insufficient",
        missing: failed.map(item => `${item.providerId}:${item.resourceType}`)
      },
      page: { nextCursor: cursor + items.length < all.length ? String(cursor + items.length) : null },
      meta: { requestId: requestId(), version: 1 }
    });
  } catch {
    return errorResponse("数据任务读取失败。", 500, "DATA_TASKS_QUERY_FAILED", true);
  }
}
