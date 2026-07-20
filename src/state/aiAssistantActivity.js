const STATUS_BY_EVENT = Object.freeze({
  skill_started: "running",
  skill_completed: "completed",
  skill_failed: "failed"
});

function safeText(value, limit) {
  return String(value || "").slice(0, limit);
}

function normalizeActivity(event = {}, previous = {}) {
  return {
    callId: safeText(event.callId || previous.callId, 120),
    skillId: safeText(event.skillId || previous.skillId, 120),
    appId: safeText(event.appId || previous.appId || "unknown", 80),
    displayName: safeText(event.displayName || previous.displayName || event.skillId || previous.skillId, 120),
    status: STATUS_BY_EVENT[event.type] || (["running", "completed", "failed"].includes(event.status) ? event.status : previous.status || "running"),
    recordCount: Math.max(0, Number(event.recordCount ?? previous.recordCount) || 0),
    latencyMs: Math.max(0, Number(event.latencyMs ?? previous.latencyMs) || 0),
    updatedAt: safeText(event.updatedAt || previous.updatedAt, 40),
    code: safeText(event.code || previous.code, 80)
  };
}

export function upsertAiSkillActivity(activity = [], event = {}) {
  if (!event.callId || !STATUS_BY_EVENT[event.type]) return Array.isArray(activity) ? activity.slice(-6) : [];
  const current = Array.isArray(activity) ? activity : [];
  const index = current.findIndex(item => item.callId === event.callId);
  if (index < 0) return [...current, normalizeActivity(event)].slice(-6);
  return current.map((item, itemIndex) => itemIndex === index ? normalizeActivity(event, item) : item).slice(-6);
}

export function sanitizeAiSkillActivity(activity = []) {
  return (Array.isArray(activity) ? activity : []).slice(-6).map(item => normalizeActivity(item));
}
