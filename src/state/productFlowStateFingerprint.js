export function productFlowStateFingerprint(state = {}) {
  const orgCache = state.orgCache && typeof state.orgCache === "object"
    ? { ...state.orgCache }
    : state.orgCache;
  if (orgCache && typeof orgCache === "object") {
    delete orgCache.syncedAt;
    delete orgCache.expiresAt;
  }
  return JSON.stringify({ ...state, orgCache });
}
