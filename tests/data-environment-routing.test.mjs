import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createDataEnvironmentD1Mock } from "./helpers/data-environment-d1-mock.mjs";

const modulePath = resolve("functions/api/platform/_shared/dataEnvironment.js");
const storagePath = resolve("functions/api/platform/_shared/dataEnvironmentStorage.js");
const executiveSession = {
  userId: "executive-1",
  unionId: "union-1",
  name: "最高权限账号",
  role: "executive",
  department: "总经办"
};

async function modules() {
  assert.equal(existsSync(modulePath), true, "shared data environment router must exist");
  assert.equal(existsSync(storagePath), true, "data environment storage must exist");
  return Promise.all([import(modulePath), import(storagePath)]);
}

test("authenticated requests default to the production business database", async () => {
  const [{ resolveDataEnvironment }] = await modules();
  const controlDb = createDataEnvironmentD1Mock();
  const displayDb = {};
  const result = await resolveDataEnvironment({
    request: new Request("https://example.com/api/state"),
    env: { PRODUCT_FLOW_DB: controlDb, DEMO_FLOW_DB: displayDb },
    data: { session: executiveSession }
  });

  assert.equal(result.id, "production");
  assert.equal(result.version, 1);
  assert.equal(result.businessDb, controlDb);
});

test("a valid ready display grant selects DEMO_FLOW_DB", async () => {
  const [{ resolveDataEnvironment }, { hashEnvironmentToken }] = await modules();
  const controlDb = createDataEnvironmentD1Mock();
  const displayDb = {};
  const token = "valid-display-browser-grant";
  const tokenHash = await hashEnvironmentToken(token);
  controlDb.grants.set(tokenHash, {
    token_hash: tokenHash,
    actor_id: executiveSession.userId,
    environment_id: "display",
    environment_version: 7,
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null
  });

  const result = await resolveDataEnvironment({
    request: new Request("https://example.com/api/state", {
      headers: { cookie: `pfs_data_environment=${token}` }
    }),
    env: { PRODUCT_FLOW_DB: controlDb, DEMO_FLOW_DB: displayDb },
    data: { session: executiveSession }
  });

  assert.equal(result.id, "display");
  assert.equal(result.version, 7);
  assert.equal(result.businessDb, displayDb);
});

test("display maintenance never falls back to production", async () => {
  const [{ resolveDataEnvironment }, { hashEnvironmentToken }] = await modules();
  const controlDb = createDataEnvironmentD1Mock({
    displayState: {
      id: "display",
      enabled: 1,
      status: "refreshing",
      version: 7,
      updated_at: "2026-07-23T01:00:00.000Z"
    }
  });
  const token = "refreshing-display-grant";
  const tokenHash = await hashEnvironmentToken(token);
  controlDb.grants.set(tokenHash, {
    token_hash: tokenHash,
    actor_id: executiveSession.userId,
    environment_id: "display",
    environment_version: 7,
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null
  });

  await assert.rejects(
    () => resolveDataEnvironment({
      request: new Request("https://example.com/api/state", {
        headers: { cookie: `pfs_data_environment=${token}` }
      }),
      env: { PRODUCT_FLOW_DB: controlDb, DEMO_FLOW_DB: {} },
      data: { session: executiveSession }
    }),
    error => error?.code === "DATA_ENVIRONMENT_MAINTENANCE" && error?.status === 503
  );
});

test("business writes reject a stale environment version", async () => {
  const [{ assertEnvironmentWriteVersion }] = await modules();
  const request = new Request("https://example.com/api/state", {
    method: "POST",
    headers: { "x-data-environment-version": "6" }
  });

  assert.throws(
    () => assertEnvironmentWriteVersion(request, { id: "display", version: 7 }),
    error => error?.code === "DATA_ENVIRONMENT_VERSION_CONFLICT" && error?.status === 409
  );
});

test("request business database prefers the middleware-selected database", async () => {
  const [{ requestBusinessDatabase }] = await modules();
  const productionDb = { name: "production" };
  const displayDb = { name: "display" };

  assert.equal(
    requestBusinessDatabase({
      env: { PRODUCT_FLOW_DB: productionDb },
      data: { businessDb: displayDb }
    }),
    displayDb
  );
  assert.equal(
    requestBusinessDatabase({ env: { PRODUCT_FLOW_DB: productionDb } }),
    productionDb
  );
});
