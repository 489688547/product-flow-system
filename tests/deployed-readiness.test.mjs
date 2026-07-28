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
    baseUrl: "https://deshan-tiyes-system.pages.dev",
    accessToken: "token",
    fetchImpl: async () => new Response(JSON.stringify({ environment: "production", ready: true, capabilities: [] }), { status: 200 })
  });
  assert.equal(payload.ready, true);
});

test("deployed readiness fails with the exact blocking configuration names", async () => {
  const { checkDeployedReadiness } = await loadScript();
  await assert.rejects(() => checkDeployedReadiness({
    baseUrl: "https://deshan-tiyes-system.pages.dev",
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
    baseUrl: "https://deshan-tiyes-system.pages.dev",
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
    baseUrl: "https://deshan-tiyes-system.pages.dev",
    accessToken: "token",
    requiredPlatforms: ["dingtalk"],
    oauthConcurrency: 2,
    fetchImpl: async url => {
      if (String(url).endsWith("/api/auth/dingtalk/start")) {
        return new Response("<!doctype html><title>正在连接钉钉</title>", {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" }
        });
      }
      if (String(url).includes("/api/auth/dingtalk/bootstrap")) {
        return Response.json({
          ready: true,
          authorizeUrl: "https://login.dingtalk.com/oauth2/auth?client_id=app-key"
        });
      }
      return Response.json({
        environment: "production",
        ready: true,
        capabilities: [{
          id: "kuaimai-sales-sync",
          status: "warning",
          platforms: ["kuaimai", "cloudflare-d1"],
          missing: ["KUAIMAI_APP_SECRET"]
        }]
      });
    }
  });
  assert.equal(payload.ready, true);
});

test("deployed readiness proves the static OAuth entry and concurrent bootstrap path", async () => {
  const { checkDeployedReadiness } = await loadScript();
  let bootstrapCalls = 0;
  const payload = await checkDeployedReadiness({
    baseUrl: "https://deshan-tiyes-system.pages.dev",
    accessToken: "token",
    requiredPlatforms: ["dingtalk"],
    oauthConcurrency: 3,
    fetchImpl: async url => {
      const value = String(url);
      if (value.endsWith("/api/platform/v1/environment-readiness")) {
        return Response.json({ environment: "production", ready: true, capabilities: [] });
      }
      if (value.endsWith("/api/auth/dingtalk/start")) {
        return new Response("<!doctype html><title>正在连接钉钉</title>", {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" }
        });
      }
      bootstrapCalls += 1;
      if (bootstrapCalls === 1) {
        return new Response("Worker exceeded resource limits Error code: 1102", { status: 500 });
      }
      return Response.json({
        ready: true,
        authorizeUrl: "https://login.dingtalk.com/oauth2/auth?client_id=app-key"
      });
    }
  });

  assert.equal(payload.ready, true);
  assert.equal(bootstrapCalls, 5);
});
