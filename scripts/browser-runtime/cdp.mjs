const DEFAULT_TIMEOUT_MS = 30_000;

export class CdpSession {
  constructor(url, options = {}) {
    const WebSocketImpl = options.WebSocketImpl || WebSocket;
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.socket = new WebSocketImpl(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
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
      this.socket.addEventListener(
        "error",
        settle(() => reject(new Error("Chrome DevTools 连接失败。"))),
        { once: true }
      );
      this.socket.addEventListener(
        "close",
        settle(() => reject(new Error("Chrome DevTools 连接已关闭。"))),
        { once: true }
      );
    });
    this.socket.addEventListener("message", event => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) {
          listener(message.params || {});
        }
      }
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
      this.listeners.clear();
    });
  }

  on(method, listener) {
    if (typeof method !== "string" || typeof listener !== "function") {
      throw new TypeError("Chrome DevTools 事件订阅参数无效。");
    }
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => {
      const current = this.listeners.get(method);
      current?.delete(listener);
      if (!current?.size) this.listeners.delete(method);
    };
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

  close() {
    this.socket.close();
  }
}
