import { clearApplicationBrowserCaches } from "./resilientLocalStorage.js";

export const CLEAR_CACHE_CONFIRMATION = "这只会清理当前浏览器中的本机业务缓存，可能丢失尚未同步的本机草稿；不会删除线上数据库。确认继续吗？";

function readWindowStorage(windowRef, key) {
  try {
    return windowRef?.[key] || null;
  } catch {
    return null;
  }
}

export function reloadApplication(windowRef = globalThis.window) {
  try {
    windowRef?.location?.reload();
    return true;
  } catch {
    return false;
  }
}

export function clearCachesAndReload(windowRef = globalThis.window) {
  let confirmed = false;
  try {
    confirmed = Boolean(windowRef?.confirm?.(CLEAR_CACHE_CONFIRMATION));
  } catch {
    return false;
  }
  if (!confirmed) return false;

  clearApplicationBrowserCaches({
    localStorage: readWindowStorage(windowRef, "localStorage"),
    sessionStorage: readWindowStorage(windowRef, "sessionStorage")
  });
  reloadApplication(windowRef);
  return true;
}
