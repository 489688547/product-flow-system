export function createDingTalkTodoRefreshController({ fetchImpl = fetch, onTodos }) {
  let latestRequest = 0;

  return {
    async refresh() {
      const request = ++latestRequest;
      const response = await fetchImpl("/api/dingtalk/todo/list");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.synced) {
        throw new Error(payload.message || "钉钉待办状态查询失败。");
      }
      if (request !== latestRequest) return false;
      onTodos(Array.isArray(payload.todos) ? payload.todos : []);
      return true;
    },

    invalidate() {
      latestRequest += 1;
    }
  };
}
