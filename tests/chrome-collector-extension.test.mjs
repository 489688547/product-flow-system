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
    "https://erp.superboss.cc/*",
    "https://erpb.superboss.cc/*"
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
    "providers/registry.js",
    "providers/kuaimai.js"
  ];
  const source = (await Promise.all(files.map(file => readFile(new URL(file, extensionRoot), "utf8")))).join("\n");

  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
  assert.doesNotMatch(source, /task\.(selector|url|script)\b/);
  assert.doesNotMatch(source, /chrome\.cookies/);
});

test("Kuaimai async exports are completed through the bundled download center adapter", async () => {
  const contentScript = await readFile(new URL("content-script.js", extensionRoot), "utf8");
  const adapter = await readFile(new URL("providers/kuaimai.js", extensionRoot), "utf8");

  assert.match(adapter, /KUAIMAI_DOWNLOAD_CENTER_ROUTE/);
  assert.match(adapter, /selectKuaimaiDownloadRow/);
  assert.match(contentScript, /download_from_center/);
  assert.match(contentScript, /waitForKuaimaiOrderPage/);
  assert.match(contentScript, /KUAIMAI_DOWNLOAD_CENTER_TIMEOUT/);
  assert.match(await readFile(new URL("service-worker.js", extensionRoot), "utf8"), /downloadFilePrefixes/);
  assert.doesNotMatch(contentScript, /task\.(downloadCenter|selector|route|url)/);
});

test("extension task contract only allows registered provider resources", async () => {
  const { assertRegisteredTask, registeredResource } = await import(new URL("providers/registry.js", extensionRoot));

  assert.equal(registeredResource("kuaimai", "orders").providerId, "kuaimai");
  assert.equal(registeredResource("kuaimai", "order_items").resourceType, "order_items");
  assert.throws(
    () => assertRegisteredTask({ jobId: "job-1", providerId: "unknown", resourceType: "orders", businessDate: "2026-07-21" }),
    error => error?.code === "EXTENSION_TASK_NOT_REGISTERED"
  );
  assert.throws(
    () => assertRegisteredTask({ jobId: "job-1", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21", url: "https://evil.example" }),
    error => error?.code === "EXTENSION_TASK_UNSAFE_FIELDS"
  );
});
