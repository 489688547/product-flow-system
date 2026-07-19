import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { canViewOperations, filterOperationsStateForSession } from "./ecommerce-operations/_shared/access.js";
import { operationsDatabase, readOperationsState } from "./ecommerce-operations/_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  if (!canViewOperations(data.session)) return jsonResponse({ message: "当前部门无权访问电商店铺运营。" }, 403);
  const db = operationsDatabase(env);
  if (!db) return jsonResponse({ message: "缺少 D1 数据库绑定。" }, 501);
  try { return jsonResponse({ state: filterOperationsStateForSession(await readOperationsState(db), data.session), synced: true }); }
  catch (error) { return jsonResponse({ message: error.message || "经营数据读取失败。" }, 500); }
}
