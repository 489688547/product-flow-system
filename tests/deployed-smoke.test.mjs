import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("scripts/check-deployed-smoke.mjs");
const expectedCommit = "abcdef1234567890";
const productionUrl = "https://deshan-tiyes.cn";
const testUrl = "https://test.deshan-tiyes.cn";
const testApiUrl = "https://api-test.deshan-tiyes.cn";

function responseMap({ baseUrl, apiUrl = baseUrl, environment, corsOrigin = "", entryHeaders = {} } = {}) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === new URL(baseUrl).origin && url.pathname === "/") {
      return new Response(`<!doctype html><meta name="pfs-release-commit" content="${expectedCommit}">`, {
        status: 200,
        headers: { "content-type": "text/html", ...entryHeaders }
      });
    }
    if (url.origin !== new URL(apiUrl).origin) throw new Error(`Unexpected origin: ${url.origin}`);
    if (url.pathname === "/api/auth/session" && init.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": corsOrigin,
          "access-control-allow-credentials": "true"
        }
      });
    }
    if (url.pathname === "/api/auth/session") {
      return Response.json({ authenticated: false, user: null }, { status: 401 });
    }
    if (url.pathname === "/api/platform/v1/environment-readiness") {
      return Response.json({ environment, ready: true, capabilities: [] });
    }
    if (url.pathname === "/api/auth/dingtalk/bootstrap") {
      return Response.json({
        ready: true,
        authorizeUrl: `https://login.dingtalk.com/oauth2/auth?redirect_uri=${encodeURIComponent(`${apiUrl}/api/auth/dingtalk/callback`)}`
      });
    }
    throw new Error(`Unexpected URL: ${url.href}`);
  };
}

test("production smoke proves root commit, Aliyun readiness and DingTalk callback", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  const result = await checkDeployedSmoke({
    baseUrl: productionUrl,
    expectedCommit,
    accessToken: "safe-test-token",
    requiredPlatforms: ["aliyun", "dingtalk"],
    expectedEnvironment: "production",
    forbidServerEnvDev: true,
    oauthConcurrency: 2,
    fetchImpl: responseMap({ baseUrl: productionUrl, environment: "production" })
  });
  assert.equal(result.baseUrl, productionUrl);
  assert.equal(result.apiBaseUrl, productionUrl);
  assert.equal(result.readiness.oauth.callbackOrigin, productionUrl);
});

test("split test smoke proves static commit, preview API and credentialed CORS", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  const result = await checkDeployedSmoke({
    baseUrl: testUrl,
    apiBaseUrl: testApiUrl,
    expectedCommit,
    accessToken: "safe-test-token",
    requiredPlatforms: ["aliyun", "dingtalk"],
    expectedEnvironment: "preview",
    allowedBrowserOrigin: testUrl,
    oauthConcurrency: 2,
    fetchImpl: responseMap({
      baseUrl: testUrl,
      apiUrl: testApiUrl,
      environment: "preview",
      corsOrigin: testUrl
    })
  });
  assert.equal(result.apiBaseUrl, testApiUrl);
  assert.equal(result.cors.origin, testUrl);
  assert.equal(result.readiness.oauth.callbackOrigin, testApiUrl);
});

test("production smoke rejects dev server headers and commit drift", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  await assert.rejects(checkDeployedSmoke({
    baseUrl: productionUrl,
    expectedCommit,
    accessToken: "safe-test-token",
    forbidServerEnvDev: true,
    fetchImpl: responseMap({
      baseUrl: productionUrl,
      environment: "production",
      entryHeaders: { "x-server-env": "dev" }
    })
  }), /x-server-env/);
  await assert.rejects(checkDeployedSmoke({
    baseUrl: productionUrl,
    expectedCommit: "different-commit",
    accessToken: "safe-test-token",
    fetchImpl: responseMap({ baseUrl: productionUrl, environment: "production" })
  }), /commit/);
});

test("split test smoke rejects wildcard CORS", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  await assert.rejects(checkDeployedSmoke({
    baseUrl: testUrl,
    apiBaseUrl: testApiUrl,
    expectedCommit,
    accessToken: "safe-test-token",
    allowedBrowserOrigin: testUrl,
    fetchImpl: responseMap({
      baseUrl: testUrl,
      apiUrl: testApiUrl,
      environment: "preview",
      corsOrigin: "*"
    })
  }), /CORS/);
});
