import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { reduceEcommerceOperationsState } from "../../../src/domain/ecommerceOperations.js";
import { actor, canViewOperations, isOperationsManager } from "./_shared/access.js";
import { operationsDatabase, readOperationsState, writeOperationsState } from "./_shared/storage.js";

const MANAGER_ACTIONS = new Set(["create_cycle", "review_plan", "review_execution", "upsert_responsibility", "upsert_playbook", "respond_collaboration"]);

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  if (!canViewOperations(data.session) || data.session.role === "readonly") return jsonResponse({ message: "当前账号无权修改经营数据。" }, 403);
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (!action?.type) return jsonResponse({ message: "缺少经营动作。" }, 400);
  if (MANAGER_ACTIONS.has(action.type) && !isOperationsManager(data.session)) return jsonResponse({ message: "该动作需要运营主管权限。" }, 403);
  const db = operationsDatabase(env);
  if (!db) return jsonResponse({ message: "缺少 D1 数据库绑定。" }, 501);
  try {
    const current = await readOperationsState(db);
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== current.revision) return jsonResponse({ message: "数据已更新，请刷新后重试。", code: "REVISION_CONFLICT" }, 409);
    const user = actor(data.session);
    if (action.type === "upsert_plan" && !isOperationsManager(data.session)) action.record = { ...action.record, ownerId: user.userId, ownerName: user.name };
    const next = reduceEcommerceOperationsState(current, { ...action, actor: user });
    return jsonResponse({ state: await writeOperationsState(db, next, user.name), synced: true });
  } catch (error) { return jsonResponse({ message: error.message || "经营动作保存失败。" }, error.status || 400); }
}
