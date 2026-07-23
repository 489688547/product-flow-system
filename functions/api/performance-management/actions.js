import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { reducePerformanceState } from "../../../src/domain/performanceManagement.js";
import { buildPerformanceEvidence } from "../../../src/domain/ecommerceOperations.js";
import { operationsDatabase, readOperationsState } from "../ecommerce-operations/_shared/storage.js";
import { actor, canManageEmployee, currentUserId, filterPerformanceState, isHr, isManager } from "./_shared/access.js";
import { performanceDatabase, readPerformanceState, writePerformanceState } from "./_shared/storage.js";

const HR_ACTIONS = new Set(["upsert_template", "upsert_manager_assignment", "freeze_assessment", "append_correction"]);
const MANAGER_ACTIONS = new Set(["create_assessment", "manager_score", "resolve_review"]);
const EMPLOYEE_ACTIONS = new Set(["submit_self_review", "confirm_result", "request_review"]);
const ACTIONS = new Set([...HR_ACTIONS, ...MANAGER_ACTIONS, ...EMPLOYEE_ACTIONS]);

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  if (data.session.role === "readonly") return jsonResponse({ message: "只读账号不能修改绩效数据。" }, 403);
  const body = await request.json().catch(() => ({})); const action = body.action;
  if (!action?.type) return jsonResponse({ message: "缺少绩效动作。" }, 400);
  if (!ACTIONS.has(action.type)) return jsonResponse({ message: "不支持的绩效动作。" }, 400);
  if (HR_ACTIONS.has(action.type) && !isHr(data.session)) return jsonResponse({ message: "该动作需要人事权限。" }, 403);
  if (MANAGER_ACTIONS.has(action.type) && (!isManager(data.session) || isHr(data.session))) return jsonResponse({ message: "该动作需要直属主管权限，人事仅负责授权和归档。" }, 403);
  const db = performanceDatabase(env, data); if (!db) return jsonResponse({ message: "缺少 D1 数据库绑定。" }, 501);
  try {
    const state = await readPerformanceState(db);
    const assessment = state.assessments.find(item => item.id === action.id);
    if (["submit_self_review", "confirm_result", "request_review"].includes(action.type) && assessment?.employeeId !== currentUserId(data.session)) return jsonResponse({ message: "只能操作自己的绩效。" }, 403);
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== state.revision) return jsonResponse({ message: "数据已更新，请刷新后重试。", code: "REVISION_CONFLICT" }, 409);
    const user = actor(data.session);
    if (action.type === "create_assessment") {
      if (!canManageEmployee(state, data.session, action.record?.employeeId)) return jsonResponse({ message: "只能为人事已授权或钉钉组织范围内的员工建立考核。" }, 403);
      const operationsDb = operationsDatabase(env, data);
      const operationsState = operationsDb ? await readOperationsState(operationsDb) : null;
      const evidence = operationsState ? buildPerformanceEvidence(operationsState, { employeeId: action.record.employeeId, month: action.record.month }) : [];
      const evidenceById = new Map(evidence.map(item => [item.entityId, item]));
      const retrievedAt = new Date().toISOString();
      const items = (action.record.items || []).map(item => {
        const requested = (item.evidenceRefs || []).map(ref => evidenceById.get(ref.entityId)).filter(Boolean);
        if ((item.evidenceRefs || []).length && !requested.length) throw new Error("关联的经营任务未验收、人员不匹配或月份不一致。");
        return {
          ...item,
          actual: null,
          evidenceRefs: requested.map(record => ({ ...record, retrievedAt }))
        };
      });
      action.record = { ...action.record, items, managerId: user.userId, managerName: user.name };
    }
    if (["manager_score", "resolve_review"].includes(action.type) && assessment?.managerId !== user.userId) return jsonResponse({ message: "只能评估自己负责的员工。" }, 403);
    const next = reducePerformanceState(state, { ...action, actor: user });
    const saved = await writePerformanceState(db, next, user.name);
    return jsonResponse({ state: filterPerformanceState(saved, data.session), synced: true });
  } catch (error) { return jsonResponse({ message: error.message || "绩效动作保存失败。" }, error.status || 400); }
}
