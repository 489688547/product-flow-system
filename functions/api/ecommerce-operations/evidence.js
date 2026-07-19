import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { buildPerformanceEvidence } from "../../../src/domain/ecommerceOperations.js";
import { canViewOperationsEvidence, isOperationsManager } from "./_shared/access.js";
import { operationsDatabase, readOperationsState } from "./_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  if (!canViewOperationsEvidence(data.session)) return jsonResponse({ message: "无权读取经营证据。" }, 403);
  const db = operationsDatabase(env);
  if (!db) return jsonResponse({ message: "缺少 D1 数据库绑定。" }, 501);
  const url = new URL(request.url);
  const employeeId = String(url.searchParams.get("employeeId") || "").trim();
  const month = String(url.searchParams.get("month") || "").trim();
  if (!employeeId || (month && !/^\d{4}-\d{2}$/.test(month))) return jsonResponse({ message: "员工或月份无效。" }, 400);
  const sessionId = String(data.session.userId || data.session.userid || data.session.unionId || data.session.name || "");
  const hr = ["人事行政部", "人事部"].includes(String(data.session.department || ""));
  if (employeeId !== sessionId && !isOperationsManager(data.session) && !hr) return jsonResponse({ message: "只能读取自己的经营证据。" }, 403);
  const state = await readOperationsState(db);
  return jsonResponse({ evidence: buildPerformanceEvidence(state, { employeeId, month }), generatedAt: new Date().toISOString() });
}
