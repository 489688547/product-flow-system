import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncSupplyApprovalPages } from "../src/state/supplyChainApi.js";

test("approval client drains purchase pages before payment pages with one fixed time range", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const nextCursor = body.batch.kind === "purchase" && body.batch.cursor === 0 ? 18 : null;
    return Response.json({
      synced: true,
      counts: body.batch.kind === "purchase"
        ? { purchase: body.batch.cursor === 0 ? 18 : 4, payment: 0, unmapped: 1, skipped: 0 }
        : { purchase: 0, payment: 7, unmapped: 0, skipped: 2 },
      continuation: { kind: body.batch.kind, nextCursor }
    });
  };

  const result = await syncSupplyApprovalPages({
    fetchImpl,
    now: 1722470400000,
    url: "/api/supply-chain/approvals/sync"
  });

  assert.deepEqual(requests.map(item => [item.batch.kind, item.batch.cursor]), [
    ["purchase", 0],
    ["purchase", 18],
    ["payment", 0]
  ]);
  assert.ok(requests.every(item => item.startTime === requests[0].startTime && item.endTime === requests[0].endTime));
  assert.deepEqual(result.counts, { purchase: 22, payment: 7, unmapped: 2, skipped: 2 });
});

test("supply provider uses the paged approval client before refreshing state", () => {
  const provider = readFileSync(new URL("../src/state/SupplyChainProvider.jsx", import.meta.url), "utf8");
  assert.match(provider, /syncSupplyApprovalPages/);
  assert.match(provider, /await syncSupplyApprovalPages\(\{ input \}\)/);
});
