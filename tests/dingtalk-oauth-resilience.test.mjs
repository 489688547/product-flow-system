import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("OAuth public entrypoints are static Pages routes outside the monolithic Function", async () => {
  const routes = JSON.parse(await readFile(resolve(root, "public/_routes.json"), "utf8"));

  assert.deepEqual(routes, {
    version: 1,
    include: ["/*"],
    exclude: [
      "/api/auth/dingtalk/start",
      "/api/auth/dingtalk/start/*",
      "/api/auth/dingtalk/callback",
      "/api/auth/dingtalk/callback/*",
      "/auth/dingtalk-start*",
      "/auth/dingtalk-callback*",
      "/auth/dingtalk-oauth.js"
    ]
  });

  const start = await readFile(resolve(root, "public/auth/dingtalk-start.html"), "utf8");
  const callback = await readFile(resolve(root, "public/auth/dingtalk-callback.html"), "utf8");
  assert.match(start, /runDingTalkOAuthStart/);
  assert.match(callback, /runDingTalkOAuthCallback/);

  const redirects = await readFile(resolve(root, "_redirects"), "utf8");
  assert.match(redirects, /^\/api\/auth\/dingtalk\/start \/auth\/dingtalk-start\.html 200$/m);
  assert.match(redirects, /^\/api\/auth\/dingtalk\/callback \/auth\/dingtalk-callback\.html 200$/m);
});

test("OAuth bootstrap retries transient Worker resource failures before succeeding", async () => {
  const { fetchJsonWithRetry } = await import("../public/auth/dingtalk-oauth.js");
  let calls = 0;
  const payload = await fetchJsonWithRetry("/api/auth/dingtalk/bootstrap", {}, {
    delays: [0, 0, 0],
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) {
        return new Response("Worker exceeded resource limits", { status: 500 });
      }
      return Response.json({ ready: true, authorizeUrl: "https://login.dingtalk.com/oauth2/auth" });
    },
    waitImpl: async () => {}
  });

  assert.equal(calls, 3);
  assert.equal(payload.authorizeUrl, "https://login.dingtalk.com/oauth2/auth");
});

test("OAuth bootstrap does not retry permanent validation failures", async () => {
  const { fetchJsonWithRetry } = await import("../public/auth/dingtalk-oauth.js");
  let calls = 0;
  await assert.rejects(
    fetchJsonWithRetry("/api/auth/dingtalk/bootstrap", {}, {
      delays: [0, 0, 0],
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ message: "登录校验已失效" }, { status: 400 });
      },
      waitImpl: async () => {}
    }),
    /登录校验已失效/
  );
  assert.equal(calls, 1);
});

test("Pages build preparation keeps the OAuth static routing contract", async () => {
  const source = await readFile(resolve(root, "scripts/prepare-pages-build.mjs"), "utf8");
  assert.match(source, /_routes\.json/);
});
