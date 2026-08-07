import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function availablePort() {
  const server = createNetServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const { port } = server.address();
  await new Promise(resolvePromise => server.close(resolvePromise));
  return port;
}

const validRuntime = Object.freeze({
  LOCAL_ONLINE_ACCOUNT_MODE: "0",
  PFS_RUNTIME_NAME: "production",
  PFS_RUNTIME_HOST: "127.0.0.1",
  PFS_RUNTIME_PORT: "8080",
  PFS_WRANGLER_PERSIST_DIR: "/var/lib/product-flow/wrangler",
  PFS_RUNTIME_ENV_FILE: "/run/pfs/runtime.env",
  PFS_ASSETS_DIR: "/app/dist",
  PFS_FUNCTIONS_BUNDLE: "/app/dist-server/index.js",
  PFS_PUBLIC_API_ORIGIN: "https://deshan-tiyes.cn",
  PFS_PUBLIC_APP_ORIGIN: "https://deshan-tiyes.cn"
});

test("SQLite adapter preserves D1 statement results and atomic batches", async () => {
  const { createD1Database } = await import("../server/aliyun/sqlite-d1.mjs");
  const directory = await mkdtemp(join(tmpdir(), "pfs-node-sqlite-"));
  const db = createD1Database({ file: join(directory, "business.sqlite") });

  try {
    await db.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE)");
    const inserted = await db.prepare("INSERT INTO records (id, value) VALUES (?, ?)")
      .bind(1, "first")
      .run();
    assert.equal(inserted.success, true);
    assert.equal(inserted.meta.changes, 1);
    assert.deepEqual(
      await db.prepare("SELECT id, value FROM records WHERE id = ?").bind(1).first(),
      { id: 1, value: "first" }
    );
    assert.equal(
      await db.prepare("SELECT value FROM records WHERE id = ?").bind(1).first("value"),
      "first"
    );
    assert.deepEqual(
      (await db.prepare("SELECT id, value FROM records ORDER BY id").all()).results,
      [{ id: 1, value: "first" }]
    );

    await db.prepare("DELETE FROM records").run();
    const first = db.prepare("INSERT INTO records (id, value) VALUES (?, ?)").bind(2, "duplicate");
    const duplicate = db.prepare("INSERT INTO records (id, value) VALUES (?, ?)").bind(3, "duplicate");
    await assert.rejects(() => db.batch([first, duplicate]), /UNIQUE/);
    assert.equal(await db.prepare("SELECT COUNT(*) AS count FROM records").first("count"), 0);
  } finally {
    await db.close();
  }
});

test("Hono runtime fixes the public API origin and serves the React build", async () => {
  const { createAliyunApp } = await import("../server/aliyun/app.mjs");
  const { createStaticAssetBinding } = await import("../server/aliyun/static-assets.mjs");
  const directory = await mkdtemp(join(tmpdir(), "pfs-node-assets-"));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), "<!doctype html><title>Product Flow</title>");
  await writeFile(join(directory, "assets", "app-123.js"), "console.log('ready')");
  const seen = [];
  const worker = {
    async fetch(request, env) {
      seen.push(request.url);
      const url = new URL(request.url);
      if (url.pathname === "/api/origin") {
        const response = new Response(JSON.stringify({ origin: url.origin, hasDatabase: Boolean(env.PRODUCT_FLOW_DB) }), {
          headers: { "content-type": "application/json" }
        });
        response.headers.append("set-cookie", "first=1; Path=/; HttpOnly");
        response.headers.append("set-cookie", "second=2; Path=/; HttpOnly");
        return response;
      }
      return env.ASSETS.fetch(request);
    }
  };
  const app = createAliyunApp({
    worker,
    env: { PRODUCT_FLOW_DB: {} },
    assets: createStaticAssetBinding({ root: directory }),
    publicApiOrigin: "https://deshan-tiyes.cn",
    logger: { info() {}, error() {} }
  });

  const health = await app.request("http://127.0.0.1:8080/healthz");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, runtime: "node-hono" });
  assert.deepEqual(seen, []);

  const api = await app.request("http://127.0.0.1:8080/api/origin?source=test");
  assert.deepEqual(await api.json(), { origin: "https://deshan-tiyes.cn", hasDatabase: true });
  assert.deepEqual(api.headers.getSetCookie(), [
    "first=1; Path=/; HttpOnly",
    "second=2; Path=/; HttpOnly"
  ]);
  assert.equal(seen[0], "https://deshan-tiyes.cn/api/origin?source=test");

  const asset = await app.request("http://127.0.0.1:8080/assets/app-123.js");
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "console.log('ready')");
  assert.match(asset.headers.get("cache-control"), /immutable/);

  const spa = await app.request("http://127.0.0.1:8080/data-center");
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /Product Flow/);
  const missingApi = await app.request("http://127.0.0.1:8080/api/not-registered");
  assert.equal(missingApi.status, 404);
});

test("Aliyun build produces one Node-importable Pages Functions bundle", async () => {
  const { buildAliyunFunctions } = await import("../scripts/aliyun/build-functions.mjs");
  const directory = await mkdtemp(join(tmpdir(), "pfs-node-bundle-"));
  await writeFile(join(directory, "package.json"), JSON.stringify({ type: "module" }));

  const result = await buildAliyunFunctions({
    projectDir: new URL(".", root).pathname,
    outDir: directory
  });

  assert.equal(result.bundlePath, join(directory, "index.js"));
  const bundle = await import(`${new URL(`file://${result.bundlePath}`).href}?test=${Date.now()}`);
  assert.equal(typeof bundle.default?.fetch, "function");
});

test("Node runtime starts Hono with both databases and closes cleanly", async () => {
  const { startAliyunRuntime } = await import("../scripts/aliyun/start-runtime.mjs");
  const directory = await mkdtemp(join(tmpdir(), "pfs-node-server-"));
  const assetsDir = join(directory, "assets");
  await mkdir(assetsDir);
  await writeFile(join(assetsDir, "index.html"), "<!doctype html><title>Runtime</title>");
  await writeFile(join(directory, "bundle.mjs"), "export default { fetch() {} }\n");
  const port = await availablePort();
  const worker = {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== "/api/proof") return env.ASSETS.fetch(request);
      await env.PRODUCT_FLOW_DB.exec("CREATE TABLE IF NOT EXISTS proof (value TEXT NOT NULL)");
      await env.PRODUCT_FLOW_DB.prepare("INSERT INTO proof (value) VALUES (?)").bind("production").run();
      await env.DEMO_FLOW_DB.exec("CREATE TABLE IF NOT EXISTS proof (value TEXT NOT NULL)");
      return Response.json({
        production: await env.PRODUCT_FLOW_DB.prepare("SELECT COUNT(*) AS count FROM proof").first("count"),
        demo: await env.DEMO_FLOW_DB.prepare("SELECT COUNT(*) AS count FROM proof").first("count")
      });
    }
  };
  const env = {
    ...validRuntime,
    PFS_RUNTIME_PORT: String(port),
    PFS_WRANGLER_PERSIST_DIR: join(directory, "persist"),
    PFS_RUNTIME_ENV_FILE: join(directory, "runtime.env"),
    PFS_WRANGLER_CONFIG: join(directory, "wrangler.toml"),
    PFS_RUNTIME_WORK_DIR: join(directory, "work"),
    PFS_ASSETS_DIR: assetsDir,
    PFS_FUNCTIONS_DIR: new URL("../functions", import.meta.url).pathname,
    PFS_WRANGLER_BIN: new URL("../node_modules/.bin/wrangler", import.meta.url).pathname,
    PFS_FUNCTIONS_BUNDLE: join(directory, "bundle.mjs")
  };
  await writeFile(env.PFS_RUNTIME_ENV_FILE, "PFS_TEST=1\n");
  const { validateRuntimeEnvironment } = await import("../scripts/aliyun/runtime-config.mjs");
  const config = validateRuntimeEnvironment(env);
  for (const file of [config.productDatabasePath, config.demoDatabasePath]) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "");
  }
  const runtime = await startAliyunRuntime({
    env,
    worker,
    logger: { info() {}, error() {} },
    registerSignals: false
  });

  try {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    const proof = await fetch(`http://127.0.0.1:${port}/api/proof`);
    assert.deepEqual(await proof.json(), { production: 1, demo: 0 });
  } finally {
    await runtime.close();
  }
  await assert.rejects(() => fetch(`http://127.0.0.1:${port}/healthz`));
});

test("real Pages bundle serves auth and static routes through Node without Wrangler", async () => {
  const { buildAliyunFunctions } = await import("../scripts/aliyun/build-functions.mjs");
  const { startAliyunRuntime } = await import("../scripts/aliyun/start-runtime.mjs");
  const directory = await mkdtemp(join(tmpdir(), "pfs-node-integration-"));
  const bundleDir = join(directory, "bundle");
  const assetsDir = join(directory, "assets");
  await mkdir(bundleDir);
  await mkdir(assetsDir);
  await writeFile(join(bundleDir, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(join(assetsDir, "index.html"), "<!doctype html><title>Integrated</title>");
  const built = await buildAliyunFunctions({
    projectDir: new URL(".", root).pathname,
    outDir: bundleDir
  });
  const port = await availablePort();
  const env = {
    ...validRuntime,
    DINGTALK_APP_KEY: "test-app-key",
    DINGTALK_APP_SECRET: "test-app-secret",
    PFS_RUNTIME_PORT: String(port),
    PFS_WRANGLER_PERSIST_DIR: join(directory, "persist"),
    PFS_RUNTIME_ENV_FILE: join(directory, "runtime.env"),
    PFS_ASSETS_DIR: assetsDir,
    PFS_FUNCTIONS_BUNDLE: built.bundlePath
  };
  await writeFile(env.PFS_RUNTIME_ENV_FILE, "PFS_TEST=1\n");
  const { validateRuntimeEnvironment } = await import("../scripts/aliyun/runtime-config.mjs");
  const config = validateRuntimeEnvironment(env);
  for (const file of [config.productDatabasePath, config.demoDatabasePath]) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "");
  }
  const runtime = await startAliyunRuntime({
    env,
    logger: { info() {}, error() {} },
    registerSignals: false
  });

  try {
    const session = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
    assert.equal(session.status, 401);
    assert.equal((await session.json()).authenticated, false);
    const page = await fetch(`http://127.0.0.1:${port}/data-center`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Integrated/);
    const oauth = await fetch(`http://127.0.0.1:${port}/api/auth/dingtalk/start`, { redirect: "manual" });
    assert.equal(oauth.status, 302);
    const authorize = new URL(oauth.headers.get("location"));
    assert.equal(
      authorize.searchParams.get("redirect_uri"),
      "https://deshan-tiyes.cn/api/auth/dingtalk/callback"
    );
  } finally {
    await runtime.close();
  }
});

test("Node runtime requires a fixed HTTPS API origin and a prebuilt bundle", async () => {
  const { validateRuntimeEnvironment } = await import("../scripts/aliyun/runtime-config.mjs");

  assert.throws(
    () => validateRuntimeEnvironment({ ...validRuntime, PFS_PUBLIC_API_ORIGIN: "" }),
    /PFS_PUBLIC_API_ORIGIN/
  );
  assert.throws(
    () => validateRuntimeEnvironment({ ...validRuntime, PFS_PUBLIC_API_ORIGIN: "http://deshan-tiyes.cn" }),
    /PFS_PUBLIC_API_ORIGIN/
  );
  assert.throws(
    () => validateRuntimeEnvironment({ ...validRuntime, PFS_FUNCTIONS_BUNDLE: "./dist-server/index.js" }),
    /PFS_FUNCTIONS_BUNDLE/
  );

  const config = validateRuntimeEnvironment(validRuntime);
  assert.equal(config.publicApiOrigin, "https://deshan-tiyes.cn");
  assert.equal(config.bundlePath, "/app/dist-server/index.js");
  assert.equal(
    config.productDatabasePath,
    "/var/lib/product-flow/wrangler/v3/d1/miniflare-D1DatabaseObject/6558d4a6a807981558a030e0ea9ea76e78c5298a67266b632b893c8b006c1251.sqlite"
  );
  assert.equal(
    config.demoDatabasePath,
    "/var/lib/product-flow/wrangler/v3/d1/miniflare-D1DatabaseObject/220c1db80bbabccf6417d818a39542d47f8ce5b246824ae2f633be2224c3f5c8.sqlite"
  );
});
