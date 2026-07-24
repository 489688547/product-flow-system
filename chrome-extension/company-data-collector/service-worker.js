import {
  assertRegisteredTask,
  registeredResource,
  registeredTaskUrl
} from "./providers/registry.js";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:17653";
const POLL_ALARM = "company-data-collector-poll";
const ACTIVE_JOB_KEY = "activeJob";
// 插件自己创建的专用采集标签页，绝不复用员工正在操作的标签页。
const COLLECTOR_TAB_KEY = "collectorTabId";
const TAB_LOAD_TIMEOUT_MS = 30000;
const CONTENT_SCRIPT_PROBE_TIMEOUT_MS = 10000;
const KEEP_ALIVE_INTERVAL_MS = 20000;
let polling = false;

function safeBaseName(value) {
  return String(value || "").split(/[\\/]/).pop();
}

function matchesRegisteredDownload(resource, item) {
  const fileName = safeBaseName(item?.filename);
  const normalized = fileName.toLowerCase();
  return resource.downloadExtensions.some(extension => normalized.endsWith(extension))
    && resource.downloadFilePrefixes.some(prefix => fileName.startsWith(prefix));
}

function registeredDirectDownload(resource, value) {
  try {
    const url = new URL(String(value || ""));
    if (!resource.downloadOrigins.includes(url.origin)) return null;
    const fileName = decodeURIComponent(safeBaseName(url.pathname));
    if (!matchesRegisteredDownload(resource, { filename: fileName })) return null;
    return { url: url.href, fileName };
  } catch {
    return null;
  }
}

async function bridgeConfiguration() {
  const stored = await chrome.storage.local.get(["bridgeUrl", "pairingKey"]);
  return {
    bridgeUrl: stored.bridgeUrl || DEFAULT_BRIDGE_URL,
    pairingKey: String(stored.pairingKey || "")
  };
}

async function bridgeFetch(path, options = {}) {
  const { bridgeUrl, pairingKey } = await bridgeConfiguration();
  if (!/^wcp_[a-f0-9]{48}$/i.test(pairingKey)) {
    throw Object.assign(new Error("本机执行器尚未配对。"), { code: "EXTENSION_NOT_PAIRED" });
  }
  return fetch(`${bridgeUrl}${path}`, {
    ...options,
    headers: {
      "X-Collector-Pairing-Key": pairingKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
}

async function waitForTabComplete(tabId, timeoutMs = TAB_LOAD_TIMEOUT_MS) {
  let tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return tab;
  await new Promise(resolve => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);
  });
  tab = await chrome.tabs.get(tabId);
  return tab;
}

async function probeContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "COLLECTOR_CONTENT_SCRIPT_PROBE" });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function waitForContentScript(tabId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await probeContentScript(tabId)) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return false;
}

async function reportTaskResult(task, result) {
  const payload = {
    jobId: task.jobId,
    providerId: task.providerId,
    resourceType: task.resourceType,
    ...result
  };
  const response = await bridgeFetch(`/v1/tasks/${encodeURIComponent(task.jobId)}/result`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw Object.assign(new Error("本机执行器未接受任务结果。"), { code: `BRIDGE_RESULT_HTTP_${response.status}` });
}

// MV3 Service Worker 在长任务（等页面、等下载创建、等下载完成）期间可能被
// Chrome 回收，导致 activeJob 残留、任务卡到租约超时。任务执行期间每 20 秒
// 调一次无害的 chrome API 保活，任务结束（含异常）后必须清除定时器。
export function startKeepAlive({
  intervalMs = KEEP_ALIVE_INTERVAL_MS,
  ping = () => chrome.runtime.getPlatformInfo()
} = {}) {
  const timer = setInterval(() => {
    Promise.resolve()
      .then(() => ping())
      .catch(() => {});
  }, intervalMs);
  if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
}

async function findCollectorTab() {
  const stored = await chrome.storage.local.get(COLLECTOR_TAB_KEY);
  const tabId = Number(stored?.[COLLECTOR_TAB_KEY]);
  if (!Number.isInteger(tabId) || tabId <= 0) return null;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    // 专用标签页已被员工关闭，清除登记后由调用方重建。
    await chrome.storage.local.remove(COLLECTOR_TAB_KEY);
    return null;
  }
}

export async function ensureProviderTab(resource, targetUrl) {
  // 只复用插件自己创建并登记的专用标签页；没有专用标签页时永远后台新开，
  // 绝不导航复用员工正在使用的快麦页面。
  let tab = await findCollectorTab();
  if (!tab) {
    tab = await chrome.tabs.create({ url: targetUrl, active: false });
    await chrome.storage.local.set({ [COLLECTOR_TAB_KEY]: tab.id });
  } else if (tab.url !== targetUrl) {
    tab = await chrome.tabs.update(tab.id, { url: targetUrl, active: false });
  }
  tab = await waitForTabComplete(tab.id);
  if (!await waitForContentScript(tab.id, 500)) {
    await chrome.tabs.reload(tab.id);
    tab = await waitForTabComplete(tab.id);
  }
  if (!await waitForContentScript(tab.id, CONTENT_SCRIPT_PROBE_TIMEOUT_MS)) {
    throw Object.assign(new Error("页面采集脚本不可用。"), {
      code: "EXTENSION_CONTENT_SCRIPT_UNAVAILABLE"
    });
  }
  return tab;
}

function downloadStartTime(item) {
  const parsed = Date.parse(String(item?.startTime || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// 只接受本次导出开始之后创建、且文件名匹配登记的下载；多个候选取时间
// 最早的一条，避免领到员工随后手动下载的无关文件。
export function selectExportDownload(items, resource, exportStartedAt) {
  return (Array.isArray(items) ? items : [])
    .filter(item => matchesRegisteredDownload(resource, item) && downloadStartTime(item) >= exportStartedAt)
    .sort((left, right) => downloadStartTime(left) - downloadStartTime(right))[0] || null;
}

export async function findRecentDownload(resource, exportStartedAt) {
  const downloads = await chrome.downloads.search({ startedAfter: new Date(exportStartedAt - 1000).toISOString(), limit: 20 });
  return selectExportDownload(downloads, resource, exportStartedAt);
}

async function startRegisteredDirectDownload(resource, tabId, exportStartedAt, windowMs = 3000) {
  const deadline = Date.now() + windowMs;
  do {
    const existing = await findRecentDownload(resource, exportStartedAt);
    if (existing) return existing;
    const tab = await chrome.tabs.get(tabId);
    const direct = registeredDirectDownload(resource, tab.url);
    if (direct) {
      const id = await chrome.downloads.download({
        url: direct.url,
        filename: direct.fileName,
        conflictAction: "uniquify",
        saveAs: false
      });
      const [download] = await chrome.downloads.search({ id });
      return download || null;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return null;
}

export async function waitForDownload(resource, tabId, exportStartedAt, {
  directWindowMs = 3000,
  createTimeoutMs = 30000,
  completeTimeoutMs = 120000
} = {}) {
  let candidate = await startRegisteredDirectDownload(resource, tabId, exportStartedAt, directWindowMs);
  if (!candidate) {
    candidate = await new Promise(resolve => {
      const timeout = setTimeout(() => {
        chrome.downloads.onCreated.removeListener(listener);
        resolve(null);
      }, createTimeoutMs);
      const listener = item => {
        if (matchesRegisteredDownload(resource, item) && downloadStartTime(item) >= exportStartedAt) {
          clearTimeout(timeout);
          chrome.downloads.onCreated.removeListener(listener);
          resolve(item);
        }
      };
      chrome.downloads.onCreated.addListener(listener);
    });
  }
  if (!candidate) return null;
  if (candidate.state !== "complete") {
    candidate = await new Promise(resolve => {
      const timeout = setTimeout(() => {
        chrome.downloads.onChanged.removeListener(listener);
        resolve(null);
      }, completeTimeoutMs);
      const listener = async delta => {
        if (delta.id !== candidate.id) return;
        if (delta.error) {
          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(listener);
          resolve(null);
        }
        if (delta.state?.current === "complete") {
          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(listener);
          const [completed] = await chrome.downloads.search({ id: candidate.id });
          resolve(completed || null);
        }
      };
      chrome.downloads.onChanged.addListener(listener);
    });
  }
  return candidate;
}

async function executeTask(task) {
  // 长任务期间保持 Service Worker 存活，任务结束（含异常）后立即清除。
  const stopKeepAlive = startKeepAlive();
  try {
    await runRegisteredBridgeTask(task);
  } finally {
    stopKeepAlive();
  }
}

async function runRegisteredBridgeTask(task) {
  assertRegisteredTask(task);
  const resource = registeredResource(task.providerId, task.resourceType);
  const taskUrl = registeredTaskUrl(task);
  await chrome.storage.local.set({ [ACTIVE_JOB_KEY]: task });
  let tab;
  try {
    tab = await ensureProviderTab(resource, taskUrl);
  } catch (error) {
    await reportTaskResult(task, {
      status: "failed",
      stage: "opening",
      errorCode: error?.code || "EXTENSION_CONTENT_SCRIPT_UNAVAILABLE"
    });
    return;
  }
  const startedAt = Date.now();
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { type: "RUN_REGISTERED_TASK", task });
  } catch {
    await reportTaskResult(task, { status: "failed", stage: "opening", errorCode: "EXTENSION_CONTENT_SCRIPT_UNAVAILABLE" });
    return;
  }
  if (result?.status !== "exporting") {
    await reportTaskResult(task, result || { status: "failed", stage: "opening", errorCode: "EXTENSION_NO_PAGE_RESPONSE" });
    return;
  }
  // 下载匹配锚定内容脚本记录的导出点击时间；老版内容脚本缺省时退回任务开始时间。
  const exportStartedAt = Number(result?.exportStartedAt) > 0 ? Number(result.exportStartedAt) : startedAt;
  const download = await waitForDownload(resource, tab.id, exportStartedAt);
  if (!download) {
    await reportTaskResult(task, { status: "failed", stage: "downloading", errorCode: "EXTENSION_DOWNLOAD_TIMEOUT" });
    return;
  }
  await reportTaskResult(task, {
    status: "downloaded",
    stage: "downloading",
    downloadId: download.id,
    fileName: safeBaseName(download.filename)
  });
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const response = await bridgeFetch("/v1/tasks/next");
    if (!response.ok) throw Object.assign(new Error("本机执行器连接失败。"), { code: `BRIDGE_HTTP_${response.status}` });
    const { task } = await response.json();
    if (task) await executeTask(task);
    await chrome.storage.local.set({ lastBridgeAt: new Date().toISOString(), lastBridgeError: null });
  } catch (error) {
    await chrome.storage.local.set({ lastBridgeError: error?.code || "BRIDGE_UNAVAILABLE" });
  } finally {
    polling = false;
    await chrome.storage.local.remove(ACTIVE_JOB_KEY);
  }
}

async function ensurePollAlarm() {
  const alarm = await chrome.alarms.get(POLL_ALARM);
  if (alarm?.periodInMinutes === 1) return;
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
}

void ensurePollAlarm();

chrome.runtime.onInstalled.addListener(async () => {
  await ensurePollAlarm();
  await poll();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensurePollAlarm();
  await poll();
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === POLL_ALARM) void poll();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SAVE_PAIRING") {
    const pairingKey = String(message.pairingKey || "").trim();
    if (!/^wcp_[a-f0-9]{48}$/i.test(pairingKey)) {
      sendResponse({ ok: false, errorCode: "PAIRING_KEY_INVALID" });
      return false;
    }
    chrome.storage.local.set({ pairingKey, bridgeUrl: DEFAULT_BRIDGE_URL }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "GET_STATUS") {
    chrome.storage.local.get(["pairingKey", "lastBridgeAt", "lastBridgeError", ACTIVE_JOB_KEY])
      .then(status => sendResponse({
        paired: /^wcp_[a-f0-9]{48}$/i.test(String(status.pairingKey || "")),
        lastBridgeAt: status.lastBridgeAt || null,
        lastBridgeError: status.lastBridgeError || null,
        activeJob: status[ACTIVE_JOB_KEY] || null
      }));
    return true;
  }
  if (message?.type === "POLL_NOW") {
    poll().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "OPEN_KUAIMAI") {
    chrome.tabs.create({ url: "https://erpb.superboss.cc/index.html#/trade/searchlist/", active: true })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
