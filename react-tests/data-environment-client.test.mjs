import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const clientPath = resolve(root, "src/state/dataEnvironmentClient.js");
const apiPath = resolve(root, "src/state/dataEnvironmentApi.js");
const providerPath = resolve(root, "src/state/DataEnvironmentProvider.jsx");
const settingsPath = resolve(root, "src/features/settings/DataEnvironmentSettings.jsx");

test("data environment API loads and switches through the safe control route", async () => {
  assert.equal(existsSync(apiPath), true);
  const {
    createDisplayRefresh,
    loadDataEnvironment,
    loadDisplayRefresh,
    runDisplayRefreshStep,
    switchDataEnvironment
  } = await import(apiPath);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/refresh")) {
      return new Response(JSON.stringify({
        job: {
          id: "job-1",
          status: url.endsWith("/step") ? "running" : "queued",
          stage: "preflight",
          terminal: false
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      current: { id: options.method === "PUT" ? "display" : "production", version: options.method === "PUT" ? 7 : 1 },
      display: { enabled: true, status: "ready", version: 7 },
      permissions: { canManage: true }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  assert.equal((await loadDataEnvironment(fetchImpl)).current.id, "production");
  assert.equal((await switchDataEnvironment("display", fetchImpl)).current.id, "display");
  assert.equal((await createDisplayRefresh(fetchImpl)).job.id, "job-1");
  assert.equal((await loadDisplayRefresh("job-1", fetchImpl)).job.status, "queued");
  assert.equal((await runDisplayRefreshStep("job-1", fetchImpl)).job.status, "running");
  assert.deepEqual(calls.map(call => [call.url, call.options.method || "GET"]), [
    ["/api/platform/v1/data-environment", "GET"],
    ["/api/platform/v1/data-environment", "PUT"],
    ["/api/platform/v1/data-environment/refresh", "POST"],
    ["/api/platform/v1/data-environment/refresh/job-1", "GET"],
    ["/api/platform/v1/data-environment/refresh/job-1/step", "POST"]
  ]);
  assert.equal(JSON.parse(calls[1].options.body).environmentId, "display");
  assert.equal(calls[1].options.credentials, "include");
});

test("request boundary adds the selected version to writes and invalidates old requests", async () => {
  assert.equal(existsSync(clientPath), true);
  const { createDataEnvironmentRequestBoundary } = await import(clientPath);
  const calls = [];
  let resolvePending;
  const boundary = createDataEnvironmentRequestBoundary({
    fetchImpl: async (input, init = {}) => {
      calls.push({ input, init });
      if (String(input).includes("pending")) {
        return new Promise(resolveRequest => { resolvePending = resolveRequest; });
      }
      return new Response("{}", { status: 200 });
    }
  });

  boundary.activate({ id: "display", version: 7, versionRequired: true });
  await boundary.fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" } });
  assert.equal(new Headers(calls[0].init.headers).get("x-data-environment-version"), "7");

  const pending = boundary.fetch("/api/pending");
  boundary.activate({ id: "production", version: 1, versionRequired: true });
  resolvePending(new Response("{}", { status: 200 }));
  await assert.rejects(pending, error => error?.code === "DATA_ENVIRONMENT_CHANGED");
});

test("business browser caches are isolated and legacy values migrate only to production", async () => {
  const { environmentStorageKey, migrateLegacyProductionCache } = await import(clientPath);
  const values = new Map([["productFlowState", "{\"legacy\":true}"]]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };

  assert.equal(environmentStorageKey("productFlowState", "production"), "productFlowState:production");
  assert.equal(environmentStorageKey("productFlowState", "display"), "productFlowState:display");
  assert.equal(migrateLegacyProductionCache(storage, "productFlowState", "production"), true);
  assert.equal(values.get("productFlowState:production"), "{\"legacy\":true}");
  assert.equal(migrateLegacyProductionCache(storage, "productFlowState", "display"), false);
  assert.equal(values.has("productFlowState:display"), false);
});

test("authenticated app gates business providers behind the environment provider", () => {
  assert.equal(existsSync(providerPath), true);
  const main = readFileSync(resolve(root, "src/main.jsx"), "utf8");
  const provider = readFileSync(providerPath, "utf8");
  const settings = readFileSync(settingsPath, "utf8");

  assert.match(main, /<DataEnvironmentProvider>[\s\S]*<ProductCatalogProvider>/);
  assert.match(provider, /key=\{`\$\{environment\.current\.id\}:\$\{environment\.current\.version\}`\}/);
  assert.match(provider, /activateDataEnvironment/);
  assert.match(settings, /正式数据库/);
  assert.match(settings, /展示数据库/);
  assert.match(settings, /只有当前账号的当前浏览器/);
  assert.match(settings, /更新展示数据库/);
  assert.match(settings, /继续更新/);
  assert.match(settings, /aria-live/);
});

test("sales IndexedDB uses a separate database name for each environment", () => {
  const salesStore = readFileSync(resolve(root, "src/state/salesStore.js"), "utf8");
  assert.match(salesStore, /salesDatabaseName/);
  assert.match(salesStore, /productFlowSales:production/);
  assert.match(salesStore, /productFlowSales:display/);
  assert.doesNotMatch(salesStore, /indexedDB\.open\(DB_NAME,/);
});
