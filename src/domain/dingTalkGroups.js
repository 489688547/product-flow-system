export function groupAuthorizationUrl(returnTo = "") {
  const current = returnTo || (typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
    : "/#progress");
  return `/api/auth/dingtalk/start?returnTo=${encodeURIComponent(current)}`;
}

async function jsonRequest(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { credentials: "same-origin", headers: { accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "钉钉群数据读取失败，请稍后重试。");
    error.status = response.status;
    error.code = body.code || "DING_GROUP_REQUEST_FAILED";
    if (error.code === "GROUP_AUTH_REQUIRED") error.authorizeUrl = groupAuthorizationUrl();
    throw error;
  }
  return body;
}

export function searchDingTalkGroups(query, cursor = "", fetchImpl = fetch) {
  const params = new URLSearchParams({ q: String(query || "").trim() });
  if (cursor) params.set("cursor", cursor);
  return jsonRequest(`/api/dingtalk/groups/search?${params.toString()}`, fetchImpl);
}

export function loadMyDingTalkGroups(fetchImpl = fetch) {
  return jsonRequest("/api/dingtalk/groups", fetchImpl);
}

export function loadDingTalkGroupMembers(groupId, fetchImpl = fetch) {
  return jsonRequest(`/api/dingtalk/groups/${encodeURIComponent(groupId)}/members`, fetchImpl);
}
