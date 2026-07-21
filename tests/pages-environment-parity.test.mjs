import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("scripts/check-pages-environment-parity.mjs");
const requiredSecrets = [
  "DINGTALK_APP_KEY",
  "DINGTALK_APP_SECRET",
  "KUAIMAI_ACCESS_TOKEN",
  "KUAIMAI_APP_KEY",
  "KUAIMAI_APP_SECRET",
  "PLATFORM_CREDENTIAL_MASTER_KEY"
];

function d1(section, id = "shared-database-id") {
  return `[[${section}]]\nbinding = "PRODUCT_FLOW_DB"\ndatabase_name = "product-flow-system"\ndatabase_id = "${id}"\nremote = true\n`;
}

function completeConfig() {
  return [
    'name = "product-flow-system"',
    d1("d1_databases"),
    d1("env.preview.d1_databases"),
    d1("env.production.d1_databases")
  ].join("\n");
}

test("the local Wrangler contract declares one D1 in all environments without unsupported secret sections", async () => {
  const { assertPagesEnvironmentParity } = await import(scriptPath);
  const result = assertPagesEnvironmentParity(completeConfig());
  assert.equal(result.databaseId, "shared-database-id");
  assert.doesNotMatch(completeConfig(), /\[.*secrets\]/);
});

test("the repository Wrangler config satisfies the explicit three-environment contract", async () => {
  const { assertPagesEnvironmentParity } = await import(scriptPath);
  const result = assertPagesEnvironmentParity(readFileSync(resolve("wrangler.toml"), "utf8"));
  assert.ok(result.databaseId);
});

test("D1 drift fails without echoing configuration values", async () => {
  const { assertPagesEnvironmentParity } = await import(scriptPath);
  const drifted = completeConfig().replace(
    '[[env.production.d1_databases]]\nbinding = "PRODUCT_FLOW_DB"\ndatabase_name = "product-flow-system"\ndatabase_id = "shared-database-id"',
    '[[env.production.d1_databases]]\nbinding = "PRODUCT_FLOW_DB"\ndatabase_name = "product-flow-system"\ndatabase_id = "other-database-id"'
  );
  assert.throws(() => assertPagesEnvironmentParity(drifted), error => {
    assert.match(error.message, /D1|DINGTALK_APP_SECRET/);
    assert.doesNotMatch(error.message, /actual-secret-value/);
    return true;
  });
});

test("required Pages secrets come from the executable environment capability manifest", async () => {
  const { requiredPagesSecrets } = await import(scriptPath);
  const manifest = JSON.parse(readFileSync(resolve("docs/platform/environment-capabilities.json"), "utf8"));
  assert.deepEqual(requiredPagesSecrets(manifest), requiredSecrets);
});

test("remote inspection accepts top-level Preview fallback and compares actual secret names", async () => {
  const { inspectRemotePagesParity } = await import(scriptPath);
  const remoteConfig = [
    'name = "product-flow-system"',
    d1("d1_databases"),
    d1("env.production.d1_databases")
  ].join("\n");
  const secretOutput = requiredSecrets.map(name => `  - ${name}: Value Encrypted`).join("\n");
  const result = inspectRemotePagesParity({
    configSource: remoteConfig,
    previewSecretOutput: secretOutput,
    productionSecretOutput: secretOutput,
    requiredSecrets
  });
  assert.equal(result.sameDatabase, true);
  assert.deepEqual(result.missingSecrets, { preview: [], production: [] });
});

test("remote inspection reports names only when Preview is incomplete", async () => {
  const { inspectRemotePagesParity } = await import(scriptPath);
  const remoteConfig = [d1("d1_databases"), d1("env.production.d1_databases")].join("\n");
  const production = requiredSecrets.map(name => `  - ${name}: Value Encrypted`).join("\n");
  assert.throws(() => inspectRemotePagesParity({
    configSource: remoteConfig,
    previewSecretOutput: "  - DINGTALK_APP_KEY: Value Encrypted\nsecret-value-must-not-echo",
    productionSecretOutput: production,
    requiredSecrets
  }), error => {
    assert.match(error.message, /DINGTALK_APP_SECRET/);
    assert.doesNotMatch(error.message, /secret-value-must-not-echo/);
    return true;
  });
});
