import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGoodsFlowLocalPreview } from "../server/goodsFlowLocalPreview.mjs";

function responseCapture() {
  return {
    status: 0,
    headers: {},
    chunks: [],
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(chunk) { if (chunk) this.chunks.push(chunk); },
    json() { return JSON.parse(Buffer.concat(this.chunks).toString("utf8")); }
  };
}

function request(method, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    async *[Symbol.asyncIterator]() { yield* chunks; }
  };
}

test("local goods-flow preview serves and persists the production API contract", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goods-flow-preview-"));
  const storagePath = path.join(directory, "state.json");
  try {
    const handle = createGoodsFlowLocalPreview({ storagePath });
    const dashboard = responseCapture();
    assert.equal(await handle(request("GET"), dashboard, new URL("http://127.0.0.1/api/platform/v1/goods-flow/dashboard")), true);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.json().data.metrics, null);

    const saved = responseCapture();
    await handle(request("PUT", {
      id: "tmall-local", platform: "天猫", days: 30, effectiveFrom: "2026-01-01", reason: "本地验收", version: 1
    }, { "idempotency-key": "term-local" }), saved, new URL("http://127.0.0.1/api/platform/v1/goods-flow/receivable-terms"));
    assert.equal(saved.status, 200);
    assert.equal(saved.json().data.platform, "天猫");
    assert.match(await readFile(storagePath, "utf8"), /tmall-local/);

    const restarted = createGoodsFlowLocalPreview({ storagePath });
    const listed = responseCapture();
    await restarted(request("GET"), listed, new URL("http://127.0.0.1/api/platform/v1/goods-flow/receivable-terms"));
    assert.equal(listed.json().data[0].days, 30);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
