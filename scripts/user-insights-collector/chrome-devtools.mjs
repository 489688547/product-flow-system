function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const CDP_TIMEOUT_MS = 30000;

function selectReusablePage(pages, targetUrl) {
  const expected = normalizedUrl(targetUrl);
  return pages.find(item => item.type === "page" && normalizedUrl(item.url) === expected) || null;
}

class CdpSession {
  constructor(url, options = {}) {
    const WebSocketImpl = options.WebSocketImpl || WebSocket;
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : CDP_TIMEOUT_MS;
    this.socket = new WebSocketImpl(url);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Chrome DevTools 连接超时。"));
      }, this.timeoutMs);
      const settle = callback => event => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(event);
      };
      this.socket.addEventListener("open", settle(resolve), { once: true });
      this.socket.addEventListener("error", settle(() => reject(new Error("Chrome DevTools 连接失败。"))), { once: true });
      this.socket.addEventListener("close", settle(() => reject(new Error("Chrome DevTools 连接已关闭。"))), { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject, timeout } = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(timeout);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    this.socket.addEventListener("close", () => {
      for (const { reject, timeout } of this.pending.values()) {
        clearTimeout(timeout);
        reject(new Error("Chrome DevTools 连接已关闭。"));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools 命令超时：${method}。`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() { this.socket.close(); }
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
