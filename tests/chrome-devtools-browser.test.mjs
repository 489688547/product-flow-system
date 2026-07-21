import assert from "node:assert/strict";
import test from "node:test";

import { chromeDevtoolsInternals } from "../scripts/user-insights-collector/chrome-devtools.mjs";

class SilentWebSocket {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, payload = {}) {
    for (const listener of this.listeners.get(type) || []) listener(payload);
  }

  send() {}
  close() { this.emit("close"); }
}

test("CDP sessions time out readiness instead of leaving top-level await unsettled", async () => {
  const session = new chromeDevtoolsInternals.CdpSession("ws://company-chrome", {
    WebSocketImpl: SilentWebSocket,
    timeoutMs: 5
  });

  await assert.rejects(session.send("Runtime.evaluate"), /Chrome DevTools 连接超时/);
});

test("CDP commands retain a watchdog until Chrome responds", async () => {
  const session = new chromeDevtoolsInternals.CdpSession("ws://company-chrome", {
    WebSocketImpl: SilentWebSocket,
    timeoutMs: 5
  });
  session.socket.emit("open");

  await assert.rejects(session.send("Runtime.evaluate"), /Chrome DevTools 命令超时/);
  session.close();
});

test("browser login reuses the newest matching Chrome page", () => {
  const pages = [
    { id: "newest", type: "page", url: "https://fxg.jinritemai.com/login/common?channel=zhaoshang#login" },
    { id: "older", type: "page", url: "https://fxg.jinritemai.com/login/common?channel=zhaoshang" },
    { id: "other", type: "page", url: "https://example.com/" }
  ];

  assert.equal(
    chromeDevtoolsInternals.selectReusablePage(
      pages,
      "https://fxg.jinritemai.com/login/common?channel=zhaoshang"
    )?.id,
    "newest"
  );
});
