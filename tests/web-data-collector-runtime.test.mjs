import assert from "node:assert/strict";
import test from "node:test";

import { assertBusinessDateMatchesRange } from "../scripts/web-data-collector/index.mjs";
import { createWebCollectorOrchestrator } from "../scripts/web-data-collector/orchestrator.mjs";

function apiDouble(job) {
  const calls = [];
  let claimed = false;
  return {
    calls,
    async heartbeat(input) { calls.push(["heartbeat", input]); },
    async ensurePlan(jobs) { calls.push(["ensurePlan", jobs]); return { jobs }; },
    async claim() {
      calls.push(["claim"]);
      if (claimed) return { job: null };
      claimed = true;
      return { job: { ...job, status: "claimed", attempt: 1 } };
    },
    async transition(input) { calls.push(["transition", input]); return { job: { ...job, status: input.status } }; },
    async complete(input) { calls.push(["complete", input]); return { job: { ...job, status: "success" } }; }
  };
}

const job = {
  id: "job-1",
  providerId: "kuaimai",
  resourceType: "orders",
  businessDate: "2026-07-21",
  scheduleVersion: "v1"
};

test("orchestrator schedules all extension-implemented Kuaimai resources after 05:00", async () => {
  const api = apiDouble(job);
  const orchestrator = createWebCollectorOrchestrator({ api, processDownload: async () => ({}) });

  await orchestrator.prepare({ now: "2026-07-22T05:01:00+08:00" });
  const plan = api.calls.find(([name]) => name === "ensurePlan")[1];
  assert.deepEqual(plan.map(item => item.resourceType), ["orders", "order_items", "sales_items"]);
  assert.deepEqual(plan.map(item => item.businessDate), ["2026-07-21", "2026-07-21", "2026-07-21"]);
});

test("download validation rejects a parsed range from another business date", () => {
  assert.doesNotThrow(() => assertBusinessDateMatchesRange({
    businessDate: "2026-07-22",
    rangeStart: "2026-07-22T00:00:41+08:00",
    rangeEnd: "2026-07-22T23:59:44+08:00"
  }));
  assert.throws(
    () => assertBusinessDateMatchesRange({
      businessDate: "2026-07-22",
      rangeStart: "2026-07-21T00:00:41+08:00",
      rangeEnd: "2026-07-21T23:59:44+08:00"
    }),
    error => error?.code === "WEB_COLLECTION_BUSINESS_DATE_MISMATCH"
  );
});

test("orchestrator returns a safe task and completes only after archive ingest", async () => {
  const api = apiDouble(job);
  const processed = [];
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async input => {
      processed.push({ fileName: input.fileName, resourceType: input.resourceType, businessDate: input.businessDate });
      await input.onValidated();
      return { batchId: "batch-1", archiveId: "archive-1", rowCount: 42, fileHash: "a".repeat(64) };
    }
  });

  const task = await orchestrator.nextTask();
  assert.deepEqual(task, {
    jobId: "job-1",
    providerId: "kuaimai",
    resourceType: "orders",
    businessDate: "2026-07-21",
    status: "opening",
    attempt: 1,
    scheduleVersion: "v1"
  });
  await orchestrator.submitResult({
    jobId: "job-1",
    providerId: "kuaimai",
    resourceType: "orders",
    status: "downloaded",
    stage: "downloading",
    downloadId: 7,
    fileName: "orders.xlsx"
  });

  assert.deepEqual(processed, [{ fileName: "orders.xlsx", resourceType: "orders", businessDate: "2026-07-21" }]);
  assert.deepEqual(api.calls.filter(([name]) => name === "transition").map(([, input]) => [input.from, input.status]), [
    ["claimed", "opening"],
    ["opening", "exporting"],
    ["exporting", "downloading"],
    ["downloading", "validating"],
    ["validating", "ingesting"]
  ]);
  assert.equal(api.calls.at(-1)[0], "complete");
});

test("orchestrator records login and verification as waiting_human without ingest", async () => {
  const api = apiDouble(job);
  let processed = false;
  const orchestrator = createWebCollectorOrchestrator({ api, processDownload: async () => { processed = true; } });
  await orchestrator.nextTask();
  await orchestrator.submitResult({
    jobId: "job-1",
    providerId: "kuaimai",
    resourceType: "orders",
    status: "waiting_login",
    stage: "opening",
    errorCode: "KUAIMAI_LOGIN_REQUIRED"
  });
  const terminal = api.calls.filter(([name]) => name === "transition").at(-1)[1];
  assert.equal(terminal.status, "waiting_human");
  assert.equal(processed, false);
});

test("orchestrator does not hand out the active job again while a download is being ingested", async () => {
  const api = apiDouble(job);
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async input => {
      await input.onValidated();
      await blocked;
      return { batchId: "batch-1", archiveId: "archive-1", rowCount: 1, fileHash: "a".repeat(64) };
    }
  });
  await orchestrator.nextTask();
  const resultPromise = orchestrator.submitResult({
    jobId: "job-1",
    providerId: "kuaimai",
    resourceType: "orders",
    status: "downloaded",
    stage: "downloading",
    downloadId: 7,
    fileName: "orders.xlsx"
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await orchestrator.nextTask(), null);
  release();
  await resultPromise;
});
