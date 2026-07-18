import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { reducePerformanceState } from "../../../src/domain/performanceManagement.js";
import { actor, currentUserId, isHr, isManager } from "./_shared/access.js";
import { performanceDatabase, readPerformanceState, writePerformanceState } from "./_shared/storage.js";

const HR_ACTIONS = new Set(["upsert_template", "freeze_assessment", "append_correction"]);
const MANAGER_ACTIONS = new Set(["create_assessment", "manager_score"]);

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  if (data.session.role === "readonly") return jsonResponse({ message: "只读账号不能修改绩效数据。" }, 403);
  const body = await request.json().catch(() => ({})); const action = body.action;
  if (!action?.type) return jsonResponse({ message: "缺少绩效动作。" }, 400);
  if (HR_ACTIONS.has(action.type) && !isHr(data.session)) return jsonResponse({ message: "该动作需要人事权限。" }, 403);
  if (MANAGER_ACTIONS.has(action.type) && !isManager(data.session)) return jsonResponse({ message: "该动作需要主管权限。" }, 403);
  const db = performanceDatabase(env); if (!db) return jsonResponse({ message: "缺少 D1 数据库绑定。" }, 501);
  try {
    const state = await readPerformanceState(db);
    const assessment = state.assessments.find(item => item.id === action.id);
    if (["submit_self_review", "request_review"].includes(action.type) && assessment?.employeeId !== currentUserId(data.session)) return jsonResponse({ message: "只能操作自己的绩效。" }, 403);
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== state.revision) return jsonResponse({ message: "数据已更新，请刷新后重试。", code: "REVISION_CONFLICT" }, 409);
    const user = actor(data.session); const next = reducePerformanceState(state, { ...action, actor: user });
    return jsonResponse({ state: await writePerformanceState(db, next, user.name), synced: true });
  } catch (error) { return jsonResponse({ message: error.message || "绩效动作保存失败。" }, error.status || 400); }
}
