import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

const scriptPath = resolve("scripts/check-deployed-smoke.mjs");
const baseUrl = "https://deshan-tiyes-system.pages.dev";
const expectedCommit = "abcdef1234567890";

function responseMap(overrides = {}) {
  const responses = {
    "/cloudflare-entry.html": new Response(
      `<!doctype html><meta name="pfs-release-commit" content="${expectedCommit}"><main>ready</main>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    ),
    "/api/auth/dingtalk/start": new Response(
      "<!doctype html><main data-oauth-status>正在安全连接钉钉</main>",
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    ),
    "/api/auth/dingtalk/bootstrap": Response.json({
      ready: true,
      authorizeUrl: `https://login.dingtalk.com/oauth2/auth?redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/dingtalk/callback`)}`
    }),
    "/api/auth/session": Response.json({ authenticated: false }),
    "/api/platform/v1/environment-readiness": Response.json({
      ready: true,
      checkedAt: "2026-07-28T00:00:00.000Z",
      capabilities: []
    }),
    ...overrides
  };
  return async input => {
    const url = new URL(String(input));
    const response = responses[url.pathname];
    if (!response) throw new Error(`Unexpected URL: ${url.pathname}`);
    return response.clone();
  };
}

test("fixed-site smoke proves commit, static OAuth, callback origin, session safety and readiness", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  const result = await checkDeployedSmoke({
    baseUrl,
    expectedCommit,
    accessToken: "safe-test-token",
    fetchImpl: responseMap()
  });
  assert.equal(result.baseUrl, baseUrl);
  assert.equal(result.commit, expectedCommit);
  assert.equal(result.oauth.entryStatus, 200);
  assert.equal(result.sessionAuthenticated, false);
  assert.equal(result.readiness.ready, true);
});

test("fixed-site smoke rejects a deployed commit mismatch", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  await assert.rejects(checkDeployedSmoke({
    baseUrl,
    expectedCommit: "different-commit",
    accessToken: "safe-test-token",
    fetchImpl: responseMap()
  }), /commit/i);
});

test("fixed-site smoke rejects an OAuth callback on another origin", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  await assert.rejects(checkDeployedSmoke({
    baseUrl,
    expectedCommit,
    accessToken: "safe-test-token",
    fetchImpl: responseMap({
      "/api/auth/dingtalk/bootstrap": Response.json({
        ready: true,
        authorizeUrl: `https://login.dingtalk.com/oauth2/auth?redirect_uri=${encodeURIComponent("https://old.example.com/api/auth/dingtalk/callback")}`
      })
    })
  }), /callback|Origin/i);
});

test("fixed-site smoke rejects a blocked readiness response", async () => {
  const { checkDeployedSmoke } = await import(scriptPath);
  await assert.rejects(checkDeployedSmoke({
    baseUrl,
    expectedCommit,
    accessToken: "safe-test-token",
    fetchImpl: responseMap({
      "/api/platform/v1/environment-readiness": Response.json({
        ready: false,
        capabilities: [{ id: "cloudflare-d1", status: "blocked", missing: ["PRODUCT_FLOW_DB"] }]
      })
    })
  }), /PRODUCT_FLOW_DB|未就绪/);
});
