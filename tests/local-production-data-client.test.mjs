import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const clientPath = resolve("server/productionDataClient.mjs");

async function loadClient() {
  assert.equal(existsSync(clientPath), true, "local production data client must exist");
  return import(clientPath);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("local production client degrades cleanly when no personal token is configured", async () => {
  const { createProductionDataClient } = await loadClient();
  const client = createProductionDataClient({ apiUrl: "", accessToken: "" });
  assert.equal(client.configured, false);
  assert.deepEqual(client.status(), { configured: false, unlocked: false, expiresAt: "", reason: "" });
});

test("local production client reads the real state with a server-only bearer token", async () => {
  const { createProductionDataClient } = await loadClient();
  const calls = [];
  const client = createProductionDataClient({
    apiUrl: "https://product-flow-system.pages.dev",
    accessToken: "personal-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return jsonResponse({ synced: true, state: { marker: "production" }, updatedAt: "2026-07-18T08:00:00.000Z" });
    }
  });
  const payload = await client.readState();
  assert.equal(payload.state.marker, "production");
  assert.equal(calls[0].url, "https://product-flow-system.pages.dev/api/platform/v1/production-data/state");
  assert.equal(calls[0].options.headers.authorization, "Bearer personal-secret");
});

test("unlock tokens stay inside the local server and authorize versioned writes", async () => {
  const { createProductionDataClient } = await loadClient();
  const calls = [];
  const client = createProductionDataClient({
    apiUrl: "https://product-flow-system.pages.dev/",
    accessToken: "personal-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("production-write-session") && options.method === "POST") {
        return jsonResponse({ allowed: true, unlocked: true, unlockToken: "server-only-unlock", expiresAt: "2099-01-01T00:00:00.000Z", reason: "修正线上产品状态" });
      }
      if (url.endsWith("production-data/state") && options.method === "POST") {
        return jsonResponse({ synced: true, version: "v2", updatedAt: "2026-07-18T09:00:00.000Z", auditId: "audit-1" });
      }
      return jsonResponse({ synced: true, state: { marker: "before" }, updatedAt: "2026-07-18T08:00:00.000Z" });
    }
  });
  await client.readState();
  const unlocked = await client.unlock({ reason: "修正线上产品状态", confirmation: "修改线上真实数据" });
  assert.equal(unlocked.unlockToken, undefined);
  assert.equal(client.status().unlocked, true);
  const saved = await client.writeState({ state: { version: "v2", demands: [], products: [], tasks: [], deliverables: [], reviews: [], feedbackIssues: [], productPlans: [] } });
  assert.equal(saved.auditId, "audit-1");
  const writeCall = calls.find(call => call.url.endsWith("production-data/state") && call.options.method === "POST");
  assert.equal(writeCall.options.headers["x-pfs-production-unlock"], "server-only-unlock");
  assert.equal(JSON.parse(writeCall.options.body).baseUpdatedAt, "2026-07-18T08:00:00.000Z");
});

test("locked local clients never attempt production writes", async () => {
  const { createProductionDataClient } = await loadClient();
  let calls = 0;
  const client = createProductionDataClient({ apiUrl: "https://product-flow-system.pages.dev", accessToken: "personal-secret", fetchImpl: async () => { calls += 1; } });
  await assert.rejects(() => client.writeState({ state: {} }), error => error.code === "PRODUCTION_WRITE_LOCKED");
  assert.equal(calls, 0);
});

test("local server wires the production proxy and blocks real external writes by default", () => {
  const server = readFileSync(resolve("server.mjs"), "utf8");
  const stateApi = readFileSync(resolve("src/state/stateApi.js"), "utf8");
  assert.match(server, /createProductionDataClient/);
  assert.match(server, /EXTERNAL_ACTION_DISABLED_IN_TEST/);
  assert.match(server, /\/api\/platform\/v1\/production-write-session/);
  assert.doesNotMatch(stateApi, /https:\/\/product-flow-system\.pages\.dev\/api\/state/);
  assert.match(stateApi, /return "\/api\/state"/);
});
