import { basename, isAbsolute } from "node:path";

import { CdpSession } from "../../browser-runtime/cdp.mjs";
import { normalizeLoopbackEndpoint } from "../../browser-runtime/managed-chrome.mjs";

function browserError(code, message) {
  return Object.assign(new Error(message), { code });
}

function registeredUrl(value, origins) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw browserError("COLLECTOR_BROWSER_URL_INVALID", "实验采集页面地址无效。");
  }
  if (url.protocol !== "https:" || !origins.has(url.origin)) {
    throw browserError("COLLECTOR_TEMPLATE_ORIGIN_NOT_ALLOWED", "实验采集页面来源未登记。");
  }
  url.username = "";
  url.password = "";
  return url;
}

function runtimeValue(result) {
  if (result?.exceptionDetails) {
    throw browserError("COLLECTOR_BROWSER_SCRIPT_FAILED", "实验采集页面脚本执行失败。");
  }
  return result?.result?.value;
}

function safeSelectors(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20) {
    throw browserError("COLLECTOR_BROWSER_SELECTOR_INVALID", "实验采集候选选择器无效。");
  }
  return value.map(selector => {
    const normalized = String(selector || "");
    if (!normalized || normalized.length > 500 || /cookie|authorization|password|token/i.test(normalized)) {
      throw browserError("COLLECTOR_BROWSER_SELECTOR_INVALID", "实验采集候选选择器无效。");
    }
    return normalized;
  });
}

function selectorExpression(selectors, action) {
  return `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const visible = element => Boolean(element && element.getClientRects().length > 0);
    const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
    for (const selector of selectors) {
      let element = null;
      if (selector.startsWith("text=")) {
        const label = selector.slice(5);
        element = Array.from(document.querySelectorAll("button, a, [role='button'], [role='option'], span"))
          .find(candidate => visible(candidate) && clean(candidate.textContent) === label);
      } else {
        try { element = document.querySelector(selector); } catch { element = null; }
      }
      if (!visible(element)) continue;
      ${action === "click" ? "element.click();" : ""}
      return { matched: selector };
    }
    return { matched: null };
  })()`;
}

function safeDownloadName(value, pattern) {
  const name = basename(String(value || ""));
  if (!name || name !== value || /[\u0000-\u001f\u007f]/.test(name)) {
    throw browserError("COLLECTOR_DOWNLOAD_FILE_INVALID", "实验采集下载文件名无效。");
  }
  const expected = String(pattern || "");
  if (expected.startsWith("*.") && !name.toLowerCase().endsWith(expected.slice(1).toLowerCase())) {
    throw browserError("COLLECTOR_DOWNLOAD_FILE_INVALID", "实验采集下载文件类型与模板不一致。");
  }
  return name;
}

export function createExperimentalCdpBrowser({
  endpoint: inputEndpoint,
  allowedOrigins = [],
  downloadsDirectory,
  fetchImpl = fetch,
  createSession = url => new CdpSession(url),
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
}) {
  const endpoint = normalizeLoopbackEndpoint(inputEndpoint);
  const origins = new Set(allowedOrigins.map(value => new URL(value).origin));
  if (!origins.size) throw browserError("COLLECTOR_TEMPLATE_ORIGIN_NOT_ALLOWED", "实验采集未登记页面来源。");
  if (!isAbsolute(downloadsDirectory || "")) {
    throw browserError("COLLECTOR_WORKSPACE_INVALID", "实验采集下载目录必须是本机绝对路径。");
  }
  let pageSession = null;

  async function evaluateExpression(expression) {
    if (!pageSession) throw browserError("COLLECTOR_BROWSER_UNAVAILABLE", "实验采集页面尚未打开。");
    return runtimeValue(await pageSession.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    }));
  }

  return Object.freeze({
    async open(value) {
      const url = registeredUrl(value, origins);
      const pagesResponse = await fetchImpl(`${endpoint}/json`);
      if (!pagesResponse.ok) throw browserError("COLLECTOR_BROWSER_UNAVAILABLE", "无法读取实验采集浏览器页面。");
      const pages = await pagesResponse.json();
      let page = pages.find(item => (
        item.type === "page"
        && (() => {
          try {
            return new URL(item.url).origin === url.origin;
          } catch {
            return false;
          }
        })()
      ));
      if (!page || page.url !== url.toString()) {
        const opened = await fetchImpl(`${endpoint}/json/new?${encodeURIComponent(url.toString())}`, {
          method: "PUT"
        });
        if (!opened.ok) throw browserError("COLLECTOR_BROWSER_UNAVAILABLE", "无法打开实验采集登记页面。");
        page = await opened.json();
      }
      if (!page?.webSocketDebuggerUrl) {
        throw browserError("COLLECTOR_BROWSER_UNAVAILABLE", "实验采集页面调试会话不可用。");
      }
      pageSession?.close?.();
      pageSession = createSession(page.webSocketDebuggerUrl);
      await wait(500);
      return { origin: url.origin };
    },
    async evaluate(code, { variables = {} } = {}) {
      const source = String(code || "");
      if (!source || source.length > 100_000) {
        throw browserError("COLLECTOR_BROWSER_SCRIPT_INVALID", "实验采集页面脚本无效。");
      }
      return evaluateExpression(
        `(async variables => { ${source}\n})(${JSON.stringify(variables)})`
      );
    },
    async click(inputSelectors) {
      const selectors = safeSelectors(inputSelectors);
      const result = await evaluateExpression(selectorExpression(selectors, "click"));
      if (!result?.matched) {
        throw browserError("COLLECTOR_BROWSER_SELECTOR_NOT_FOUND", "实验采集页面未找到候选点击目标。");
      }
      return { matchedSelector: result.matched };
    },
    async wait({ milliseconds = 0, selectors = [] } = {}) {
      if (!selectors.length) {
        await wait(Math.max(0, Number(milliseconds) || 0));
        return { waitedMilliseconds: Math.max(0, Number(milliseconds) || 0) };
      }
      const safe = safeSelectors(selectors);
      const deadline = Date.now() + Math.max(1, Number(milliseconds) || 1_000);
      while (Date.now() < deadline) {
        const result = await evaluateExpression(selectorExpression(safe, "inspect"));
        if (result?.matched) return { matchedSelector: result.matched };
        await wait(250);
      }
      throw browserError("COLLECTOR_BROWSER_WAIT_TIMEOUT", "实验采集等待页面元素超时。");
    },
    async download({ selectors: inputSelectors, filePattern = "", timeoutMs = 90_000 }) {
      const selectors = safeSelectors(inputSelectors);
      const versionResponse = await fetchImpl(`${endpoint}/json/version`);
      if (!versionResponse.ok) throw browserError("COLLECTOR_BROWSER_UNAVAILABLE", "实验采集下载会话不可用。");
      const target = await versionResponse.json();
      if (!target?.webSocketDebuggerUrl) {
        throw browserError("COLLECTOR_BROWSER_UNAVAILABLE", "实验采集下载会话不可用。");
      }
      const browserSession = createSession(target.webSocketDebuggerUrl);
      let guid = "";
      let suggestedFilename = "";
      let resolveDownload;
      let rejectDownload;
      const completed = new Promise((resolve, reject) => {
        resolveDownload = resolve;
        rejectDownload = reject;
      });
      const offBegin = browserSession.on("Browser.downloadWillBegin", event => {
        guid = String(event.guid || "");
        suggestedFilename = String(event.suggestedFilename || "");
      });
      const offProgress = browserSession.on("Browser.downloadProgress", event => {
        if (guid && event.guid !== guid) return;
        if (event.state === "completed") resolveDownload();
        if (event.state === "canceled") {
          rejectDownload(browserError("COLLECTOR_DOWNLOAD_CANCELLED", "实验采集下载被取消。"));
        }
      });
      const timeout = setTimeout(() => {
        rejectDownload(browserError("COLLECTOR_DOWNLOAD_TIMEOUT", "实验采集下载超时。"));
      }, Math.max(1, Number(timeoutMs) || 90_000));
      try {
        await browserSession.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: downloadsDirectory,
          eventsEnabled: true
        });
        const clicked = await evaluateExpression(selectorExpression(selectors, "click"));
        if (!clicked?.matched) {
          throw browserError("COLLECTOR_BROWSER_SELECTOR_NOT_FOUND", "实验采集页面未找到下载目标。");
        }
        await completed;
        const safeFileName = safeDownloadName(suggestedFilename, filePattern);
        return { path: safeFileName, safeFileName };
      } finally {
        clearTimeout(timeout);
        offBegin();
        offProgress();
        browserSession.close?.();
      }
    },
    close() {
      pageSession?.close?.();
      pageSession = null;
    }
  });
}
