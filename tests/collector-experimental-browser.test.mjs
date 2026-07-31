import assert from "node:assert/strict";
import test from "node:test";

import { createExperimentalCdpBrowser } from "../scripts/web-data-collector/experimental/browser.mjs";

test("experimental CDP browser stays on registered origins and returns only evaluated values", async () => {
  const commands = [];
  const browser = createExperimentalCdpBrowser({
    endpoint: "http://127.0.0.1:43127",
    allowedOrigins: ["https://erp.superboss.cc"],
    downloadsDirectory: "/managed/experimental/run-1",
    fetchImpl: async (url, options = {}) => {
      if (url === "http://127.0.0.1:43127/json") {
        return new Response(JSON.stringify([]));
      }
      if (url.startsWith("http://127.0.0.1:43127/json/new?") && options.method === "PUT") {
        return new Response(JSON.stringify({
          type: "page",
          url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/",
          webSocketDebuggerUrl: "ws://page-1"
        }));
      }
      throw new Error(`unexpected ${options.method || "GET"} ${url}`);
    },
    createSession: () => ({
      async send(method, params) {
        commands.push([method, params]);
        if (method === "Runtime.evaluate") {
          return { result: { value: { ready: true } } };
        }
        return {};
      },
      close() {}
    }),
    wait: async () => {}
  });

  await assert.rejects(browser.open("https://evil.example/report"), /来源|登记/);
  const opened = await browser.open("https://erp.superboss.cc/index.html#/stock/warehouse_status/");
  const evaluated = await browser.evaluate("return { ready: variables.ready };", {
    variables: { ready: true },
    timeoutMs: 1_000
  });

  assert.equal(opened.origin, "https://erp.superboss.cc");
  assert.deepEqual(evaluated, { ready: true });
  assert.equal(commands.some(([method]) => method === "Runtime.evaluate"), true);
  assert.doesNotMatch(JSON.stringify({ opened, evaluated }), /cookie|localStorage|authorization/i);
  browser.close();
});

test("experimental CDP browser uses bounded selectors and resolves download events locally", async () => {
  const listeners = new Map();
  let evaluateCount = 0;
  const browser = createExperimentalCdpBrowser({
    endpoint: "http://127.0.0.1:43127",
    allowedOrigins: ["https://erp.superboss.cc"],
    downloadsDirectory: "/managed/experimental/run-1",
    fetchImpl: async url => {
      if (url.endsWith("/json")) {
        return new Response(JSON.stringify([{
          type: "page",
          url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/",
          webSocketDebuggerUrl: "ws://page-1"
        }]));
      }
      if (url.endsWith("/json/version")) {
        return new Response(JSON.stringify({ webSocketDebuggerUrl: "ws://browser-1" }));
      }
      throw new Error(`unexpected ${url}`);
    },
    createSession: url => ({
      on(method, listener) {
        listeners.set(method, listener);
        return () => listeners.delete(method);
      },
      async send(method) {
        if (url === "ws://page-1" && method === "Runtime.evaluate") {
          evaluateCount += 1;
          if (evaluateCount === 1) return { result: { value: { matched: "[data-export]" } } };
          queueMicrotask(() => {
            listeners.get("Browser.downloadWillBegin")?.({
              guid: "download-1",
              suggestedFilename: "库存.xlsx"
            });
            listeners.get("Browser.downloadProgress")?.({
              guid: "download-1",
              state: "completed"
            });
          });
          return { result: { value: { matched: "text=下载" } } };
        }
        return {};
      },
      close() {}
    }),
    wait: async () => {}
  });

  await browser.open("https://erp.superboss.cc/index.html#/stock/warehouse_status/");
  assert.deepEqual(await browser.click(["[data-export]", "text=导出"]), {
    matchedSelector: "[data-export]"
  });
  const downloaded = await browser.download({
    selectors: ["text=下载"],
    filePattern: "*.xlsx",
    timeoutMs: 1_000
  });

  assert.deepEqual(downloaded, {
    path: "库存.xlsx",
    safeFileName: "库存.xlsx"
  });
  browser.close();
});
