import test from "node:test";
import assert from "node:assert/strict";
import { loadDingTalkGroupMembers, searchDingTalkGroups } from "../src/domain/dingTalkGroups.js";

test("group search encodes the query and keeps the session cookie", async () => {
  let requested;
  const result = await searchDingTalkGroups("产品", "", async (url, options) => {
    requested = { url: String(url), options };
    return Response.json({ groups: [{ id: "g1", name: "产品群" }], nextCursor: "" });
  });
  assert.match(requested.url, /q=%E4%BA%A7%E5%93%81/);
  assert.equal(requested.options.credentials, "same-origin");
  assert.equal(result.groups[0].id, "g1");
});

test("group auth errors expose a reauthorization URL", async () => {
  await assert.rejects(
    () => searchDingTalkGroups("产品", "", async () => Response.json({ code: "GROUP_AUTH_REQUIRED", message: "需要授权" }, { status: 428 })),
    error => error.code === "GROUP_AUTH_REQUIRED" && error.authorizeUrl.includes("/api/auth/dingtalk/start")
  );
});

test("member loading encodes the group id", async () => {
  let requested = "";
  await loadDingTalkGroupMembers("group/1", async url => {
    requested = String(url);
    return Response.json({ members: [] });
  });
  assert.match(requested, /group%2F1\/members$/);
});
