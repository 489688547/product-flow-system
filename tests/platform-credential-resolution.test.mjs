import assert from "node:assert/strict";
import test from "node:test";
import { buildResolvedConfigResponse, resolveDingCredentials } from "../functions/api/dingtalk/_shared/dingtalk.js";
import { resolveKuaimaiConfig } from "../functions/api/kuaimai/_shared/kuaimai.js";
import { inspectEnvironmentReadiness } from "../functions/api/platform/_shared/environmentReadiness.js";
import { platformCredentialCryptoInternals } from "../functions/api/platform/_shared/credentialCrypto.js";
import { savePlatformCredentials } from "../functions/api/platform/_shared/platformCredentials.js";
import { createPlatformCredentialD1Mock } from "./helpers/platform-credential-d1-mock.mjs";

function masterKey() {
  return platformCredentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function seed(db, key, platformId, fields) {
  await savePlatformCredentials(db, { platformId, expectedVersion: 0, fields }, {
    masterKey: key,
    actorId: "u-exec",
    actorName: "最高权限账号",
    requestId: "req-seed",
    validate: async () => ({ connected: true })
  });
}

test("DingTalk runtime and public login config prefer the managed company connection", async () => {
  const db = createPlatformCredentialD1Mock();
  const key = masterKey();
  await seed(db, key, "dingtalk", { appKey: "vault-ding-key", appSecret: "vault-ding-secret" });
  const env = {
    PRODUCT_FLOW_DB: db,
    PLATFORM_CREDENTIAL_MASTER_KEY: key,
    DINGTALK_APP_KEY: "legacy-key",
    DINGTALK_APP_SECRET: "legacy-secret"
  };

  const resolved = await resolveDingCredentials(env);
  assert.equal(resolved.appKey, "vault-ding-key");
  assert.equal(resolved.appSecret, "vault-ding-secret");
  const publicConfig = await buildResolvedConfigResponse(env, "https://product-flow-system.pages.dev");
  assert.equal(publicConfig.configured, true);
  assert.equal(publicConfig.clientId, "vault-ding-key");
  assert.equal(JSON.stringify(publicConfig).includes("vault-ding-secret"), false);
});

test("Kuaimai runtime prefers the managed company connection", async () => {
  const db = createPlatformCredentialD1Mock();
  const key = masterKey();
  await seed(db, key, "kuaimai", {
    appKey: "vault-km-key",
    appSecret: "vault-km-secret",
    accessToken: "vault-km-token"
  });
  const config = await resolveKuaimaiConfig({
    PRODUCT_FLOW_DB: db,
    PLATFORM_CREDENTIAL_MASTER_KEY: key,
    KUAIMAI_APP_KEY: "legacy-key",
    KUAIMAI_APP_SECRET: "legacy-secret",
    KUAIMAI_ACCESS_TOKEN: "legacy-token"
  });

  assert.equal(config.appKey, "vault-km-key");
  assert.equal(config.appSecret, "vault-km-secret");
  assert.equal(config.accessToken, "vault-km-token");
  assert.equal(config.ready, true);
});

test("environment readiness accepts configured vault fields", async () => {
  const db = createPlatformCredentialD1Mock();
  const key = masterKey();
  await seed(db, key, "dingtalk", { appKey: "vault-key", appSecret: "vault-secret" });
  const readiness = await inspectEnvironmentReadiness({
    env: { RUNTIME_ENV: "production", PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: key },
    requestUrl: "https://product-flow-system.pages.dev/api/platform/v1/environment-readiness",
    manifest: {
      capabilities: [{
        id: "dingtalk-core",
        name: "钉钉登录与组织能力",
        description: "test",
        platforms: ["dingtalk"],
        requiredIn: ["production"],
        level: "blocking",
        envVars: ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"],
        bindings: [],
        tables: []
      }]
    }
  });

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.capabilities[0].missing, []);
});

test("environment readiness rejects an invalid or wrong vault key", async () => {
  const db = createPlatformCredentialD1Mock();
  const key = masterKey();
  await seed(db, key, "dingtalk", { appKey: "vault-key", appSecret: "vault-secret" });
  const manifest = {
    capabilities: [
      {
        id: "platform-credential-vault", name: "平台连接安全存储", description: "test",
        platforms: ["dingtalk"], requiredIn: ["production"], level: "blocking",
        envVars: ["PLATFORM_CREDENTIAL_MASTER_KEY"], bindings: [], tables: []
      },
      {
        id: "dingtalk-core", name: "钉钉登录与组织能力", description: "test",
        platforms: ["dingtalk"], requiredIn: ["production"], level: "blocking",
        envVars: ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"], bindings: [], tables: []
      }
    ]
  };
  const invalid = await inspectEnvironmentReadiness({
    env: { RUNTIME_ENV: "production", PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: "not-a-valid-key" },
    requestUrl: "https://product-flow-system.pages.dev/api/platform/v1/environment-readiness",
    manifest
  });
  assert.equal(invalid.ready, false);
  assert.deepEqual(invalid.capabilities[0].missing, ["PLATFORM_CREDENTIAL_MASTER_KEY"]);

  const wrong = await inspectEnvironmentReadiness({
    env: { RUNTIME_ENV: "production", PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: masterKey() },
    requestUrl: "https://product-flow-system.pages.dev/api/platform/v1/environment-readiness",
    manifest
  });
  assert.equal(wrong.ready, false);
  assert.deepEqual(wrong.capabilities[1].missing, ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"]);
});
