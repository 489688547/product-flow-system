import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  erpArchiveApiUrl,
  loadErpArchives,
  setErpArchiveDecision
} from "../src/state/erpCollectionApi.js";

test("ERP archive client uses the governed platform route", async () => {
  assert.equal(erpArchiveApiUrl(), "/api/platform/v1/erp-collection/archives");
  const calls = [];
  const payload = await loadErpArchives(async url => {
    calls.push(url);
    return new Response(JSON.stringify({ data: { archives: [{ id: "archive-1" }] } }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(calls, ["/api/platform/v1/erp-collection/archives?limit=100"]);
  assert.equal(payload.archives.length, 1);
});

test("ERP archive decision client writes the explicit decision and optimistic version", async () => {
  const calls = [];
  const payload = await setErpArchiveDecision({
    archiveId: "archive-1",
    expectedVersion: 2,
    ingestionDecision: "skipped",
    ingestionReasonCode: "DETAIL_STORAGE_DEFERRED"
  }, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      data: { archive: { id: "archive-1", ingestionDecision: "skipped", version: 3 } }
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(calls[0].url, "/api/platform/v1/erp-collection/archives");
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    archiveId: "archive-1",
    expectedVersion: 2,
    ingestionDecision: "skipped",
    ingestionReasonCode: "DETAIL_STORAGE_DEFERRED"
  });
  assert.equal(payload.archive.version, 3);
});

test("sync workspace renders local archive states without exposing absolute paths", () => {
  // 归档区块已拆为独立组件，避免继续堆在高频大文件里。
  const source = readFileSync("src/features/data-center/LocalArchivePanel.jsx", "utf8");
  // 归档区块扩展到全部 Provider，不再只讲快麦。
  assert.match(source, /本机原始归档/);
  // 31 个文件里 29 个不需要人做事，默认不与待办平铺。
  assert.match(source, /需要你处理/);
  assert.match(source, /全部文件都已了结/);
  assert.match(source, /等待导出/);
  assert.match(source, /需要你处理/);
  assert.match(source, /已归档，未纳入标准事实/);
  assert.match(source, /记录不入库原因/);
  assert.match(source, /value="">请选择原因/);
  assert.match(source, /disabled=\{saving \|\| !reason\}/);
  assert.match(source, /前往同步任务重试/);
  assert.match(source, /复制路径/);
  assert.match(source, /归档文件/);
  assert.doesNotMatch(source, /absolutePath/);
});
