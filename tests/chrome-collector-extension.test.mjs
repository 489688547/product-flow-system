import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const extensionRoot = new URL("../chrome-extension/company-data-collector/", import.meta.url);

test("MV3 extension uses a stable identity and least-privilege permissions", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionRoot), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(typeof manifest.key, "string");
  assert.ok(manifest.key.length > 100);
  assert.deepEqual(manifest.permissions.sort(), ["alarms", "downloads", "storage", "tabs"]);
  assert.deepEqual(manifest.host_permissions.sort(), [
    "http://127.0.0.1:17653/*",
    "https://compass.jinritemai.com/*",
    "https://erp.superboss.cc/*",
    "https://erpb.superboss.cc/*",
    "https://fxg.jinritemai.com/*"
  ]);
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.background.service_worker, "service-worker.js");

  const forbiddenPermissions = ["cookies", "history", "webRequest", "webRequestBlocking", "debugger", "nativeMessaging"];
  forbiddenPermissions.forEach(permission => assert.equal(manifest.permissions.includes(permission), false));
});

test("extension source never evaluates remote code or accepts remote selectors", async () => {
  const files = [
    "service-worker.js",
    "content-script.js",
    "douyin-content-script.js",
    "providers/registry.js",
    "providers/kuaimai.js",
    "providers/douyin.js",
    "providers/executors/douyin.js"
  ];
  const source = (await Promise.all(files.map(file => readFile(new URL(file, extensionRoot), "utf8")))).join("\n");

  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
  assert.doesNotMatch(source, /task\.(selector|url|script)\b/);
  assert.doesNotMatch(source, /chrome\.cookies/);
});

test("Kuaimai async exports are completed through the bundled download center adapter", async () => {
  const contentScript = await readFile(new URL("content-script.js", extensionRoot), "utf8");
  const executor = await readFile(new URL("providers/executors/kuaimai.js", extensionRoot), "utf8");
  const adapter = await readFile(new URL("providers/kuaimai.js", extensionRoot), "utf8");
  const serviceWorker = await readFile(new URL("service-worker.js", extensionRoot), "utf8");

  assert.match(adapter, /KUAIMAI_DOWNLOAD_CENTER_ROUTE/);
  assert.match(adapter, /selectKuaimaiDownloadRow/);
  assert.match(executor, /download_from_center/);
  assert.match(executor, /waitForKuaimaiOrderPage/);
  assert.match(executor, /KUAIMAI_DOWNLOAD_CENTER_TIMEOUT/);
  assert.match(contentScript, /COLLECTOR_CONTENT_SCRIPT_PROBE/);
  assert.match(executor, /assertAppliedKuaimaiRange/);
  assert.match(executor, /openKuaimaiExportDialog/);
  assert.match(serviceWorker, /downloadFilePrefixes/);
  assert.match(serviceWorker, /registeredTaskUrl/);
  assert.match(serviceWorker, /probeContentScript/);
  assert.match(serviceWorker, /COLLECTOR_CONTENT_SCRIPT_PROBE/);
  assert.match(serviceWorker, /chrome\.tabs\.reload\(tab\.id\)/);
  assert.match(serviceWorker, /registeredDirectDownload/);
  assert.match(serviceWorker, /chrome\.downloads\.download/);
  assert.match(serviceWorker, /ensurePollAlarm/);
  assert.doesNotMatch(`${contentScript}\n${executor}`, /task\.(downloadCenter|selector|route|url)/);
});

test("Douyin content execution supports safe capture and official downloads only", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionRoot), "utf8"));
  const contentScript = await readFile(new URL("douyin-content-script.js", extensionRoot), "utf8");
  const executor = await readFile(new URL("providers/executors/douyin.js", extensionRoot), "utf8");
  const serviceWorker = await readFile(new URL("service-worker.js", extensionRoot), "utf8");

  const douyinScript = manifest.content_scripts.find(entry =>
    entry.js.includes("douyin-content-script.js")
  );
  assert.deepEqual(douyinScript.matches.sort(), [
    "https://compass.jinritemai.com/*",
    "https://fxg.jinritemai.com/*"
  ]);
  assert.match(contentScript, /executeDouyinTask/);
  assert.match(executor, /download_official_report|clickOfficialReport/);
  assert.match(executor, /captureStoreOverview/);
  assert.match(executor, /DOUYIN_HUMAN_VERIFICATION_REQUIRED|classifyDouyinPage/);
  assert.match(serviceWorker, /result\?\.kind === "captured"/);
  assert.match(serviceWorker, /safeFileName/);
  assert.doesNotMatch(executor, /chrome\.(cookies|debugger|webRequest)/);
  assert.doesNotMatch(executor, /task\.(url|selector|script)/);
});

test("extension task contract only allows registered provider resources", async () => {
  const { assertRegisteredTask, registeredResource, registeredTaskUrl } = await import(new URL("providers/registry.js", extensionRoot));

  assert.equal(registeredResource("kuaimai", "orders").providerId, "kuaimai");
  assert.equal(registeredResource("kuaimai", "order_items").resourceType, "order_items");
  assert.equal(registeredResource("douyin-ecommerce", "store_daily").providerId, "douyin-ecommerce");
  assert.equal(registeredResource("douyin-ecommerce", "video_daily").resourceType, "video_daily");
  assert.match(
    registeredTaskUrl({
      jobId: "job-1",
      providerId: "kuaimai",
      resourceType: "orders",
      businessDate: "2026-07-21"
    }),
    /startTime=1784563200000&endTime=1784649599000/
  );
  assert.throws(
    () => assertRegisteredTask({ jobId: "job-1", providerId: "unknown", resourceType: "orders", businessDate: "2026-07-21" }),
    error => error?.code === "EXTENSION_TASK_NOT_REGISTERED"
  );
  assert.throws(
    () => assertRegisteredTask({
      jobId: "douyin-job-1",
      providerId: "douyin-ecommerce",
      resourceType: "store_daily",
      businessDate: "2026-07-23"
    }),
    error => error?.code === "EXTENSION_TASK_INVALID"
  );
  assert.throws(
    () => assertRegisteredTask({ jobId: "job-1", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21", url: "https://evil.example" }),
    error => error?.code === "EXTENSION_TASK_UNSAFE_FIELDS"
  );
  assert.equal(
    assertRegisteredTask({
      jobId: "job-1",
      providerId: "kuaimai",
      storeId: "store-a",
      resourceType: "orders",
      businessDate: "2026-07-21"
    }).storeId,
    "store-a"
  );
  assert.throws(
    () => assertRegisteredTask({
      jobId: "job-1",
      providerId: "kuaimai",
      storeId: "../unsafe",
      resourceType: "orders",
      businessDate: "2026-07-21"
    }),
    error => error?.code === "EXTENSION_TASK_INVALID"
  );
});
