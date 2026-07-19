const RELOAD_MARKER = "product-flow:deployment-reload-at";
const DEFAULT_COOLDOWN_MS = 60_000;

function readLastReload(storage) {
  try {
    const storedValue = storage?.getItem(RELOAD_MARKER);
    if (storedValue === null || storedValue === undefined) return null;
    const value = Number(storedValue);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function rememberReload(storage, timestamp) {
  try {
    storage?.setItem(RELOAD_MARKER, String(timestamp));
  } catch {
    // Storage may be unavailable in restricted WebViews; reloading still recovers the app.
  }
}

function getSessionStorage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function installDeploymentRecovery(options = {}) {
  const {
    windowRef = globalThis.window,
    storage = getSessionStorage(),
    now = Date.now,
    reload = () => windowRef.location.reload(),
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = options;
  if (!windowRef?.addEventListener) return () => {};
  let lastAttemptAt = null;

  const handlePreloadError = (event) => {
    event.preventDefault();

    const timestamp = now();
    const lastReload = readLastReload(storage);
    const latestReload = Math.max(lastReload ?? 0, lastAttemptAt ?? 0);
    if (latestReload > 0 && timestamp - latestReload < cooldownMs) return;

    lastAttemptAt = timestamp;
    rememberReload(storage, timestamp);
    reload();
  };

  windowRef.addEventListener("vite:preloadError", handlePreloadError);
  return () => windowRef.removeEventListener("vite:preloadError", handlePreloadError);
}
