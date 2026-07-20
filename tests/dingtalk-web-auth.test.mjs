import test from "node:test";
import assert from "node:assert/strict";
import { createAuthD1Mock } from "./helpers/auth-d1-mock.mjs";
import {
  createSession,
  readSession,
  revokeSession,
  upsertOrgMembers
} from "../functions/api/auth/_shared/session.js";
import { onRequest as apiMiddleware } from "../functions/api/_middleware.js";
import { onRequest as stateRequest } from "../functions/api/state.js";
import { onRequest as dataStandardsRequest } from "../functions/api/platform/v1/data-standards.js";
import { onRequest as dataStandardItemRequest } from "../functions/api/platform/v1/data-standards/[id].js";
import { onRequest as startBrowserLogin } from "../functions/api/auth/dingtalk/start.js";
import { onRequest as finishBrowserLogin } from "../functions/api/auth/dingtalk/callback.js";
import { onRequest as embeddedLogin } from "../functions/api/auth/dingtalk/embedded.js";
import { onRequest as legacyEmbeddedLogin } from "../functions/api/dingtalk/login.js";
import { onRequest as getCurrentSession } from "../functions/api/auth/session.js";
import { onRequest as logout } from "../functions/api/auth/logout.js";
import { hashSecret } from "../functions/api/platform/_shared/productionDataAccess.js";

const identity = {
  corpId: "ding-company",
  userId: "user-1",
  unionId: "union-1",
  name: "周荣庆",
  role: "executive",
  department: "总经办",
  title: "总经理"
};

function requestWithCookie(cookie) {
  return new Request("https://flow.example.com/api/state", {
    headers: { cookie }
  });
}

test("server session stores only a token hash and resolves an active employee", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });

  assert.match(created.cookie, /^pfs_session=/);
  assert.equal(db.dumpSessions().length, 1);
  assert.equal(db.dumpSessions()[0].id_hash.includes(created.token), false);

  const session = await readSession(requestWithCookie(created.cookie), { PRODUCT_FLOW_DB: db });
  assert.equal(session.unionId, "union-1");
  assert.equal(session.loginMode, "browser");
  assert.match(created.session.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(session.createdAt, created.session.createdAt);
  assert.equal("sessionIdHash" in session, false);
});

test("expired server sessions cannot be read", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "embedded", { PRODUCT_FLOW_DB: db });
  const row = db.dumpSessions()[0];
  db.setSessionExpires(row.id_hash, "2000-01-01T00:00:00.000Z");

  const session = await readSession(requestWithCookie(created.cookie), { PRODUCT_FLOW_DB: db });
  assert.equal(session, null);
});

test("logout revokes a server session without exposing the raw token", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const request = requestWithCookie(created.cookie);

  assert.equal(await revokeSession(request, { PRODUCT_FLOW_DB: db }), true);
  assert.equal(await readSession(request, { PRODUCT_FLOW_DB: db }), null);
  assert.equal(db.dumpSessions()[0].revoked_at !== null, true);
});

test("browser login start redirects to DingTalk with a protected callback state", async () => {
  const response = await startBrowserLogin({
    request: new Request("https://flow.example.com/api/auth/dingtalk/start"),
    env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://login.dingtalk.com");
  assert.equal(location.searchParams.get("client_id"), "app-key");
  assert.equal(location.searchParams.get("redirect_uri"), "https://flow.example.com/api/auth/dingtalk/callback");
  assert.ok(location.searchParams.get("state"));
  assert.match(response.headers.get("set-cookie"), /pfs_oauth_state=/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});

test("Cloudflare preview login starts OAuth on the registered production origin", async () => {
  const response = await startBrowserLogin({
    request: new Request("https://codex-brand-content-collabor.product-flow-system.pages.dev/api/auth/dingtalk/start"),
    env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://product-flow-system.pages.dev/api/auth/dingtalk/start"
  );
  assert.equal(response.headers.get("set-cookie"), null);
});

test("group authorization remembers only a safe same-origin return path", async () => {
  const response = await startBrowserLogin({
    request: new Request("https://flow.example.com/api/auth/dingtalk/start?returnTo=%2F%3FproductId%3Dp1%23progress"),
    env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });
  assert.match(response.headers.get("set-cookie"), /pfs_oauth_return=/);

  const unsafe = await startBrowserLogin({
    request: new Request("https://flow.example.com/api/auth/dingtalk/start?returnTo=https%3A%2F%2Fevil.example"),
    env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });
  assert.doesNotMatch(unsafe.headers.get("set-cookie"), /pfs_oauth_return=/);
});

test("browser OAuth callback rejects a mismatched state", async () => {
  const response = await finishBrowserLogin({
    request: new Request("https://flow.example.com/api/auth/dingtalk/callback?code=auth-code&state=wrong", {
      headers: { cookie: "pfs_oauth_state=expected" }
    }),
    env: {
      PRODUCT_FLOW_DB: createAuthD1Mock(),
      DINGTALK_APP_KEY: "app-key",
      DINGTALK_APP_SECRET: "app-secret",
      DINGTALK_CORP_ID: "ding-company"
    }
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.message, /登录校验已失效/);
});

test("browser OAuth callback creates a server session for an enterprise employee", async () => {
  const db = createAuthD1Mock();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.includes("/v1.0/oauth2/userAccessToken")) {
      return Response.json({ accessToken: "user-token", unionId: "union-1" });
    }
    if (value.includes("/v1.0/contact/users/me")) {
      return Response.json({ unionId: "union-1", nick: "周荣庆", avatarUrl: "" });
    }
    if (value.includes("/gettoken")) {
      return Response.json({ errcode: 0, access_token: "app-token" });
    }
    if (value.includes("/topapi/user/getbyunionid")) {
      return Response.json({ errcode: 0, result: { userid: "user-1" } });
    }
    if (value.includes("/topapi/v2/user/get")) {
      return Response.json({
        errcode: 0,
        result: {
          userid: "user-1",
          unionid: "union-1",
          name: "周荣庆",
          title: "总经理",
          dept_id_list: [1],
          role_list: [{ group_name: "系统角色", name: "主管理员" }],
          active: true
        }
      });
    }
    if (value.includes("/topapi/v2/department/get")) {
      return Response.json({ errcode: 0, result: { dept_id: 1, parent_id: 0, name: "总经办" } });
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  try {
    const response = await finishBrowserLogin({
      request: new Request("https://flow.example.com/api/auth/dingtalk/callback?code=auth-code&state=expected", {
        headers: { cookie: "pfs_oauth_state=expected" }
      }),
      env: {
        PRODUCT_FLOW_DB: db,
        DINGTALK_APP_KEY: "app-key",
        DINGTALK_APP_SECRET: "app-secret",
        DINGTALK_CORP_ID: "ding-company"
      }
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://flow.example.com/?login=success");
    assert.match(response.headers.get("set-cookie"), /pfs_session=/);
    const sessionResponse = await getCurrentSession({
      request: requestWithCookie(response.headers.get("set-cookie")),
      env: { PRODUCT_FLOW_DB: db }
    });
    const body = await sessionResponse.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.user.name, "周荣庆");
    assert.equal(body.user.department, "总经办");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser OAuth rejects a DingTalk account outside the enterprise", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.includes("/v1.0/oauth2/userAccessToken")) return Response.json({ accessToken: "user-token" });
    if (value.includes("/v1.0/contact/users/me")) return Response.json({ unionId: "external-union", nick: "外部用户" });
    if (value.includes("/gettoken")) return Response.json({ errcode: 0, access_token: "app-token" });
    if (value.includes("/topapi/user/getbyunionid")) return Response.json({ errcode: 0, result: {} });
    throw new Error(`unexpected fetch ${value}`);
  };

  try {
    const response = await finishBrowserLogin({
      request: new Request("https://flow.example.com/api/auth/dingtalk/callback?code=auth-code&state=expected", {
        headers: { cookie: "pfs_oauth_state=expected" }
      }),
      env: {
        PRODUCT_FLOW_DB: createAuthD1Mock(),
        DINGTALK_APP_KEY: "app-key",
        DINGTALK_APP_SECRET: "app-secret",
        DINGTALK_CORP_ID: "ding-company"
      }
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.match(body.message, /当前企业/);
    assert.equal(response.headers.get("set-cookie")?.includes("pfs_session=") || false, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedded DingTalk login creates the same public session model", async () => {
  const db = createAuthD1Mock();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.includes("/gettoken")) return Response.json({ errcode: 0, access_token: "app-token" });
    if (value.includes("/topapi/v2/user/getuserinfo")) {
      return Response.json({ errcode: 0, result: { userid: "user-1", unionid: "union-1" } });
    }
    if (value.includes("/topapi/v2/user/get")) {
      return Response.json({
        errcode: 0,
        result: {
          userid: "user-1",
          unionid: "union-1",
          name: "周荣庆",
          title: "总经理",
          dept_id_list: [1],
          role_list: [{ group_name: "系统角色", name: "主管理员" }],
          active: true
        }
      });
    }
    if (value.includes("/topapi/v2/department/get")) {
      return Response.json({ errcode: 0, result: { dept_id: 1, parent_id: 0, name: "总经办" } });
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  try {
    const response = await embeddedLogin({
      request: new Request("https://flow.example.com/api/auth/dingtalk/embedded", {
        method: "POST",
        body: JSON.stringify({ authCode: "embedded-code", corpId: "ding-company" })
      }),
      env: {
        PRODUCT_FLOW_DB: db,
        DINGTALK_APP_KEY: "app-key",
        DINGTALK_APP_SECRET: "app-secret",
        DINGTALK_CORP_ID: "ding-company"
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.authenticated, true);
    assert.equal(body.user.loginMode, "embedded");
    assert.equal(body.user.department, "总经办");
    assert.match(response.headers.get("set-cookie"), /pfs_session=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy embedded login delegates to the unified server session", async () => {
  const db = createAuthD1Mock();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.includes("/gettoken")) return Response.json({ errcode: 0, access_token: "app-token" });
    if (value.includes("/topapi/v2/user/getuserinfo")) {
      return Response.json({ errcode: 0, result: { userid: "user-1", unionid: "union-1" } });
    }
    if (value.includes("/topapi/v2/user/get")) {
      return Response.json({
        errcode: 0,
        result: {
          userid: "user-1",
          unionid: "union-1",
          name: "周荣庆",
          title: "总经理",
          dept_id_list: [1],
          role_list: [{ group_name: "系统角色", name: "主管理员" }],
          active: true
        }
      });
    }
    if (value.includes("/topapi/v2/department/get")) {
      return Response.json({ errcode: 0, result: { dept_id: 1, parent_id: 0, name: "总经办" } });
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  try {
    const response = await legacyEmbeddedLogin({
      request: new Request("https://flow.example.com/api/dingtalk/login", {
        method: "POST",
        body: JSON.stringify({ authCode: "embedded-code", corpId: "ding-company" })
      }),
      env: {
        PRODUCT_FLOW_DB: db,
        DINGTALK_APP_KEY: "app-key",
        DINGTALK_APP_SECRET: "app-secret",
        DINGTALK_CORP_ID: "ding-company"
      }
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") || "", /pfs_session=/);
    assert.equal(db.dumpSessions().length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("logout clears and revokes the current session", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const request = new Request("https://flow.example.com/api/auth/logout", {
    method: "POST",
    headers: { cookie: created.cookie }
  });

  const response = await logout({ request, env: { PRODUCT_FLOW_DB: db } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(await readSession(request, { PRODUCT_FLOW_DB: db }), null);
});

test("API middleware blocks anonymous company data", async () => {
  let continued = false;
  const response = await apiMiddleware({
    request: new Request("https://flow.example.com/api/state"),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() },
    data: {},
    next: async () => {
      continued = true;
      return Response.json({ ok: true });
    }
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(continued, false);
  assert.equal(body.authenticated, false);
});

test("data standards owns its anonymous contract without changing unrelated middleware protection", async () => {
  const cases = [
    {
      request: new Request("https://flow.example.com/api/platform/v1/data-standards"),
      route: dataStandardsRequest
    },
    {
      request: new Request("https://flow.example.com/api/platform/v1/data-standards/standard-1"),
      route: context => dataStandardItemRequest({ ...context, params: { id: "standard-1" } })
    }
  ];

  for (const entry of cases) {
    const data = {};
    let continued = false;
    const response = await apiMiddleware({
      request: entry.request,
      env: {},
      data,
      next: async () => {
        continued = true;
        return entry.route({ request: entry.request, env: {}, data });
      }
    });
    const payload = await response.json();

    assert.equal(continued, true);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(payload.error.code, "AUTH_SESSION_REQUIRED");
    assert.equal(typeof payload.error.requestId, "string");
    assert.equal(payload.error.retryable, false);
  }

  let unrelatedContinued = false;
  const unrelated = await apiMiddleware({
    request: new Request("https://flow.example.com/api/state"),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() },
    data: {},
    next: async () => {
      unrelatedContinued = true;
      return Response.json({ ok: true });
    }
  });

  assert.equal(unrelated.status, 401);
  assert.equal(unrelatedContinued, false);
  assert.deepEqual(await unrelated.json(), {
    authenticated: false,
    message: "请先使用钉钉登录。"
  });
});

test("API middleware attaches an authenticated session before continuing", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const context = {
    request: requestWithCookie(created.cookie),
    env: { PRODUCT_FLOW_DB: db },
    data: {},
    next: async () => Response.json({ ok: true })
  };

  const response = await apiMiddleware(context);
  assert.equal(response.status, 200);
  assert.equal(context.data.session.name, "周荣庆");
});

test("API middleware keeps login bootstrap routes public", async () => {
  const response = await apiMiddleware({
    request: new Request("https://flow.example.com/api/auth/session"),
    env: {},
    data: {},
    next: async () => new Response("public", { status: 200 })
  });
  assert.equal(await response.text(), "public");
});

test("API middleware attaches an employee session on alternate token-auth routes", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const context = {
    request: new Request("https://flow.example.com/api/platform/v1/environment-readiness", {
      headers: { cookie: created.cookie }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: {},
    next: async () => Response.json({ ok: true })
  };

  const response = await apiMiddleware(context);
  assert.equal(response.status, 200);
  assert.equal(context.data.session.name, "周荣庆");
});

test("API middleware allows bearer-token routes to authorize inside their handler", async () => {
  let continued = false;
  const response = await apiMiddleware({
    request: new Request("https://flow.example.com/api/platform/v1/environment-readiness", {
      headers: { authorization: "Bearer personal-token" }
    }),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() },
    data: {},
    next: async () => {
      continued = true;
      return Response.json({ ok: true });
    }
  });
  assert.equal(response.status, 200);
  assert.equal(continued, true);
});

async function localOnlineEnv({ capabilities = ["read", "write"] } = {}) {
  const db = createAuthD1Mock();
  await upsertOrgMembers(db, {
    corpId: identity.corpId,
    users: [{ ...identity, departmentNames: [identity.department] }]
  });
  db.seedProductionAccess({
    token_hash: await hashSecret("personal-token"),
    user_id: identity.userId,
    union_id: identity.unionId,
    name: "令牌签发时姓名",
    capabilities: JSON.stringify(capabilities),
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null
  });
  return {
    LOCAL_ONLINE_ACCOUNT_MODE: "1",
    PRODUCTION_DATA_ACCESS_TOKEN: "personal-token",
    PRODUCT_FLOW_DB: db
  };
}

test("localhost online mode attaches the real production identity for reads", async () => {
  const context = {
    request: new Request("http://127.0.0.1:8141/api/state"),
    env: await localOnlineEnv(),
    data: {},
    next: async () => Response.json({ ok: true })
  };

  const response = await apiMiddleware(context);
  assert.equal(response.status, 200);
  assert.equal(context.data.session.corpId, "ding-company");
  assert.equal(context.data.session.userId, "user-1");
  assert.equal(context.data.session.unionId, "union-1");
  assert.equal(context.data.session.name, "周荣庆");
  assert.equal(context.data.session.department, "总经办");
  assert.equal(context.data.session.title, "总经理");
  assert.equal(context.data.session.loginMode, "local-online-account");
});

test("localhost online mode allows writes for the authorized account", async () => {
  let continued = false;
  const response = await apiMiddleware({
    request: new Request("http://localhost:8141/api/state", { method: "POST" }),
    env: await localOnlineEnv(),
    data: {},
    next: async () => {
      continued = true;
      return Response.json({ ok: true });
    }
  });
  assert.equal(response.status, 200);
  assert.equal(continued, true);
});

test("localhost online mode rejects mutations when the token is read-only", async () => {
  let continued = false;
  const response = await apiMiddleware({
    request: new Request("http://localhost:8141/api/dingtalk/todo/create", { method: "POST" }),
    env: await localOnlineEnv({ capabilities: ["read"] }),
    data: {},
    next: async () => {
      continued = true;
      return Response.json({ ok: true });
    }
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(continued, false);
  assert.equal(body.error.code, "PRODUCTION_CAPABILITY_REQUIRED");
});

test("localhost online mode requires a server-only personal token", async () => {
  const response = await apiMiddleware({
    request: new Request("http://localhost:8141/api/state"),
    env: { LOCAL_ONLINE_ACCOUNT_MODE: "1", PRODUCT_FLOW_DB: createAuthD1Mock() },
    data: {},
    next: async () => Response.json({ ok: true })
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "LOCAL_ONLINE_TOKEN_REQUIRED");
});

test("local online mode never bypasses authentication on non-local hosts", async () => {
  const response = await apiMiddleware({
    request: new Request("https://flow.example.com/api/state"),
    env: await localOnlineEnv(),
    data: {},
    next: async () => Response.json({ ok: true })
  });

  assert.equal(response.status, 401);
});

test("session bootstrap exposes the middleware preview identity", async () => {
  const response = await getCurrentSession({
    request: new Request("http://127.0.0.1:8141/api/auth/session"),
    env: {},
    data: { session: identity }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.user.name, "周荣庆");
});

test("readonly sessions cannot write shared company state", async () => {
  const response = await stateRequest({
    request: new Request("https://flow.example.com/api/state", {
      method: "POST",
      body: JSON.stringify({ state: {} })
    }),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() },
    data: { session: { role: "readonly", name: "只读访客" } }
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /只读/);
});

test("organization sync persists the active employee cache", async () => {
  const db = createAuthD1Mock();
  await upsertOrgMembers(db, {
    syncedAt: "2026-07-14T08:00:00.000Z",
    users: [{
      userId: "user-1",
      unionId: "union-1",
      name: "周荣庆",
      title: "总经理",
      departmentNames: ["总经办"],
      role: "executive",
      active: true
    }]
  }, "ding-company");

  assert.equal(db.dumpMembers().length, 1);
  assert.equal(db.dumpMembers()[0].department, "总经办");
  assert.equal(db.dumpMembers()[0].active, 1);
  assert.equal(db.calls.filter(call => call.type === "batch").length, 1);
});

test("organization sync never downgrades an explicitly elevated executive account", async () => {
  const db = createAuthD1Mock();
  const baseUser = {
    userId: "user-1",
    unionId: "union-1",
    name: "周荣庆",
    title: "总经理",
    departmentNames: ["总经办"],
    active: true
  };

  await upsertOrgMembers(db, { users: [{ ...baseUser, role: "executive" }] }, "ding-company");
  await upsertOrgMembers(db, { users: [{ ...baseUser, role: "ops" }] }, "ding-company");

  assert.equal(db.dumpMembers()[0].role, "executive");
});

test("a partial organization snapshot never deactivates an explicitly elevated executive account", async () => {
  const db = createAuthD1Mock();
  await upsertOrgMembers(db, {
    users: [{
      userId: "user-1",
      unionId: "union-1",
      name: "周荣庆",
      departmentNames: ["总经办"],
      role: "executive",
      active: true
    }]
  }, "ding-company");

  await upsertOrgMembers(db, { users: [] }, "ding-company");
  const deactivation = db.calls.filter(call => call.type === "run" && /UPDATE product_flow_org_members SET active = 0/i.test(call.sql)).at(-1);

  assert.match(deactivation.sql, /role <> 'executive'/);
  assert.equal(db.dumpMembers()[0].active, 1);
});
