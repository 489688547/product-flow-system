function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

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

  async capture(registeredUrl) {
    const response = await fetch(`${this.endpoint}/json`);
    if (!response.ok) throw new Error("无法连接公司 Mac 的 Chrome 调试端口。");
    const pages = await response.json();
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
