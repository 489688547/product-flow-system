import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBusinessDateMatchesRange,
  createCommerceFactUploader
} from "../scripts/web-data-collector/index.mjs";
import { createWebCollectorOrchestrator } from "../scripts/web-data-collector/orchestrator.mjs";
import {
  WEB_COLLECTION_ADAPTERS,
  createProviderProcessorRegistry
} from "../scripts/web-data-collector/providers/index.mjs";
import { createDouyinProcessor } from "../scripts/web-data-collector/providers/douyin/index.mjs";

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

test("orchestrator prefers the server-owned registered-store plan", async () => {
  const api = apiDouble(job);
  api.ensureRegisteredPlan = async () => {
    api.calls.push(["ensureRegisteredPlan"]);
    return { jobs: [{ providerId: "douyin-ecommerce", storeId: "store-a" }] };
  };
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async () => ({})
  });

  const result = await orchestrator.prepare({ now: "2026-07-22T05:01:00+08:00" });
  assert.equal(api.calls.some(([name]) => name === "ensureRegisteredPlan"), true);
  assert.deepEqual(result.jobs, [{ providerId: "douyin-ecommerce", storeId: "store-a" }]);
});

test("provider processor registry resolves Kuaimai and Douyin and fails closed for unknown providers", () => {
  const registry = createProviderProcessorRegistry([
    { id: "kuaimai", process: async () => ({}) },
    { id: "douyin-ecommerce", process: async () => ({}) }
  ]);

  assert.equal(registry.require("kuaimai").id, "kuaimai");
  assert.equal(registry.require("douyin-ecommerce").id, "douyin-ecommerce");
  assert.throws(
    () => registry.require("unknown"),
    error => error?.code === "PROCESSOR_NOT_REGISTERED"
  );
  assert.equal(WEB_COLLECTION_ADAPTERS.some(adapter => adapter.id === "kuaimai"), true);
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

test("commerce fact uploader uses the runner grant and fixed ingest route", async () => {
  const requests = [];
  const upload = createCommerceFactUploader({
    baseUrl: "https://flow.example.com/",
    runnerToken: `wdc_${"a".repeat(48)}`,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ data: { status: "completed", completedCount: 1 } }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }
  });
  const result = await upload({ jobId: "job-1", facts: [] });

  assert.equal(requests[0].url, "https://flow.example.com/api/platform/v1/commerce-facts/ingest");
  assert.equal(requests[0].options.headers.authorization, `Bearer wdc_${"a".repeat(48)}`);
  assert.deepEqual(JSON.parse(requests[0].options.body), { jobId: "job-1", facts: [] });
  assert.equal(result.completedCount, 1);
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

test("Douyin captured store facts are validated and completed as one immutable batch", async () => {
  const uploads = [];
  const processor = createDouyinProcessor({
    uploadFactChunk: async input => {
      uploads.push(input);
      return { completedCount: input.expectedCount };
    }
  });
  const captured = {
    kind: "captured",
    resourceType: "store_daily",
    facts: {
      transactionAmount: 100,
      transactionOrderCount: 2,
      transactionBuyerCount: 2,
      userPaymentAmount: 90,
      settlementAmount: null,
      refundAmountByPaymentDate: null,
      refundAmountByRefundDate: 5,
      refundOrderCountByPaymentDate: null,
      refundOrderCountByRefundDate: 1,
      productExposureUsers: 1000,
      productClickUsers: 100
    },
    pageType: "shop_compass_overview",
    selectorVersion: "2026-07-24"
  };

  const processed = await processor.process({
    job: {
      id: "douyin-job-1",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-23"
    },
    result: captured
  });

  assert.equal(processed.rowCount, 1);
  assert.equal(processed.confidence, "medium");
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].facts[0].storeId, "store-a");
  assert.equal(uploads[1].complete, true);
});

test("processor failure records a failed transition and never completes the job", async () => {
  const douyinJob = {
    id: "douyin-job-2",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "product_daily",
    businessDate: "2026-07-23",
    scheduleVersion: "v1"
  };
  const api = apiDouble(douyinJob);
  const processors = createProviderProcessorRegistry([{
    id: "douyin-ecommerce",
    async process() {
      throw Object.assign(new Error("parse failed"), { code: "DOUYIN_REPORT_SCHEMA_CHANGED" });
    }
  }]);
  const orchestrator = createWebCollectorOrchestrator({ api, processors });
  await orchestrator.nextTask();

  await assert.rejects(
    () => orchestrator.submitResult({
      kind: "downloaded",
      jobId: "douyin-job-2",
      downloadId: 9,
      safeFileName: "商品报表.xlsx",
      pageType: "shop_compass_product",
      reportVersion: "douyin-product-v1"
    }),
    error => error?.code === "DOUYIN_REPORT_SCHEMA_CHANGED"
  );

  assert.equal(api.calls.some(([name]) => name === "complete"), false);
  assert.equal(
    api.calls.filter(([name]) => name === "transition").at(-1)[1].status,
    "failed"
  );
});
