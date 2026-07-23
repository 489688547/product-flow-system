import { assertRegisteredTask, registeredResource } from "./providers/registry.js";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:17653";
const POLL_ALARM = "company-data-collector-poll";
const ACTIVE_JOB_KEY = "activeJob";
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

async function waitForTabComplete(tabId) {
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
    }, 15000);
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

async function ensureProviderTab(resource) {
  const matches = await chrome.tabs.query({ url: [`${resource.origin}/*`] });
  const targetUrl = `${resource.origin}${resource.route}`;
  let tab = matches.find(candidate => candidate.url?.includes(resource.route));
  if (!tab) tab = matches[0];
  if (!tab) tab = await chrome.tabs.create({ url: targetUrl, active: false });
  else if (!tab.url?.includes(resource.route)) {
    tab = await chrome.tabs.update(tab.id, { url: targetUrl, active: false });
  }
  tab = await waitForTabComplete(tab.id);
  if (!await waitForContentScript(tab.id, 500)) {
    await chrome.tabs.reload(tab.id);
    tab = await waitForTabComplete(tab.id);
  }
  if (!await waitForContentScript(tab.id, 3000)) {
    throw Object.assign(new Error("页面采集脚本不可用。"), {
      code: "EXTENSION_CONTENT_SCRIPT_UNAVAILABLE"
    });
  }
  return tab;
}

async function findRecentDownload(resource, startedAt) {
  const downloads = await chrome.downloads.search({ startedAfter: new Date(startedAt - 1000).toISOString(), limit: 20 });
  return downloads.find(item => matchesRegisteredDownload(resource, item));
}

async function startRegisteredDirectDownload(resource, tabId, startedAt) {
  const deadline = Date.now() + 3000;
  do {
    const existing = await findRecentDownload(resource, startedAt);
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

async function waitForDownload(resource, tabId, startedAt) {
  let candidate = await startRegisteredDirectDownload(resource, tabId, startedAt);
  if (!candidate) {
    candidate = await new Promise(resolve => {
      const timeout = setTimeout(() => {
        chrome.downloads.onCreated.removeListener(listener);
        resolve(null);
      }, 30000);
      const listener = item => {
        if (matchesRegisteredDownload(resource, item)) {
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
      }, 120000);
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
  assertRegisteredTask(task);
  const resource = registeredResource(task.providerId, task.resourceType);
  await chrome.storage.local.set({ [ACTIVE_JOB_KEY]: task });
  let tab;
  try {
    tab = await ensureProviderTab(resource);
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
  const download = await waitForDownload(resource, tab.id, startedAt);
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
