const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_ENVIRONMENT = Object.freeze({
  id: "production",
  version: 1,
  versionRequired: false
});

function normalizeSelection(selection = {}) {
  return {
    id: selection.id === "display" ? "display" : "production",
    version: Math.max(1, Number(selection.version || 1)),
    versionRequired: Boolean(selection.versionRequired)
  };
}

function changedError() {
  const error = new Error("数据环境已切换，请重新执行当前操作。");
  error.name = "DataEnvironmentChangedError";
  error.code = "DATA_ENVIRONMENT_CHANGED";
  return error;
}

function inputMethod(input, init) {
  return String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestHeaders(input, init) {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined
  );
  new Headers(init?.headers || {}).forEach((value, name) => headers.set(name, value));
  return headers;
}

export function createDataEnvironmentRequestBoundary({ fetchImpl }) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  let selection = DEFAULT_ENVIRONMENT;
  let generation = 0;
  const controllers = new Set();

  function activate(nextSelection) {
    selection = normalizeSelection(nextSelection);
    generation += 1;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    return selection;
  }

  async function managedFetch(input, init = {}) {
    const requestGeneration = generation;
    const controller = new AbortController();
    const callerSignal = init.signal
      || (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener?.("abort", abortFromCaller, { once: true });
    controllers.add(controller);

    const method = inputMethod(input, init);
    const headers = requestHeaders(input, init);
    if (!SAFE_METHODS.has(method)) {
      headers.set("x-data-environment-version", String(selection.version));
    }

    try {
      const response = await fetchImpl(input, {
        ...init,
        method,
        headers,
        signal: controller.signal
      });
      if (requestGeneration !== generation) throw changedError();
      return response;
    } catch (error) {
      if (requestGeneration !== generation) throw changedError();
      throw error;
    } finally {
      controllers.delete(controller);
      callerSignal?.removeEventListener?.("abort", abortFromCaller);
    }
  }

  return {
    activate,
    fetch: managedFetch,
    current: () => selection
  };
}

const originalFetch = typeof globalThis.fetch === "function"
  ? globalThis.fetch.bind(globalThis)
  : null;
const requestBoundary = originalFetch
  ? createDataEnvironmentRequestBoundary({ fetchImpl: originalFetch })
  : null;
let installed = false;

export function installDataEnvironmentFetchBoundary() {
  if (!requestBoundary || installed) return;
  globalThis.fetch = requestBoundary.fetch;
  installed = true;
}

export function activateDataEnvironment(selection) {
  return requestBoundary?.activate(selection) || normalizeSelection(selection);
}

export function currentDataEnvironment() {
  return requestBoundary?.current() || DEFAULT_ENVIRONMENT;
}

export function environmentStorageKey(baseKey, environmentId = currentDataEnvironment().id) {
  const id = environmentId === "display" ? "display" : "production";
  return `${baseKey}:${id}`;
}

export function migrateLegacyProductionCache(storage, baseKey, environmentId = currentDataEnvironment().id) {
  if (!storage || environmentId !== "production") return false;
  const targetKey = environmentStorageKey(baseKey, "production");
  if (storage.getItem(targetKey) !== null) return false;
  const legacyValue = storage.getItem(baseKey);
  if (legacyValue === null) return false;
  storage.setItem(targetKey, legacyValue);
  return true;
}
