import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createDataEnvironmentD1Mock } from "./helpers/data-environment-d1-mock.mjs";

const routePath = resolve("functions/api/platform/v1/data-environment.js");
const executiveSession = {
  userId: "executive-1",
  unionId: "union-1",
  name: "最高权限账号",
  role: "executive",
  department: "总经办"
};

async function route() {
  assert.equal(existsSync(routePath), true, "data environment API route must exist");
  return import(routePath);
}

function context({
  method = "GET",
  body,
  session = executiveSession,
  controlDb = createDataEnvironmentD1Mock(),
  cookie = ""
} = {}) {
  return {
    request: new Request("https://example.com/api/platform/v1/data-environment", {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }),
    env: { PRODUCT_FLOW_DB: controlDb, DEMO_FLOW_DB: {} },
    data: { session, controlDb }
  };
}

test("GET returns safe environment status without binding IDs", async () => {
  const { onRequest } = await route();
  const response = await onRequest(context());
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.current.id, "production");
  assert.equal(payload.display.status, "ready");
  assert.equal(payload.permissions.canManage, true);
  assert.equal(JSON.stringify(payload).includes("PRODUCT_FLOW_DB"), false);
  assert.equal(JSON.stringify(payload).includes("DEMO_FLOW_DB"), false);
});

test("only an executive can switch data environments", async () => {
  const { onRequest } = await route();
  const response = await onRequest(context({
    method: "PUT",
    body: { environmentId: "display" },
    session: { userId: "employee-1", role: "product", department: "产品部" }
  }));
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "DATA_ENVIRONMENT_PERMISSION_DENIED");
});

test("switching to display stores only a token hash and sets an HttpOnly cookie", async () => {
  const { onRequest } = await route();
  const controlDb = createDataEnvironmentD1Mock();
  const response = await onRequest(context({
    method: "PUT",
    body: { environmentId: "display" },
    controlDb
  }));
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie") || "";

  assert.equal(response.status, 200);
  assert.equal(payload.current.id, "display");
  assert.equal(payload.current.version, 7);
  assert.match(cookie, /^pfs_data_environment=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(controlDb.grants.size, 1);
  const [storedHash] = controlDb.grants.keys();
  const rawToken = decodeURIComponent(cookie.match(/^pfs_data_environment=([^;]+)/)?.[1] || "");
  assert.notEqual(storedHash, rawToken);
  assert.equal(JSON.stringify([...controlDb.audits]).includes(rawToken), false);
});

test("display cannot be selected while it is refreshing", async () => {
  const { onRequest } = await route();
  const controlDb = createDataEnvironmentD1Mock({
    displayState: {
      id: "display",
      enabled: 1,
      status: "refreshing",
      version: 7,
      updated_at: "2026-07-23T01:00:00.000Z"
    }
  });
  const response = await onRequest(context({
    method: "PUT",
    body: { environmentId: "display" },
    controlDb
  }));
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "DATA_ENVIRONMENT_MAINTENANCE");
  assert.equal(controlDb.grants.size, 0);
});

test("unknown environment values are rejected", async () => {
  const { onRequest } = await route();
  const response = await onRequest(context({
    method: "PUT",
    body: { environmentId: "database-id-from-browser" }
  }));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "DATA_ENVIRONMENT_INVALID");
});
