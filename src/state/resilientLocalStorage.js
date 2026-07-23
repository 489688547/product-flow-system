const APPLICATION_LOCAL_CACHE_KEYS = [
  "productFlowState",
  "productFlowStateDirty",
  "productFlowStateRecoveryBackup",
  "brandContentState:v1",
  "dataCenterMetadata",
  "platformExecutionState",
  "supplyChainState"
];

const APPLICATION_SESSION_CACHE_KEYS = [
  "companyAiAssistantSessionV1",
  "product-flow:deployment-reload-at"
];

export function getBrowserStorage(key, globalRef = globalThis) {
  if (!["localStorage", "sessionStorage"].includes(key)) return null;
  try {
    return globalRef?.[key] || null;
  } catch {
    return null;
  }
}

export function tryGetStorageItem(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function trySetStorageItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function tryRemoveStorageItem(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function persistLocalState(storage, key, state) {
  try {
    return trySetStorageItem(storage, key, JSON.stringify(state));
  } catch {
    return false;
  }
}

function clearStorageKeys(storage, keys) {
  let cleared = true;
  for (const key of keys) {
    if (!tryRemoveStorageItem(storage, key)) cleared = false;
  }
  return cleared;
}

export function clearApplicationBrowserCaches({ localStorage, sessionStorage }) {
  return {
    local: clearStorageKeys(localStorage, APPLICATION_LOCAL_CACHE_KEYS),
    session: clearStorageKeys(sessionStorage, APPLICATION_SESSION_CACHE_KEYS)
  };
}
