import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
    "--ip", "0.0.0.0",
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
