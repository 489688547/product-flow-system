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
