import { fetchDingTalkTodoStatuses } from "./dingTalkTodoClient.js";

export function createDingTalkTodoRefreshController({ fetchImpl = fetch, onTodos, onWarnings = () => {} }) {
  let latestRequest = 0;
  let inFlight = null;

  return {
    refresh(taskIds = []) {
      if (inFlight) return inFlight;
      const request = ++latestRequest;
      const current = (async () => {
        const payload = await fetchDingTalkTodoStatuses({
          fetchImpl,
          taskIds,
          force: fetchImpl !== fetch
        });
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
