import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBusinessDateMatchesRange,
  assertCollectionFileMatchesTask,
  createCommerceFactUploader,
  experimentalModeEnabled
} from "../scripts/web-data-collector/index.mjs";
import { createWebCollectorOrchestrator } from "../scripts/web-data-collector/orchestrator.mjs";
import {
  WEB_COLLECTION_ADAPTERS,
  createKuaimaiProcessor,
  createProviderProcessorRegistry
} from "../scripts/web-data-collector/providers/index.mjs";
import { createDouyinProcessor } from "../scripts/web-data-collector/providers/douyin/index.mjs";

async function dedicatedRuntimeModules() {
  const [profileRegistry, runtime] = await Promise.all([
    import("../scripts/web-data-collector/browser/profile-registry.mjs").catch(() => ({})),
    import("../scripts/web-data-collector/browser/runtime.mjs").catch(() => ({}))
  ]);
  return { ...profileRegistry, ...runtime };
}

function apiDouble(job) {
  const calls = [];
  let claimed = false;
  return {
    calls,
    async heartbeat(input) { calls.push(["heartbeat", input]); },
    async ensurePlan(jobs) { calls.push(["ensurePlan", jobs]); return { jobs }; },
    async claim(leaseSeconds, input) {
      calls.push(["claim", leaseSeconds, input]);
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

test("experimental mode is off by default and requires an explicit runner switch", () => {
  assert.equal(experimentalModeEnabled(), false);
  assert.equal(experimentalModeEnabled("0"), false);
  assert.equal(experimentalModeEnabled("1"), true);
  assert.equal(experimentalModeEnabled("enabled"), true);
});

test("orchestrator schedules all extension-implemented Kuaimai resources after 10:00", async () => {
  const api = apiDouble(job);
  const orchestrator = createWebCollectorOrchestrator({ api, processDownload: async () => ({}) });

  await orchestrator.prepare({ now: "2026-07-22T10:01:00+08:00" });
  const plan = api.calls.find(([name]) => name === "ensurePlan")[1];
  assert.deepEqual(plan.map(item => item.resourceType), [
    "orders", "order_items", "sales_items", "products", "product_kits", "product_combinations", "inventory"
  ]);
  assert.deepEqual(plan.map(item => item.businessDate), [
    "2026-07-21", "2026-07-21", "2026-07-21", "2026-07-22", "2026-07-22", "2026-07-22", "2026-07-22"
  ]);
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

  const result = await orchestrator.prepare({ now: "2026-07-22T10:01:00+08:00" });
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

test("current product and inventory snapshots do not require an event date range", () => {
  for (const resourceType of ["products", "product_kits", "product_combinations", "inventory_snapshot"]) {
    assert.doesNotThrow(() => assertCollectionFileMatchesTask({
      resourceType,
      businessDate: "2026-07-24",
      rangeStart: null,
      rangeEnd: null
    }));
  }
});

test("Kuaimai inventory jobs are parsed as inventory_snapshot before controlled ingest", async () => {
  const processed = [];
  const processor = createKuaimaiProcessor(async input => {
    processed.push(input);
    return { batchId: "inventory-batch-1" };
  });

  await processor.process({
    job: {
      id: "job-inventory",
      providerId: "kuaimai",
      resourceType: "inventory",
      businessDate: "2026-07-26"
    },
    result: { safeFileName: "库存状态导出.xlsx" }
  });

  assert.deepEqual(processed, [{
    jobId: "job-inventory",
    fileName: "库存状态导出.xlsx",
    resourceType: "inventory_snapshot",
    businessDate: "2026-07-26",
    onValidated: undefined
  }]);
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

test("orchestrator does not expose an active Douyin task to another Chrome profile", async () => {
  const douyinJob = {
    ...job,
    id: "douyin-job-1",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "store_daily"
  };
  const api = apiDouble(douyinJob);
  const orchestrator = createWebCollectorOrchestrator({ api, processDownload: async () => ({}) });

  const ownerTask = await orchestrator.nextTask({ storeId: "store-a" });
  assert.equal(ownerTask.storeId, "store-a");
  assert.equal(await orchestrator.nextTask({ storeId: "store-b" }), null);
  assert.deepEqual(api.calls.find(([name]) => name === "claim"), ["claim", 300, { storeId: "store-a" }]);
});

test("dedicated mode keeps Douyin work away from the extension bridge", async () => {
  const douyinJob = {
    ...job,
    id: "douyin-job-1",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "store_daily"
  };
  const api = apiDouble(douyinJob);
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async () => ({}),
    executionMode: "dedicated"
  });

  assert.equal(await orchestrator.nextTask({ storeId: "store-a" }), null, "抖音的活不交给扩展");
  const dedicated = await orchestrator.nextTask({ storeId: "store-a", executor: "dedicated" });
  assert.equal(dedicated.storeId, "store-a");
  // 扩展在 dedicated 模式下领任务时不按 storeId 过滤：扩展只要存过抖音的 storeId，
  // 之后每次轮询都会带着它，按它过滤会把别的 provider 的任务一并挡在外面。
  assert.deepEqual(api.calls.find(([name]) => name === "claim"), ["claim", 300, {}]);
});

test("dedicated 模式下扩展仍能领到别的 provider 的任务", async () => {
  // 这是切换浏览器模式时最容易打断的地方：判据若是「扩展请求带了 storeId 就不给」，
  // 而扩展总是带着抖音的 storeId 轮询，快麦就再也领不到任务——表现只是「快麦不采了」，
  // 看不出跟切模式有关。判据必须是「这条任务归谁执行」。
  const kuaimaiJob = {
    ...job,
    id: "kuaimai-job-1",
    providerId: "kuaimai",
    storeId: "",
    resourceType: "sales_items"
  };
  const api = apiDouble(kuaimaiJob);
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async () => ({}),
    executionMode: "dedicated"
  });

  const task = await orchestrator.nextTask({ storeId: "store-a" });
  assert.ok(task, "扩展带着抖音的 storeId 轮询，也必须能领到快麦的任务");
  assert.equal(task.providerId, "kuaimai");
});

test("profile registry creates one safe local profile per assigned store", async () => {
  const { createBrowserProfileRegistry } = await dedicatedRuntimeModules();
  assert.equal(typeof createBrowserProfileRegistry, "function", "createBrowserProfileRegistry must be implemented");
  const registry = createBrowserProfileRegistry({ rootDir: "/managed/profiles" });

  const first = registry.register({
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "TIYES 提野星旗舰店"
  });
  const repeated = registry.register({
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "新名称"
  });

  assert.equal(first.profileKey, "douyin-ecommerce:90862283");
  assert.equal(repeated.profileKey, first.profileKey);
  assert.equal(registry.list().length, 1);
  assert.deepEqual(registry.listSafe(), [{
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "新名称",
    profileKey: "douyin-ecommerce:90862283"
  }]);
  assert.doesNotMatch(JSON.stringify(registry.listSafe()), /managed\/profiles|Users\//);
});

test("dedicated runtime fetches assigned stores and completes a short browser action", async () => {
  const { createDedicatedBrowserRuntime } = await dedicatedRuntimeModules();
  assert.equal(typeof createDedicatedBrowserRuntime, "function", "createDedicatedBrowserRuntime must be implemented");
  const calls = [];
  const runtime = createDedicatedBrowserRuntime({
    api: {
      async assignedStores() {
        calls.push(["assignedStores"]);
        return {
          stores: [{
            providerId: "douyin-ecommerce",
            storeId: "90862283",
            storeName: "TIYES 提野星旗舰店"
          }]
        };
      }
    },
    profileRegistry: {
      register(store) {
        calls.push(["register", store.storeId]);
        return { ...store, profileKey: `${store.providerId}:${store.storeId}`, profileDir: "/local/hidden" };
      }
    },
    ensureBrowser: async profile => {
      calls.push(["ensureBrowser", profile.profileKey]);
      return { ...profile, online: true, endpoint: "http://127.0.0.1:43127" };
    },
    orchestrator: {
      async nextTask(input) {
        calls.push(["nextTask", input]);
        return {
          jobId: "job-1",
          providerId: "douyin-ecommerce",
          storeId: "90862283",
          resourceType: "store_daily",
          businessDate: "2026-07-24"
        };
      },
      async submitResult(result) {
        calls.push(["submitResult", result.kind]);
        return { job: { status: "success" } };
      },
      recordBrowserStatus(status) {
        calls.push(["recordBrowserStatus", status]);
      }
    },
    executeTask: async ({ task, browser }) => {
      assert.equal(task.storeId, "90862283");
      assert.equal(browser.online, true);
      return {
        kind: "captured",
        jobId: "job-1",
        resourceType: "store_daily",
        facts: {},
        pageType: "shop_compass_overview",
        selectorVersion: "2026-07-25"
      };
    }
  });

  const result = await runtime.runOnce();

  assert.equal(result.processed, 1);
  assert.deepEqual(calls.find(([name]) => name === "nextTask"), [
    "nextTask",
    { storeId: "90862283", executor: "dedicated" }
  ]);
  assert.equal(calls.some(([name]) => name === "submitResult"), true);
});

test("collector runtime executes an assigned experimental bundle through the versioned run API", async () => {
  const { createExperimentalRunCycle } = await dedicatedRuntimeModules();
  assert.equal(typeof createExperimentalRunCycle, "function", "createExperimentalRunCycle must be implemented");
  const calls = [];
  const cycle = createExperimentalRunCycle({
    api: {
      async assignedExperimentalRuns() {
        calls.push(["assigned"]);
        return {
          runs: [{
            run: { id: "run-1", version: 1 },
            executionBundle: {
              runId: "run-1",
              runnerId: "runner-1",
              templateId: "research",
              version: 1,
              contentHash: "a".repeat(64),
              expiresAt: "2026-07-30T10:15:00.000Z",
              template: { mode: "experimental" }
            }
          }]
        };
      },
      async experimentalRunAction(runId, input, key) {
        calls.push(["action", runId, input.action, input.expectedVersion, key]);
        return {
          run: {
            id: runId,
            version: input.action === "start" ? 2 : 3,
            status: input.action === "start" ? "running" : "completed"
          }
        };
      }
    },
    executeRun: async bundle => {
      calls.push(["execute", bundle.runId]);
      return {
        runId: bundle.runId,
        status: "completed",
        quality: {
          requiredFieldsComplete: true,
          storeMatched: true,
          businessDateMatched: true,
          schemaMatched: true,
          coverage: 1
        }
      };
    }
  });

  const result = await cycle.runOnce();

  assert.deepEqual(result, { assigned: 1, processed: 1, waitingHuman: 0, failed: 0 });
  assert.deepEqual(calls.map(call => call.slice(0, 3)), [
    ["assigned"],
    ["action", "run-1", "start"],
    ["execute", "run-1"],
    ["action", "run-1", "complete"]
  ]);
  assert.match(calls[1][4], /^collector-run:run-1:start:1$/);
  assert.match(calls[3][4], /^collector-run:run-1:complete:2$/);
});

test("collector runtime reports safe failure without sending local output or paths", async () => {
  const { createExperimentalRunCycle } = await dedicatedRuntimeModules();
  const calls = [];
  const cycle = createExperimentalRunCycle({
    api: {
      async assignedExperimentalRuns() {
        return {
          runs: [{
            run: { id: "run-1", version: 1 },
            executionBundle: { runId: "run-1" }
          }]
        };
      },
      async experimentalRunAction(runId, input) {
        calls.push(input);
        return {
          run: {
            id: runId,
            version: input.action === "start" ? 2 : 3
          }
        };
      }
    },
    executeRun: async () => {
      throw Object.assign(new Error("failed at /Users/employee/report.xlsx token=secret"), {
        code: "COLLECTOR_COMMAND_FAILED"
      });
    }
  });

  const result = await cycle.runOnce();

  assert.deepEqual(result, { assigned: 1, processed: 0, waitingHuman: 0, failed: 1 });
  assert.equal(calls.at(-1).action, "fail");
  assert.equal(calls.at(-1).errorCode, "COLLECTOR_COMMAND_FAILED");
  assert.doesNotMatch(JSON.stringify(calls.at(-1)), /Users|report\.xlsx|token=|secret/i);
});

test("collector runtime pauses for human verification without recording a failed run", async () => {
  const { createExperimentalRunCycle } = await dedicatedRuntimeModules();
  const calls = [];
  const cycle = createExperimentalRunCycle({
    api: {
      async assignedExperimentalRuns() {
        return {
          runs: [{
            run: { id: "run-human", version: 1 },
            executionBundle: { runId: "run-human" }
          }]
        };
      },
      async experimentalRunAction(runId, input) {
        calls.push([runId, input]);
        return {
          run: {
            id: runId,
            version: input.action === "start" ? 2 : 3
          }
        };
      }
    },
    executeRun: async () => {
      throw Object.assign(new Error("验证码页面包含用户手机号"), {
        code: "COLLECTOR_HUMAN_VERIFICATION_REQUIRED"
      });
    }
  });

  const result = await cycle.runOnce();

  assert.deepEqual(result, { assigned: 1, processed: 0, waitingHuman: 1, failed: 0 });
  assert.equal(calls.at(-1)[1].action, "wait_human");
  assert.equal(calls.at(-1)[1].errorCode, "COLLECTOR_HUMAN_VERIFICATION_REQUIRED");
  assert.equal(calls.at(-1)[1].safeSummary, "请在公司 Mac 完成人工验证后重试。");
  assert.equal(calls.some(([, input]) => input.action === "fail"), false);
});

test("dedicated runtime resumes a downloaded checkpoint without repeating browser work", async () => {
  const { createDedicatedBrowserRuntime } = await dedicatedRuntimeModules();
  assert.equal(typeof createDedicatedBrowserRuntime, "function", "createDedicatedBrowserRuntime must be implemented");
  const calls = [];
  const checkpointResult = {
    kind: "downloaded",
    jobId: "job-1",
    filePath: "/managed/downloads/report.xlsx",
    safeFileName: "report.xlsx",
    pageType: "shop_compass_product",
    reportVersion: "douyin-product-v2"
  };
  const runtime = createDedicatedBrowserRuntime({
    api: {
      async assignedStores() {
        return {
          stores: [{
            providerId: "douyin-ecommerce",
            storeId: "90862283",
            storeName: "TIYES 提野星旗舰店"
          }]
        };
      }
    },
    profileRegistry: {
      register(store) {
        return { ...store, profileKey: `${store.providerId}:${store.storeId}`, profileDir: "/local/hidden" };
      }
    },
    ensureBrowser: async profile => ({ ...profile, online: true, endpoint: "http://127.0.0.1:43127" }),
    orchestrator: {
      async nextTask() {
        return {
          jobId: "job-1",
          providerId: "douyin-ecommerce",
          storeId: "90862283",
          resourceType: "product_daily",
          businessDate: "2026-07-24"
        };
      },
      async submitResult(result) {
        calls.push(["submitResult", result]);
        return { job: { status: "success" } };
      },
      recordBrowserStatus() {}
    },
    checkpointStore: {
      async load(jobId) {
        calls.push(["load", jobId]);
        return { stage: "downloaded", result: checkpointResult };
      },
      async save() {
        throw new Error("must not save recovered result");
      },
      async clear(jobId) {
        calls.push(["clear", jobId]);
      }
    },
    executeTask: async () => {
      throw new Error("browser work must not repeat");
    }
  });

  const result = await runtime.runOnce();

  assert.equal(result.processed, 1);
  assert.deepEqual(calls, [
    ["load", "job-1"],
    ["submitResult", checkpointResult],
    ["clear", "job-1"]
  ]);
});

test("dedicated runtime carries processor resume state across stage checkpoints", async () => {
  const { createDedicatedBrowserRuntime } = await dedicatedRuntimeModules();
  const calls = [];
  const checkpointResult = {
    kind: "downloaded",
    jobId: "job-1",
    filePath: "/managed/downloads/report.xlsx",
    safeFileName: "report.xlsx",
    pageType: "shop_compass_product",
    reportVersion: "douyin-product-v2"
  };
  const resume = {
    archive: {
      relativeArchiveKey: "douyin-ecommerce/90862283/product_daily/2026/07/report.xlsx",
      fileHash: "a".repeat(64)
    },
    nextChunkIndex: 1
  };
  const runtime = createDedicatedBrowserRuntime({
    api: {
      async assignedStores() {
        return {
          stores: [{
            providerId: "douyin-ecommerce",
            storeId: "90862283",
            storeName: "TIYES 提野星旗舰店"
          }]
        };
      }
    },
    profileRegistry: {
      register(store) {
        return { ...store, profileKey: `${store.providerId}:${store.storeId}`, profileDir: "/local/hidden" };
      }
    },
    ensureBrowser: async profile => ({ ...profile, online: true, endpoint: "http://127.0.0.1:43127" }),
    orchestrator: {
      async nextTask() {
        return {
          jobId: "job-1",
          providerId: "douyin-ecommerce",
          storeId: "90862283",
          resourceType: "product_daily",
          businessDate: "2026-07-24"
        };
      },
      async submitResult(result, options) {
        calls.push(["submitResult", result, options.resume]);
        await options.onCheckpoint("submitted", {
          ...options.resume,
          processed: {
            batchId: "batch-1",
            rowCount: 501,
            relativeArchiveKey: options.resume.archive.relativeArchiveKey,
            fileHash: options.resume.archive.fileHash,
            sourceVersion: "douyin-product-v2",
            completedCount: 501
          }
        });
        return { job: { status: "success" } };
      },
      recordBrowserStatus() {}
    },
    checkpointStore: {
      async load() {
        return { stage: "uploading", result: checkpointResult, resume };
      },
      async save(jobId, checkpoint) {
        calls.push(["save", jobId, checkpoint]);
      },
      async clear(jobId) {
        calls.push(["clear", jobId]);
      }
    },
    executeTask: async () => {
      throw new Error("browser work must not repeat");
    }
  });

  await runtime.runOnce();

  assert.deepEqual(calls[0], ["submitResult", checkpointResult, resume]);
  assert.equal(calls[1][0], "save");
  assert.equal(calls[1][2].stage, "submitted");
  assert.deepEqual(calls[1][2].result, checkpointResult);
  assert.equal(calls[1][2].resume.processed.batchId, "batch-1");
  assert.deepEqual(calls.at(-1), ["clear", "job-1"]);
});

test("dedicated runtime records a safe failed result and local diagnostic when browser action crashes", async () => {
  const { createDedicatedBrowserRuntime } = await dedicatedRuntimeModules();
  assert.equal(typeof createDedicatedBrowserRuntime, "function", "createDedicatedBrowserRuntime must be implemented");
  const calls = [];
  const runtime = createDedicatedBrowserRuntime({
    api: {
      async assignedStores() {
        return {
          stores: [{
            providerId: "douyin-ecommerce",
            storeId: "90862283",
            storeName: "TIYES 提野星旗舰店"
          }]
        };
      }
    },
    profileRegistry: {
      register(store) {
        return { ...store, profileKey: `${store.providerId}:${store.storeId}`, profileDir: "/local/hidden" };
      }
    },
    ensureBrowser: async profile => ({ ...profile, online: true, endpoint: "http://127.0.0.1:43127" }),
    orchestrator: {
      async nextTask() {
        return {
          jobId: "job-1",
          providerId: "douyin-ecommerce",
          storeId: "90862283",
          resourceType: "product_daily",
          businessDate: "2026-07-24"
        };
      },
      async submitResult(result) {
        calls.push(["submitResult", result]);
      },
      recordBrowserStatus() {}
    },
    diagnosticStore: {
      async write(input) {
        calls.push(["diagnostic", input]);
        return {
          diagnosticId: "diag_aaaaaaaaaaaaaaaaaaaaaaaa",
          errorCode: input.errorCode,
          createdAt: "2026-07-25T09:00:00.000Z"
        };
      }
    },
    diagnosticPageType: () => "shop_compass_product",
    executeTask: async () => {
      throw Object.assign(new Error("raw customer page detail"), {
        code: "DOUYIN_ACTION_FAILED",
        localArtifact: Buffer.from("encrypted locally")
      });
    }
  });

  const result = await runtime.runOnce();
  const submitted = calls.find(([name]) => name === "submitResult")[1];

  assert.equal(result.failed, 1);
  assert.deepEqual(submitted, {
    kind: "failed",
    jobId: "job-1",
    errorCode: "DOUYIN_ACTION_FAILED",
    safeSummary: "本机浏览器操作失败，诊断编号 diag_aaaaaaaaaaaaaaaaaaaaaaaa。",
    stage: "opening"
  });
  assert.doesNotMatch(JSON.stringify(submitted), /raw customer|encrypted locally|Users\//i);
});

test("orchestrator releases an expired in-memory lease before the extension asks for another task", async () => {
  let clock = new Date("2026-07-25T02:40:00.000Z");
  let attempt = 0;
  const calls = [];
  const api = {
    async heartbeat(input) { calls.push(["heartbeat", input]); },
    async claim() {
      attempt += 1;
      calls.push(["claim", attempt]);
      return {
        job: {
          ...job,
          status: "claimed",
          attempt,
          leaseExpiresAt: new Date(clock.valueOf() + 300_000).toISOString()
        }
      };
    },
    async transition(input) {
      calls.push(["transition", input]);
      return {
        job: {
          ...job,
          status: input.status,
          attempt,
          leaseExpiresAt: new Date(clock.valueOf() + 300_000).toISOString()
        }
      };
    }
  };
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async () => ({}),
    now: () => clock
  });

  const first = await orchestrator.nextTask();
  clock = new Date("2026-07-25T02:46:00.000Z");
  const reclaimed = await orchestrator.nextTask();

  assert.equal(first.attempt, 1);
  assert.equal(reclaimed.attempt, 2);
  assert.equal(calls.filter(([name]) => name === "claim").length, 2);
});

test("runner heartbeat distinguishes the background service from a real Chrome extension poll", async () => {
  let clock = new Date("2026-07-25T02:40:00.000Z");
  const api = apiDouble(job);
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async () => ({}),
    now: () => clock
  });

  await orchestrator.prepare();
  assert.equal(api.calls.filter(([name]) => name === "heartbeat").at(-1)[1].chromeStatus, "extension_offline");

  await orchestrator.nextTask();
  await orchestrator.prepare();
  assert.equal(api.calls.filter(([name]) => name === "heartbeat").at(-1)[1].chromeStatus, "extension_online");

  clock = new Date("2026-07-25T02:43:01.000Z");
  await orchestrator.prepare();
  assert.equal(api.calls.filter(([name]) => name === "heartbeat").at(-1)[1].chromeStatus, "extension_offline");
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

test("Douyin captured product facts are normalized and completed as one immutable batch", async () => {
  const uploads = [];
  const processor = createDouyinProcessor({
    uploadFactChunk: async input => {
      uploads.push(input);
      return { completedCount: input.expectedCount };
    }
  });
  const captured = {
    kind: "captured",
    resourceType: "product_daily",
    facts: [{
      productId: "3718502021305860341",
      skuId: null,
      productName: "莓果冻干主粮",
      skuName: null,
      merchantCode: null,
      exposureUsers: 48_100,
      clickUsers: 3_346,
      transactionBuyers: 575,
      transactionOrderCount: 593,
      transactionQuantity: null,
      transactionAmount: null,
      userPaymentAmount: 15_199.11,
      refundOrderCount: null,
      refundQuantity: null,
      refundAmount: null
    }],
    pageType: "shop_compass_product",
    selectorVersion: "2026-07-31"
  };

  const processed = await processor.process({
    job: {
      id: "douyin-product-job-1",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "product_daily",
      businessDate: "2026-07-30"
    },
    result: captured
  });

  assert.equal(processed.rowCount, 1);
  assert.equal(processed.confidence, "medium");
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].facts[0].productId, "3718502021305860341");
  assert.equal(uploads[0].facts[0].businessDate, "2026-07-30");
  assert.equal(uploads[0].facts[0].userPaymentAmount, 15_199.11);
  assert.equal(uploads[1].complete, true);
  assert.equal(uploads[1].expectedCount, 1);
});

test("Douyin processor resumes after an uploaded chunk and checkpoints final submission", async () => {
  const uploads = [];
  const stages = [];
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
    result: captured,
    resume: { nextChunkIndex: 1 },
    onStage: async (stage, state) => {
      stages.push([stage, structuredClone(state)]);
    }
  });

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].complete, true);
  assert.deepEqual(stages.map(([stage]) => stage), ["validated", "uploading", "submitted"]);
  assert.equal(stages.at(-1)[1].processed.batchId, processed.batchId);

  uploads.length = 0;
  assert.deepEqual(await processor.process({
    job: {
      id: "douyin-job-1",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-23"
    },
    result: captured,
    resume: stages.at(-1)[1]
  }), processed);
  assert.equal(uploads.length, 0);
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
  assert.equal(
    api.calls.filter(([name]) => name === "transition").at(-1)[1].errorSummary,
    "本机文件处理或入库失败。"
  );
});

test("dedicated 模式下专用浏览器不得领到别的 provider 的任务", async () => {
  // 专用浏览器执行器只认抖音任务，拿到别的平台会直接判 DOUYIN_TASK_INVALID。
  // 实测 08-02 的 kuaimai inventory 与 orders 就是这么被判失败的——领错了活，
  // 而且失败得像是快麦自己出了问题。先前只堵了「抖音的活不给扩展」，漏了反方向。
  const kuaimaiJob = {
    ...job,
    id: "kuaimai-job-2",
    providerId: "kuaimai",
    storeId: "",
    resourceType: "inventory"
  };
  const api = apiDouble(kuaimaiJob);
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processDownload: async () => ({}),
    executionMode: "dedicated"
  });

  assert.equal(await orchestrator.nextTask({ storeId: "store-a", executor: "dedicated" }), null);
  // 同一条任务，扩展来领就应当拿得到。
  assert.equal((await orchestrator.nextTask({ storeId: "store-a" }))?.providerId, "kuaimai");
});

test("已领取的任务交给谁，日志必须记下来", async () => {
  // 加日志是为了回答「谁领走了什么」。领取与交付是两轮：领取发生在一个执行器轮询时，
  // 交付发生在另一个执行器来取时。原先只记了领取那一步，实测时日志全程沉默——
  // 在最需要它的时候是哑的。
  const douyinJob = { ...job, id: "douyin-job-log", providerId: "douyin-ecommerce", storeId: "store-a", resourceType: "store_daily" };
  const api = apiDouble(douyinJob);
  const orchestrator = createWebCollectorOrchestrator({ api, processDownload: async () => ({}), executionMode: "dedicated" });

  const lines = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = chunk => { lines.push(String(chunk)); return true; };
  try {
    await orchestrator.nextTask({ storeId: "store-a" });                          // 扩展轮询：领取并扣下
    await orchestrator.nextTask({ storeId: "store-a", executor: "dedicated" });   // 专用浏览器来取：交付
  } finally {
    process.stdout.write = write;
  }
  const 全部 = lines.join("");
  assert.match(全部, /扣下 douyin-ecommerce\/store_daily/, "扣下要记");
  assert.match(全部, /交付 douyin-ecommerce\/store_daily .* → dedicated/, "交付给谁也要记");
});
