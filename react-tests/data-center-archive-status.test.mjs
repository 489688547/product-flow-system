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
  const source = readFileSync("src/features/data-center/DataGovernanceWorkspaces.jsx", "utf8");
  assert.match(source, /快麦原始归档/);
  assert.match(source, /等待导出/);
  assert.match(source, /归档文件/);
  assert.doesNotMatch(source, /absolutePath/);
});

