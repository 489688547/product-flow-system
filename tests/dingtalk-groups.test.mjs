import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGroupMembers,
  normalizeGroupSearch,
  resolveGroupMembers
} from "../functions/api/dingtalk/_shared/groups.js";
import * as groupProvider from "../functions/api/dingtalk/_shared/groups.js";
import { onRequest as searchGroupsRoute } from "../functions/api/dingtalk/groups/search.js";
import { onRequest as groupMembersRoute } from "../functions/api/dingtalk/groups/[groupId]/members.js";
import { saveDingUserToken } from "../functions/api/auth/_shared/ding-user-token.js";
import { createSession, upsertOrgMembers } from "../functions/api/auth/_shared/session.js";
import { createAuthD1Mock } from "./helpers/auth-d1-mock.mjs";

const TOKEN_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("group search normalizes DingTalk MCP results", () => {
  const result = normalizeGroupSearch({ result: { structuredContent: {
    result: { groups: [{ openConversationId: "g1", title: "产品群", memberCount: 8 }], hasMore: false },
    success: true
  } } });
  assert.deepEqual(result, { groups: [{ id: "g1", name: "产品群", memberCount: 8 }], nextCursor: "", hasMore: false });
});

test("group search unwraps text content from a JSON-RPC tool result", () => {
  const result = normalizeGroupSearch({ result: { content: [{
    type: "text",
    text: JSON.stringify({ success: true, result: {
      groups: [{ openConversationId: "g2", title: "运营群", memberCount: 16 }],
      hasMore: false
    } })
  }] } });
  assert.deepEqual(result, { groups: [{ id: "g2", name: "运营群", memberCount: 16 }], nextCursor: "", hasMore: false });
});

test("my groups use the current-user MCP tool and normalize ownership", async () => {
  assert.equal(typeof groupProvider.listOwnedDingGroups, "function");
  let calledTool = "";
  const result = await groupProvider.listOwnedDingGroups("user-token", async (_url, options) => {
    calledTool = JSON.parse(options.body).params.name;
    return Response.json({ result: { structuredContent: { result: { groups: [{
      openConversationId: "g-owned",
      title: "产品研发群",
      memberCount: 10,
      myRole: "OWNER"
    }] } } } });
  });
  assert.equal(calledTool, "list_owned_or_admin_groups");
  assert.deepEqual(result.groups, [{ id: "g-owned", name: "产品研发群", memberCount: 10, myRole: "OWNER" }]);
});

test("group members normalize identity fields without guessing union ids", () => {
  const result = normalizeGroupMembers({ result: { structuredContent: {
    result: { list: [{ memberNick: "张真", openDingtalkId: "open-1" }], hasMore: false },
    success: true
  } } });
  assert.deepEqual(result.members, [{ name: "张真", openDingTalkId: "open-1" }]);
});

test("group members resolve through exact openDingTalkId and cached organization user", async () => {
  const db = {
    prepare() {
      return {
        bind(corpId, userId) {
          return { first: async () => userId === "user-1" ? {
            user_id: "user-1", union_id: "union-1", name: "张真", department: "运营部", title: "运营主管"
          } : null };
        }
      };
    }
  };
  const result = await resolveGroupMembers([
    { name: "张真", openDingTalkId: "open-1" },
    { name: "外部成员", openDingTalkId: "open-2" }
  ], { corpId: "corp-1", db, searchContact: async name => name === "张真" ? [
    { name: "张真", openDingTalkId: "open-1", userId: "user-1" }
  ] : [] });

  assert.deepEqual(result.members, [{ unionId: "union-1", userId: "user-1", name: "张真", department: "运营部", title: "运营主管" }]);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.skippedReasons, ["1 人不在当前企业组织架构或身份无法确认"]);
  assert.deepEqual(result.skippedMembers, [{ name: "外部成员", reason: "不在当前企业组织架构或身份无法确认" }]);
});

test("session-protected routes search a group and return resolvable members", async () => {
  const db = createAuthD1Mock();
  await upsertOrgMembers(db, { users: [{ userId: "user-1", unionId: "union-1", name: "张真", department: "运营部", title: "运营主管" }] }, "corp-1");
  const created = await createSession({ corpId: "corp-1", userId: "owner", unionId: "owner-union", name: "负责人" }, "browser", { PRODUCT_FLOW_DB: db });
  const env = { PRODUCT_FLOW_DB: db, DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY };
  await saveDingUserToken(db, created.sessionIdHash, { accessToken: "user-token", expireIn: 7200 }, env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const tool = JSON.parse(options.body).params.name;
    if (tool === "search_groups") return Response.json({ result: { structuredContent: { result: { groups: [{ openConversationId: "g1", title: "产品群", memberCount: 1 }] } } } });
    if (tool === "get_group_members") return Response.json({ result: { structuredContent: { result: { list: [{ memberNick: "张真", openDingtalkId: "open-1" }], hasMore: false } } } });
    if (tool === "search_contact_by_key_word") return Response.json({ result: { structuredContent: { result: [{ name: "张真", openDingTalkId: "open-1", userId: "user-1" }] } } });
    throw new Error(`unexpected tool ${tool}`);
  };
  try {
    const headers = { cookie: created.cookie };
    const searchResponse = await searchGroupsRoute({ request: new Request("https://flow.example.com/api/dingtalk/groups/search?q=产品", { headers }), env });
    assert.equal((await searchResponse.json()).groups[0].id, "g1");
    const memberResponse = await groupMembersRoute({
      request: new Request("https://flow.example.com/api/dingtalk/groups/g1/members", { headers }),
      env,
      data: { session: { corpId: "corp-1" } },
      params: { groupId: "g1" }
    });
    const memberBody = await memberResponse.json();
    assert.equal(memberResponse.status, 200);
    assert.equal(memberBody.members[0].unionId, "union-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session-protected route lists the current user's groups", async () => {
  const { onRequest: myGroupsRoute } = await import("../functions/api/dingtalk/groups/index.js");
  const db = createAuthD1Mock();
  const created = await createSession({ corpId: "corp-1", userId: "owner", unionId: "owner-union", name: "负责人" }, "browser", { PRODUCT_FLOW_DB: db });
  const env = { PRODUCT_FLOW_DB: db, DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY };
  await saveDingUserToken(db, created.sessionIdHash, { accessToken: "user-token", expireIn: 7200 }, env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).params.name, "list_owned_or_admin_groups");
    return Response.json({ result: { structuredContent: { result: { groups: [{ openConversationId: "g1", title: "产品群", memberCount: 8, myRole: "OWNER" }] } } } });
  };
  try {
    const response = await myGroupsRoute({
      request: new Request("https://flow.example.com/api/dingtalk/groups", { headers: { cookie: created.cookie } }),
      env
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.groups[0].name, "产品群");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
