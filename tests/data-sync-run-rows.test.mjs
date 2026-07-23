import assert from "node:assert/strict";
import test from "node:test";

import { buildDataSyncRunRows } from "../src/domain/dataSyncRunRows.js";

test("data sync rows merge terminal Chrome runs with their job metadata", () => {
  const rows = buildDataSyncRunRows({
    legacyRuns: [],
    jobs: [{
      id: "job-1",
      providerId: "kuaimai",
      resourceType: "orders",
      businessDate: "2026-07-22",
      range: { start: "2026-07-22T00:00:00+08:00", end: "2026-07-22T23:59:59+08:00" },
      status: "success"
    }],
    runs: [{
      id: "run-1",
      jobId: "job-1",
      status: "success",
      stage: "ingesting",
      rowCount: 6822,
      completedAt: "2026-07-23T10:51:36.257Z"
    }]
  });

  assert.deepEqual(rows, [{
    id: "web:run-1",
    sourceId: "kuaimai",
    sourceName: "快麦 ERP · 订单",
    resourceType: "orders",
    from: "2026-07-22",
    to: "2026-07-22",
    rowCount: 6822,
    status: "success",
    stage: "ingesting",
    startedAt: null,
    completedAt: "2026-07-23T10:51:36.257Z",
    message: "Chrome 采集完成，原始文件已归档并入库。"
  }]);
});

test("data sync rows keep failure history and active jobs without inventing row counts", () => {
  const rows = buildDataSyncRunRows({
    jobs: [
      { id: "job-failed", providerId: "kuaimai", resourceType: "sales_items", businessDate: "2026-07-21", status: "failed", stage: "validating" },
      { id: "job-active", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "ingesting", stage: "ingesting", startedAt: "2026-07-23T10:00:00.000Z" },
      { id: "job-old-failure", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-20", status: "failed", stage: "downloading", errorCode: "EXTENSION_DOWNLOAD_TIMEOUT", completedAt: "2026-07-23T08:00:00.000Z" }
    ],
    runs: [{
      id: "run-failed",
      jobId: "job-failed",
      status: "failed",
      stage: "validating",
      errorCode: "KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING",
      errorSummary: null,
      completedAt: "2026-07-23T09:00:00.000Z"
    }]
  });

  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, "running");
  assert.equal(rows[0].rowCount, null);
  assert.equal(rows[1].status, "failed");
  assert.match(rows[1].message, /KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING/);
  assert.equal(rows[2].status, "failed");
  assert.match(rows[2].message, /EXTENSION_DOWNLOAD_TIMEOUT/);
});
