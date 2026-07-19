import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("scripts/check-deployed-readiness.mjs");

async function loadScript() {
  assert.equal(existsSync(scriptPath), true, "deployed readiness checker must exist");
  return import(scriptPath);
}

test("deployed readiness accepts a ready production response", async () => {
  const { checkDeployedReadiness } = await loadScript();
  const payload = await checkDeployedReadiness({
    baseUrl: "https://product-flow-system.pages.dev",
    accessToken: "token",
    fetchImpl: async () => new Response(JSON.stringify({ environment: "production", ready: true, capabilities: [] }), { status: 200 })
  });
  assert.equal(payload.ready, true);
});

test("deployed readiness fails with the exact blocking configuration names", async () => {
  const { checkDeployedReadiness } = await loadScript();
  await assert.rejects(() => checkDeployedReadiness({
    baseUrl: "https://product-flow-system.pages.dev",
    accessToken: "token",
    fetchImpl: async () => new Response(JSON.stringify({
      environment: "production",
      ready: false,
      capabilities: [{ id: "dingtalk-core", status: "blocked", missing: ["DINGTALK_APP_SECRET"] }]
    }), { status: 200 })
  }), /DINGTALK_APP_SECRET/);
});

test("deployed readiness blocks warnings for every explicitly affected platform", async () => {
  const { checkDeployedReadiness } = await loadScript();
  await assert.rejects(() => checkDeployedReadiness({
    baseUrl: "https://product-flow-system.pages.dev",
    accessToken: "token",
    requiredPlatforms: ["kuaimai"],
    fetchImpl: async () => new Response(JSON.stringify({
      environment: "production",
      ready: true,
      capabilities: [{
        id: "kuaimai-sales-sync",
        status: "warning",
        platforms: ["kuaimai", "cloudflare-d1"],
        missing: ["KUAIMAI_APP_SECRET"]
      }]
    }), { status: 200 })
  }), /kuaimai-sales-sync.*KUAIMAI_APP_SECRET/);
});

test("deployed readiness does not promote unrelated warnings to blocking", async () => {
  const { checkDeployedReadiness } = await loadScript();
  const payload = await checkDeployedReadiness({
    baseUrl: "https://product-flow-system.pages.dev",
    accessToken: "token",
    requiredPlatforms: ["dingtalk"],
    fetchImpl: async () => new Response(JSON.stringify({
      environment: "production",
      ready: true,
      capabilities: [{
        id: "kuaimai-sales-sync",
        status: "warning",
        platforms: ["kuaimai", "cloudflare-d1"],
        missing: ["KUAIMAI_APP_SECRET"]
      }]
    }), { status: 200 })
  });
  assert.equal(payload.ready, true);
});
