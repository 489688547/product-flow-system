import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { filterPerformanceState } from "./performance-management/_shared/access.js";
import { performanceDatabase, readPerformanceState } from "./performance-management/_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  const db = performanceDatabase(env, data); if (!db) return jsonResponse({ message: "缺少 D1 数据库绑定。" }, 501);
  try { return jsonResponse({ state: filterPerformanceState(await readPerformanceState(db), data.session), synced: true }); }
  catch (error) { return jsonResponse({ message: error.message || "绩效数据读取失败。" }, 500); }
}
