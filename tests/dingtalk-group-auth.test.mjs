import test from "node:test";
import assert from "node:assert/strict";
import { createAuthD1Mock } from "./helpers/auth-d1-mock.mjs";
import { createSession } from "../functions/api/auth/_shared/session.js";
import {
  deleteDingUserToken,
  getValidDingUserToken,
  saveDingUserToken
} from "../functions/api/auth/_shared/ding-user-token.js";

const identity = { corpId: "corp-1", userId: "user-1", unionId: "union-1", name: "测试用户" };
const TOKEN_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function requestWithCookie(cookie) {
  return new Request("https://flow.example.com/api/dingtalk/groups/search", { headers: { cookie } });
}

test("DingTalk user tokens are encrypted and bound to the server session", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "raw-access",
    refreshToken: "raw-refresh",
    expireIn: 7200
  }, { DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY });

  const row = db.dumpDingTokens()[0];
  assert.equal(JSON.stringify(row).includes("raw-access"), false);
  assert.equal(JSON.stringify(row).includes("raw-refresh"), false);
  assert.equal(await getValidDingUserToken(requestWithCookie(created.cookie), {
    PRODUCT_FLOW_DB: db,
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  }), "raw-access");
});

test("expired DingTalk user tokens refresh and persist the replacement", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "expired-access",
    refreshToken: "refresh-1",
    expireIn: 1
  }, env);
  db.setDingTokenExpires(created.sessionIdHash, "2000-01-01T00:00:00.000Z");

  const accessToken = await getValidDingUserToken(requestWithCookie(created.cookie), env, async (url, options) => {
    assert.match(String(url), /\/v1\.0\/oauth2\/userAccessToken/);
    assert.equal(JSON.parse(options.body).refreshToken, "refresh-1");
    return Response.json({ accessToken: "fresh-access", refreshToken: "refresh-2", expireIn: 7200 });
  });

  assert.equal(accessToken, "fresh-access");
  assert.equal(await getValidDingUserToken(requestWithCookie(created.cookie), env), "fresh-access");
});

test("DingTalk user token can be removed with the session", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const env = { PRODUCT_FLOW_DB: db, DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY };
  await saveDingUserToken(db, created.sessionIdHash, { accessToken: "access", expireIn: 7200 }, env);

  assert.equal(await deleteDingUserToken(requestWithCookie(created.cookie), env), true);
  assert.deepEqual(db.dumpDingTokens(), []);
});
