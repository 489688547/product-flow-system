import {
  getDingAccessToken,
  jsonResponse,
  optionsResponse,
  syncDingTodoTask
} from "../_shared/dingtalk.js";
import { readCompanyState } from "../../state.js";
import { requestBusinessDatabase } from "../../platform/_shared/dataEnvironment.js";

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function authorizeTaskTodoSyncRequest(input = {}, session = {}, state = {}) {
  if (session.role === "readonly") throw requestError("只读账号不能同步钉钉待办。", 403);
  const creatorUnionId = String(session.unionId || "").trim();
  if (!creatorUnionId) throw requestError("当前登录账号缺少 unionId。", 400);

  const sourceId = String(input.sourceId || "").trim();
  const sourceMatch = sourceId.match(/^task:([^:]+):([^:]+)$/);
  if (!sourceMatch) throw requestError("待办来源标识无效。", 400);
  const [, productId, taskId] = sourceMatch;
  const product = (state.products || []).find(item => String(item.id) === productId);
  const task = (state.tasks || []).find(item => String(item.id) === taskId && String(item.productId) === productId);
  if (!product || !task) throw requestError("待同步的产品任务不存在。", 404);

  const requestedTodoId = String(input.todoId || "").trim();
  const storedTodoId = String(task.dingTodo?.id || "").trim();
  if (requestedTodoId && requestedTodoId !== storedTodoId) {
    throw requestError("待办 ID 与产品任务记录不一致。", 403);
  }
  const productManagerUnionId = String(product.productManagerUnionId || "").trim();
  const {
    creatorUnionId: ignoredCreator,
    operatorUnionId: ignoredOperator,
    resourceUnionId: ignoredResource,
    recoveryUnionIds: ignoredRecovery,
    todoId: ignoredTodoId,
    ...safeInput
  } = input;
  void ignoredCreator;
  void ignoredOperator;
  void ignoredResource;
  void ignoredRecovery;
  void ignoredTodoId;
  return {
    ...safeInput,
    sourceId,
    todoId: storedTodoId,
    creatorUnionId,
    recoveryUnionIds: productManagerUnionId && productManagerUnionId !== creatorUnionId
      ? [productManagerUnionId]
      : []
  };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const db = requestBusinessDatabase({ env, data });
    if (!db) throw requestError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", 501);
    const stored = await readCompanyState(db);
    if (!stored?.state) throw requestError("产品流程共享数据尚未初始化。", 409);
    const authorizedBody = authorizeTaskTodoSyncRequest(body, data.session, stored.state);
    const accessToken = await getDingAccessToken(env);
    const todo = await syncDingTodoTask(accessToken, authorizedBody);
    return jsonResponse({ synced: true, todo });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉待办同步失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
