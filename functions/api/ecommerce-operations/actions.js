import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { reduceEcommerceOperationsState } from "../../../src/domain/ecommerceOperations.js";
import { actor, canViewOperations, department, filterOperationsStateForSession, isDepartmentManager, isOperationsManager, isOperationsMember } from "./_shared/access.js";
import { operationsDatabase, readOperationsState, writeOperationsState } from "./_shared/storage.js";

const MANAGER_ACTIONS = new Set(["create_cycle", "review_plan", "review_execution", "upsert_responsibility", "upsert_playbook"]);
const OPERATIONS_ACTIONS = new Set(["upsert_plan", "submit_plan", "record_ai_review", "append_execution", "upsert_collaboration"]);
const ACTIONS = new Set([...MANAGER_ACTIONS, ...OPERATIONS_ACTIONS, "respond_collaboration"]);

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  if (!canViewOperations(data.session) || data.session.role === "readonly") return jsonResponse({ message: "当前账号无权修改经营数据。" }, 403);
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (!action?.type) return jsonResponse({ message: "缺少经营动作。" }, 400);
  if (!ACTIONS.has(action.type)) return jsonResponse({ message: "不支持的经营动作。" }, 400);
  if (MANAGER_ACTIONS.has(action.type) && !isOperationsManager(data.session)) return jsonResponse({ message: "该动作需要运营主管权限。" }, 403);
  if (OPERATIONS_ACTIONS.has(action.type) && !isOperationsMember(data.session)) return jsonResponse({ message: "该动作仅限运营团队。" }, 403);
  const db = operationsDatabase(env);
  if (!db) return jsonResponse({ message: "缺少 D1 数据库绑定。" }, 501);
  try {
    const current = await readOperationsState(db);
    const user = actor(data.session);
    const existingPlan = current.plans.find(item => item.id === (action.id || (action.type === "record_ai_review" ? action.record?.planId : action.record?.id)));
    if (["upsert_plan", "submit_plan", "record_ai_review"].includes(action.type) && !isOperationsManager(data.session)) {
      const cycle = current.cycles.find(item => item.id === action.record?.cycleId);
      if ((existingPlan && String(existingPlan.ownerId) !== String(user.userId)) || (action.type === "upsert_plan" && (!cycle || String(cycle.ownerId) !== String(user.userId)))) return jsonResponse({ message: "只能维护主管分配给自己的重点产品方案。" }, 403);
    }
    if (action.type === "upsert_plan") action.record = { ...action.record, ownerId: isOperationsManager(data.session) ? action.record.ownerId : user.userId, ownerName: isOperationsManager(data.session) ? action.record.ownerName : user.name, status: existingPlan?.status || "draft", version: existingPlan?.version || 1 };
    if (action.type === "append_execution") {
      const plan = current.plans.find(item => item.id === action.record?.planId);
      if (!plan || plan.status !== "approved" || (!isOperationsManager(data.session) && String(plan.ownerId) !== String(user.userId))) return jsonResponse({ message: "只能为自己已批准的方案提交执行记录。" }, 403);
      action.record = { ...action.record, ownerId: plan.ownerId, ownerName: plan.ownerName, status: "submitted" };
    }
    if (action.type === "upsert_collaboration") {
      const existing = current.collaborations.find(item => item.id === action.record?.id);
      if (existing && !isOperationsManager(data.session) && String(existing.ownerId) !== String(user.userId)) return jsonResponse({ message: "只能修改自己发起的协同事项。" }, 403);
      action.record = { ...action.record, ownerId: user.userId, ownerName: user.name, status: existing?.status || "pending" };
    }
    if (action.type === "respond_collaboration") {
      const collaboration = current.collaborations.find(item => item.id === (action.id || action.record?.id));
      if (!collaboration || (!isOperationsManager(data.session) && (collaboration.targetDepartment !== department(data.session) || !isDepartmentManager(data.session)))) return jsonResponse({ message: "只能由责任部门主管处理协同事项。" }, 403);
      const status = action.record?.status;
      if (!["accepted", "returned"].includes(status)) return jsonResponse({ message: "协同事项只能接受或退回。" }, 400);
      action.record = { id: collaboration.id, status, reason: String(action.record?.reason || "").trim() };
    }
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== current.revision) return jsonResponse({ message: "数据已更新，请刷新后重试。", code: "REVISION_CONFLICT" }, 409);
    const next = reduceEcommerceOperationsState(current, { ...action, actor: user });
    const saved = await writeOperationsState(db, next, user.name);
    return jsonResponse({ state: filterOperationsStateForSession(saved, data.session), synced: true });
  } catch (error) { return jsonResponse({ message: error.message || "经营动作保存失败。" }, error.status || 400); }
}
