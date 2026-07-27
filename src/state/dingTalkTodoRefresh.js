import { fetchDingTalkTodoStatuses } from "./dingTalkTodoClient.js";

export function createDingTalkTodoRefreshController({ fetchImpl = fetch, onTodos, onWarnings = () => {} }) {
  let latestRequest = 0;
  let inFlight = null;

  return {
    refresh() {
      if (inFlight) return inFlight;
      const request = ++latestRequest;
      const current = (async () => {
        const payload = fetchImpl === fetch
          ? await fetchDingTalkTodoStatuses()
          : await (async () => {
            const response = await fetchImpl("/api/dingtalk/todo/list");
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body.synced) throw new Error(body.message || "钉钉待办状态查询失败。");
            return { ...body, skipped: false };
          })();
        if (payload.skipped) return false;
        if (request !== latestRequest) return false;
        onTodos(Array.isArray(payload.todos) ? payload.todos : []);
        onWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
        return true;
      })();
      inFlight = current;
      current.finally(() => {
        if (inFlight === current) inFlight = null;
      }).catch(() => {});
      return current;
    },

    invalidate() {
      latestRequest += 1;
    }
  };
}
