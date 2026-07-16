import {
  getDingAccessToken,
  jsonResponse,
  listDingTodoTasks,
  optionsResponse
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const unionId = String(data.session?.unionId || "").trim();
  if (!unionId) return jsonResponse({ synced: false, message: "当前登录账号缺少 unionId。" }, 400);

  try {
    const accessToken = await getDingAccessToken(env);
    const [pending, completed] = await Promise.all([
      listDingTodoTasks(accessToken, unionId, { isDone: false }),
      listDingTodoTasks(accessToken, unionId, { isDone: true })
    ]);
    return jsonResponse({ synced: true, todos: [...pending, ...completed] });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉待办状态查询失败。",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
