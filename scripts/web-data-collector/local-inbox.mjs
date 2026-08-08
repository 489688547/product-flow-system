const DEFAULT_INTERVAL_MS = 15 * 60 * 1_000;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;

function safeErrorCode(error) {
  const code = String(error?.code || "");
  return SAFE_ERROR_CODE.test(code) ? code : "KUAIMAI_LOCAL_SCAN_FAILED";
}

export function createLocalArchiveCoordinator({
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => Date.now()
} = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1_000) {
    throw new Error("本地快麦扫描周期无效。");
  }

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
      return runSerial(operation);
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
        const result = await runSerial(operation);
        return { status: "completed", result };
      } catch (error) {
        return { status: "failed", errorCode: safeErrorCode(error) };
      } finally {
        scanRunning = false;
      }
    }
  });
}
