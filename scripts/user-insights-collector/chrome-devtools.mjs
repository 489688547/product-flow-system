import { CdpSession } from "../browser-runtime/cdp.mjs";

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function selectReusablePage(pages, targetUrl) {
  const expected = normalizedUrl(targetUrl);
  return pages.find(item => item.type === "page" && normalizedUrl(item.url) === expected) || null;
}

export const chromeDevtoolsInternals = { CdpSession, selectReusablePage };

const CAPTURE_EXPRESSION = `(() => ({
  url: location.href,
  title: document.title,
  text: (document.body?.innerText || '').slice(0, 100000),
  tables: Array.from(document.querySelectorAll('table')).slice(0, 20).map(table => {
    const rows = Array.from(table.querySelectorAll('tr')).map(row => Array.from(row.querySelectorAll('th,td')).map(cell => (cell.innerText || '').trim()));
    return { headers: rows[0] || [], rows: rows.slice(1, 2001) };
  })
}))()`;

export class ChromeDevtoolsBrowser {
  constructor(endpoint = "http://127.0.0.1:9222") {
    this.endpoint = endpoint.replace(/\/$/, "");
  }

  async pages() {
    const response = await fetch(`${this.endpoint}/json`);
    if (!response.ok) throw new Error("无法连接公司 Mac 的 Chrome 调试端口。");
    return response.json();
  }

  async open(url) {
    const target = new URL(url);
    if (target.protocol !== "https:") throw new Error("浏览器助手只允许打开 HTTPS 页面。");
    const existingPage = selectReusablePage(await this.pages(), target.toString());
    if (existingPage) return existingPage;
    const response = await fetch(`${this.endpoint}/json/new?${encodeURIComponent(target.toString())}`, { method: "PUT" });
    if (!response.ok) throw new Error("公司 Mac 无法打开已登记页面。");
    return response.json();
  }

  async evaluate(pageId, expression) {
    const pages = await this.pages();
    const page = pages.find(item => item.type === "page" && item.id === pageId);
    if (!page?.webSocketDebuggerUrl) throw new Error("公司 Mac 的目标页面已关闭。");
    const session = new CdpSession(page.webSocketDebuggerUrl);
    try {
      const result = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      return { id: pageId, ...(result.result?.value || {}) };
    } finally {
      session.close();
    }
  }

  async capture(registeredUrl) {
    const pages = await this.pages();
    const expected = normalizedUrl(registeredUrl);
    const page = pages.find(item => item.type === "page" && normalizedUrl(item.url) === expected);
    if (!page?.webSocketDebuggerUrl) throw new Error("已登记市场页面尚未在 Chrome 中打开。");
    const session = new CdpSession(page.webSocketDebuggerUrl);
    try {
      const result = await session.send("Runtime.evaluate", { expression: CAPTURE_EXPRESSION, returnByValue: true });
      return result.result?.value || { url: registeredUrl, title: "", text: "", tables: null };
    } finally {
      session.close();
    }
  }
}
