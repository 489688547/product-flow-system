import {
  createDingTodoTask,
  getDingAccessToken,
  jsonResponse,
  optionsResponse
} from "../_shared/dingtalk.js";
import { shouldSimulateExternalAction } from "../../platform/_shared/externalActionMode.js";
import {
  auditDisplayExternalAction,
  simulateDingTodo
} from "../../platform/_shared/displayExternalActionAdapter.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    if (shouldSimulateExternalAction(data)) {
      const todo = simulateDingTodo(body);
      await auditDisplayExternalAction({ env, data, kind: "dingtalk_todo_create", resultId: todo.id });
      return jsonResponse({ synced: true, todo });
    }
    const accessToken = await getDingAccessToken(env);
    const todo = await createDingTodoTask(accessToken, body);
    return jsonResponse({ synced: true, todo });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉待办同步失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
