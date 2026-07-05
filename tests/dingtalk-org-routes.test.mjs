import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as syncOrgRequest } from "../functions/api/dingtalk/org/sync.js";

test("org sync route reports missing DingTalk credentials", async () => {
  const response = await syncOrgRequest({
    request: new Request("https://flow.example.com/api/dingtalk/org/sync", { method: "POST" }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});
