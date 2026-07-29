import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

test("Aliyun ECS runtime and OSS backup are declared without access-key material", async () => {
  const environment = await json("docs/platform/environment-capabilities.json");
  const registry = await json("docs/platform/integration-registry.json");
  const runtime = environment.capabilities.find(entry => entry.id === "aliyun-ecs-runtime");
  const backup = environment.capabilities.find(entry => entry.id === "aliyun-oss-backup");
  const aliyun = registry.platforms.find(entry => entry.id === "aliyun");

  assert.ok(runtime, "Aliyun ECS runtime capability must be declared");
  assert.deepEqual(runtime.bindings, ["PRODUCT_FLOW_DB", "DEMO_FLOW_DB"]);
  assert.deepEqual(runtime.envVars, [
    "DINGTALK_APP_KEY",
    "DINGTALK_APP_SECRET",
    "PLATFORM_CREDENTIAL_MASTER_KEY",
    "DEMO_DATA_MASKING_KEY"
  ]);
  assert.ok(backup, "Aliyun OSS backup capability must be declared");
  assert.deepEqual(backup.envVars, ["OSS_BACKUP_URI", "OSS_REGION", "OSS_ENDPOINT"]);
  assert.equal(JSON.stringify(backup).includes("ACCESS_KEY"), false);
  assert.ok(aliyun.codePaths.includes("deploy/aliyun/**"));
  assert.ok(aliyun.codePaths.includes("scripts/aliyun/**"));
  assert.ok(aliyun.capabilities.includes("ECS 容器运行时"));
  assert.ok(aliyun.capabilities.includes("OSS 私有备份"));
});

test("Aliyun runtime rejects local executive bypass and unsafe paths", async () => {
  const { validateRuntimeEnvironment } = await import("../scripts/aliyun/runtime-config.mjs");
  const valid = {
    PFS_RUNTIME_PORT: "8080",
    PFS_WRANGLER_PERSIST_DIR: "/var/lib/product-flow/wrangler",
    PFS_RUNTIME_ENV_FILE: "/run/pfs/runtime.env",
    PFS_WRANGLER_CONFIG: "/app/deploy/aliyun/wrangler.toml",
    PFS_ASSETS_DIR: "/app/dist",
    PFS_WRANGLER_BIN: "/app/node_modules/.bin/wrangler"
  };

  assert.throws(
    () => validateRuntimeEnvironment({ ...valid, LOCAL_ONLINE_ACCOUNT_MODE: "1" }),
    /LOCAL_ONLINE_ACCOUNT_MODE/
  );
  assert.throws(
    () => validateRuntimeEnvironment({ ...valid, PFS_WRANGLER_PERSIST_DIR: "./data" }),
    /PFS_WRANGLER_PERSIST_DIR/
  );
  assert.throws(
    () => validateRuntimeEnvironment({ ...valid, PFS_RUNTIME_HOST: "118.178.236.192" }),
    /PFS_RUNTIME_HOST/
  );
  assert.equal(validateRuntimeEnvironment(valid).host, "127.0.0.1");
  assert.equal(validateRuntimeEnvironment(valid).port, 8080);
});

test("Aliyun runtime builds a non-interactive local Pages command without secret values", async () => {
  const { buildPagesDevArgs, validateRuntimeEnvironment } = await import("../scripts/aliyun/runtime-config.mjs");
  const config = validateRuntimeEnvironment({
    PFS_RUNTIME_PORT: "8080",
    PFS_WRANGLER_PERSIST_DIR: "/var/lib/product-flow/wrangler",
    PFS_RUNTIME_ENV_FILE: "/run/pfs/runtime.env",
    PFS_WRANGLER_CONFIG: "/app/deploy/aliyun/wrangler.toml",
    PFS_ASSETS_DIR: "/app/dist",
    PFS_WRANGLER_BIN: "/app/node_modules/.bin/wrangler",
    DINGTALK_APP_SECRET: "must-not-appear"
  });
  const args = buildPagesDevArgs(config);

  assert.deepEqual(args, [
    "pages", "dev", "/app/dist",
    "--config", "/app/deploy/aliyun/wrangler.toml",
    "--ip", "127.0.0.1",
    "--port", "8080",
    "--persist-to", "/var/lib/product-flow/wrangler",
    "--env-file", "/run/pfs/runtime.env",
    "--show-interactive-dev-session=false",
    "--log-level", "info"
  ]);
  assert.equal(JSON.stringify(args).includes("must-not-appear"), false);
});

test("DingTalk OAuth on the Aliyun HTTPS origin keeps its callback same-origin", async () => {
  const { createBrowserOauthStartResponse } = await import(
    "../functions/api/auth/_shared/browser-oauth-start.js"
  );
  const response = createBrowserOauthStartResponse({
    request: new Request("https://deshan-tiyes.top/api/auth/dingtalk/start"),
    env: {
      DINGTALK_APP_KEY: "test-app-key",
      DINGTALK_APP_SECRET: "test-app-secret"
    }
  });
  const authorize = new URL(response.headers.get("location"));

  assert.equal(response.status, 302);
  assert.equal(
    authorize.searchParams.get("redirect_uri"),
    "https://deshan-tiyes.top/api/auth/dingtalk/callback"
  );
});

test("D1 transfer exports both databases with hashes and refuses an overwrite", async () => {
  const { exportCloudflareD1, importLocalD1 } = await import("../scripts/aliyun/d1-transfer.mjs");
  const tempRoot = await mkdtemp(join(tmpdir(), "pfs-aliyun-transfer-"));
  const exportDir = join(tempRoot, "export");
  const persistDir = join(tempRoot, "persist");
  const calls = [];
  const run = async (_command, args) => {
    calls.push(args);
    const outputIndex = args.indexOf("--output");
    if (outputIndex >= 0) {
      await mkdir(exportDir, { recursive: true });
      await writeFile(args[outputIndex + 1], `-- ${args[2]}\nSELECT 1;\n`, "utf8");
    }
  };

  const manifest = await exportCloudflareD1({
    exportDir,
    run,
    now: () => "2026-07-29T08:00:00.000Z"
  });
  assert.deepEqual(manifest.databases.map(item => item.name), [
    "product-flow-system",
    "product-flow-system-display"
  ]);
  assert.ok(manifest.databases.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.equal(calls.filter(args => args.includes("--remote")).length, 2);

  calls.length = 0;
  await importLocalD1({ exportDir, persistDir, run });
  assert.equal(calls.filter(args => args.includes("--local")).length, 2);
  await assert.rejects(
    () => importLocalD1({ exportDir, persistDir, run }),
    /已经完成过导入/
  );
});

test("D1 transfer rejects a changed SQL export and unsafe OSS destination", async () => {
  const { backupLocalD1, exportCloudflareD1, importLocalD1 } = await import(
    "../scripts/aliyun/d1-transfer.mjs"
  );
  const tempRoot = await mkdtemp(join(tmpdir(), "pfs-aliyun-integrity-"));
  const exportDir = join(tempRoot, "export");
  const run = async (_command, args) => {
    const outputIndex = args.indexOf("--output");
    if (outputIndex >= 0) {
      await mkdir(exportDir, { recursive: true });
      await writeFile(args[outputIndex + 1], "SELECT 1;\n", "utf8");
    }
  };
  await exportCloudflareD1({ exportDir, run });
  const manifest = JSON.parse(await readFile(join(exportDir, "manifest.json"), "utf8"));
  await writeFile(join(exportDir, manifest.databases[0].file), "SELECT 2;\n", "utf8");

  await assert.rejects(
    () => importLocalD1({ exportDir, persistDir: join(tempRoot, "persist"), run }),
    /SHA-256/
  );
  await assert.rejects(
    () => backupLocalD1({
      backupDir: join(tempRoot, "backup"),
      persistDir: join(tempRoot, "persist"),
      ossUri: "https://example.com/not-oss",
      run
    }),
    /OSS_BACKUP_URI/
  );
});

test("Aliyun compose binds only to loopback and joins the existing proxy network", async () => {
  const { load } = await import("js-yaml");
  const composeText = await readFile(resolve(root, "deploy/aliyun/docker-compose.yml"), "utf8");
  const compose = load(composeText);
  const service = compose.services["product-flow-app"];

  assert.deepEqual(service.ports, ["127.0.0.1:8080:8080"]);
  assert.deepEqual(service.networks, ["proxy"]);
  assert.equal(compose.networks.proxy.external, true);
  assert.match(compose.networks.proxy.name, /nginx-proxy-manage_default/);
  assert.equal(service.restart, "unless-stopped");
  assert.equal(service.environment.PFS_RUNTIME_HOST, "0.0.0.0");
  assert.ok(service.healthcheck);
  assert.equal(JSON.stringify(compose).includes("DINGTALK_APP_SECRET:"), false);
});

test("Aliyun native systemd service is loopback-only and resource bounded", async () => {
  const unit = await readFile(resolve(root, "deploy/aliyun/product-flow.service"), "utf8");

  assert.match(unit, /^User=pfs$/m);
  assert.match(unit, /^Environment=PFS_RUNTIME_HOST=127\.0\.0\.1$/m);
  assert.match(unit, /^MemoryMax=768M$/m);
  assert.match(unit, /^NoNewPrivileges=true$/m);
  assert.match(unit, /^ReadWritePaths=\/opt\/product-flow\/data$/m);
  assert.doesNotMatch(unit, /DINGTALK_APP_SECRET/);
});

test("local D1 check requires both databases to contain tables", async () => {
  const { checkLocalD1 } = await import("../scripts/aliyun/check-local-d1.mjs");
  const queried = [];
  const checks = await checkLocalD1({
    persistDir: "/var/lib/product-flow/wrangler",
    configPath: "/app/deploy/aliyun/wrangler.toml",
    runQuery: async (_command, args) => {
      queried.push(args);
      return JSON.stringify([{ success: true, results: [{ table_count: 119 }] }]);
    }
  });

  assert.equal(queried.length, 2);
  assert.deepEqual(checks.map(check => check.name), [
    "product-flow-system",
    "product-flow-system-display"
  ]);
  await assert.rejects(
    () => checkLocalD1({
      persistDir: "/var/lib/product-flow/wrangler",
      configPath: "/app/deploy/aliyun/wrangler.toml",
      runQuery: async () => JSON.stringify([{ success: true, results: [{ table_count: 0 }] }])
    }),
    /校验失败/
  );
});
