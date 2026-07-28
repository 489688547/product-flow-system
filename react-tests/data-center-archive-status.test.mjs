import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { erpArchiveApiUrl, loadErpArchives } from "../src/state/erpCollectionApi.js";

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

test("sync workspace renders local archive states without exposing absolute paths", () => {
  // 归档区块已拆为独立组件，避免继续堆在高频大文件里。
  const source = readFileSync("src/features/data-center/LocalArchivePanel.jsx", "utf8");
  // 归档区块扩展到全部 Provider，不再只讲快麦。
  assert.match(source, /本机原始归档/);
  assert.match(source, /等待导出/);
  // 已下载未入库必须与已入库区分：线上数字并不包含前者。
  assert.match(source, /已下载未入库/);
  assert.match(source, /复制路径/);
  assert.match(source, /归档文件/);
  assert.doesNotMatch(source, /absolutePath/);
});

