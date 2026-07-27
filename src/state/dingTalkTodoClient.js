const LAST_ATTEMPT_KEY = "productFlowDingTodoRefreshAt";
const CURSOR_KEY = "productFlowDingTodoCursor";
const REFRESH_WINDOW_MS = 45_000;
const RATE_LIMIT_BACKOFF_MS = 120_000;

let inFlight = null;
let lastAttemptAt = 0;
let backoffUntil = 0;

function localStorageValue(key) {
  try {
    return Number(String(window.localStorage.getItem(key) || "").split(":")[0]) || 0;
  } catch {
    return 0;
  }
}

function claimCrossTabRefresh(now) {
  const otherAttemptAt = localStorageValue(LAST_ATTEMPT_KEY);
  if (now - otherAttemptAt < REFRESH_WINDOW_MS) return false;
  const claim = `${now}:${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(LAST_ATTEMPT_KEY, claim);
    return window.localStorage.getItem(LAST_ATTEMPT_KEY) === claim;
  } catch {
    return true;
  }
}

function readCursor() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CURSOR_KEY) || "{}");
    return {
      personalPage: Math.max(1, Math.min(100, Number(value.personalPage) || 1)),
      workPendingToken: String(value.workPendingToken || "").slice(0, 512),
      workCompletedToken: String(value.workCompletedToken || "").slice(0, 512)
    };
  } catch {
    return { personalPage: 1, workPendingToken: "", workCompletedToken: "" };
  }
}

function writeCursor(cursor = {}) {
  try {
    window.localStorage.setItem(CURSOR_KEY, JSON.stringify({
      personalPage: Math.max(1, Math.min(100, Number(cursor.personalPage) || 1)),
      workPendingToken: String(cursor.workPendingToken || "").slice(0, 512),
      workCompletedToken: String(cursor.workCompletedToken || "").slice(0, 512)
    }));
  } catch {
    // Cursor rotation is an optimization; a blocked storage API falls back to page one.
  }
}

export async function fetchDingTalkTodoStatuses({ force = false, fetchImpl = fetch, now = Date.now() } = {}) {
  if (inFlight) return inFlight;
  if (!force && (now < backoffUntil || now - lastAttemptAt < REFRESH_WINDOW_MS || !claimCrossTabRefresh(now))) {
    return { skipped: true, todos: [] };
  }
  lastAttemptAt = now;
  const current = (async () => {
    const cursor = readCursor();
    const params = new URLSearchParams({ personalPage: String(cursor.personalPage) });
    if (cursor.workPendingToken) params.set("workPendingToken", cursor.workPendingToken);
    if (cursor.workCompletedToken) params.set("workCompletedToken", cursor.workCompletedToken);
    const response = await fetchImpl(`/api/dingtalk/todo/list?${params}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.synced) {
      if (response.status === 429 || payload.code === "DINGTALK_RATE_LIMITED") {
        backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      }
      throw new Error(payload.message || "钉钉待办状态查询失败。");
    }
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    if (warnings.some(item => item?.code === "DINGTALK_RATE_LIMITED")) {
      backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    }
    if (payload.nextCursor) writeCursor(payload.nextCursor);
    return {
      skipped: false,
      todos: Array.isArray(payload.todos) ? payload.todos : [],
      warnings,
      coverage: payload.coverage || {}
    };
  })();
  inFlight = current;
  current.finally(() => {
    if (inFlight === current) inFlight = null;
  }).catch(() => {});
  return current;
}

export function dingTalkTodoRefreshDelay(baseMs = 60_000, random = Math.random) {
  return Math.max(30_000, Number(baseMs) || 60_000) + Math.floor(random() * 15_000);
}

export function dingTalkTodoInitialDelay(random = Math.random) {
  return Math.floor(random() * 15_000);
}
