import { withCollectorLock } from "../kuaimai-erp-collector/lock.mjs";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1_000;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;

function safeErrorCode(error) {
  const code = String(error?.code || "");
  return SAFE_ERROR_CODE.test(code) ? code : "KUAIMAI_LOCAL_SCAN_FAILED";
}

export function createLocalArchiveCoordinator({
  root,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => Date.now()
} = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1_000) {
    throw new Error("本地快麦扫描周期无效。");
  }
  if (!root) throw new Error("本地快麦归档目录未配置。");

  let serialTail = Promise.resolve();
  let lastScanStartedAt = null;
  let scanRunning = false;

  const runSerial = operation => {
    if (typeof operation !== "function") {
      return Promise.reject(new TypeError("本地归档操作无效。"));
    }
    const result = serialTail.then(operation);
    serialTail = result.catch(() => {});
    return result;
  };

  return Object.freeze({
    runBrowserArchive(operation) {
      return runSerial(() => withCollectorLock(root, operation, { onBusy: "throw" }));
    },
    async runInboxScan(operation) {
      const startedAt = Number(now());
      if (scanRunning) return { status: "skipped", reason: "already_running" };
      if (lastScanStartedAt !== null && startedAt - lastScanStartedAt < intervalMs) {
        return { status: "skipped", reason: "interval" };
      }
      lastScanStartedAt = startedAt;
      scanRunning = true;
      try {
        const result = await runSerial(() => withCollectorLock(root, operation));
        if (result?.status === "already_running") {
          return { status: "skipped", reason: "external_lock" };
        }
        return { status: "completed", result };
      } catch (error) {
        return { status: "failed", errorCode: safeErrorCode(error) };
      } finally {
        scanRunning = false;
      }
    },
    drain() {
      return serialTail;
    }
  });
}

export function startIndependentCollectorCycles({
  runWeb,
  runInbox,
  webIntervalMs = 60_000,
  inboxIntervalMs = DEFAULT_INTERVAL_MS,
  setTimer = setInterval,
  clearTimer = clearInterval
}) {
  if (typeof runWeb !== "function" || typeof runInbox !== "function") {
    throw new TypeError("采集周期操作未配置。");
  }
  let stopped = false;
  let webPromise = null;
  let inboxPromise = null;

  const invoke = (operation, activePromise, setActivePromise) => {
    if (stopped || activePromise) return activePromise;
    const promise = Promise.resolve()
      .then(operation)
      .catch(() => {})
      .finally(() => setActivePromise(null));
    setActivePromise(promise);
    return promise;
  };
  const runWebOnce = () => invoke(runWeb, webPromise, value => { webPromise = value; });
  const runInboxOnce = () => invoke(runInbox, inboxPromise, value => { inboxPromise = value; });

  void runWebOnce();
  void runInboxOnce();
  const webTimer = setTimer(() => void runWebOnce(), webIntervalMs);
  const inboxTimer = setTimer(() => void runInboxOnce(), inboxIntervalMs);

  return Object.freeze({
    async stop() {
      if (!stopped) {
        stopped = true;
        clearTimer(webTimer);
        clearTimer(inboxTimer);
      }
      await Promise.allSettled([webPromise, inboxPromise].filter(Boolean));
    }
  });
}
