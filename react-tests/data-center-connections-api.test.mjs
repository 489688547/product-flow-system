import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  archiveCredential,
  createCredential,
  loadCredentialMetadata,
  loadDataCenterConnections,
  persistConnectorConnection,
  replaceCredential,
  revealCredential,
  saveConnectorInstance,
  saveInternalVaultItem
} from "../src/state/dataCenterConnectionsApi.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("connection loaders use stable internal endpoints", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url === "/api/data-center/connectors") return jsonResponse({ synced: true, connectors: [{ id: "shop-1" }], vaultItems: [] });
    return jsonResponse({ synced: true, entries: [{ id: "cred-1", hasSecret: true }] });
  };
  const connections = await loadDataCenterConnections(fetchImpl);
  const credentials = await loadCredentialMetadata(fetchImpl);
  assert.deepEqual(calls, ["/api/data-center/connectors", "/api/platform/v1/credential-vault"]);
  assert.equal(connections.connectors[0].id, "shop-1");
  assert.equal(credentials.entries[0].hasSecret, true);
});

test("connector and internal vault writes send expected versions without secrets", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return jsonResponse(url.includes("connectors")
      ? { synced: true, ...(JSON.parse(options.body).instance ? { instance: { id: "shop-1", version: 1 } } : { vaultItem: { id: "nas-1", version: 1 } }) }
      : {});
  };
  await saveConnectorInstance({ connectorId: "douyin-ecommerce", name: "抖音官旗" }, 0, fetchImpl);
  await saveInternalVaultItem({ itemType: "nas", name: "杭州 NAS" }, 0, fetchImpl);
  assert.deepEqual(calls.map(call => call.url), ["/api/data-center/connectors", "/api/data-center/connectors"]);
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[0].body.expectedVersion, 0);
  assert.equal("secretPayload" in calls[0].body.instance, false);
  assert.equal(calls[1].body.vaultItem.itemType, "nas");
});

test("credential create replace archive and reveal use separate controlled actions", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, method: options.method, body });
    if (url.endsWith("/reveal")) return jsonResponse({ synced: true, secretPayload: { password: "revealed" }, revealedAt: "now" });
    return jsonResponse({ synced: true, entry: { id: "cred-1", version: 2, hasSecret: true } });
  };
  await createCredential({ scopeType: "connector", scopeId: "shop-1", category: "douyin-ecommerce", name: "登录", schemaVersion: 1, secretPayload: { password: "first" } }, fetchImpl);
  await replaceCredential("cred-1", { expectedVersion: 1, secretPayload: { password: "second" } }, fetchImpl);
  await archiveCredential("cred-1", 2, fetchImpl);
  const revealed = await revealCredential("cred-1", "排查登录", "查看加密凭证", fetchImpl);

  assert.deepEqual(calls.map(call => [call.url, call.method]), [
    ["/api/platform/v1/credential-vault", "POST"],
    ["/api/platform/v1/credential-vault/cred-1", "PUT"],
    ["/api/platform/v1/credential-vault/cred-1", "PUT"],
    ["/api/platform/v1/credential-vault/cred-1/reveal", "POST"]
  ]);
  assert.deepEqual(calls[2].body, { expectedVersion: 2, action: "archive" });
  assert.deepEqual(calls[3].body, { purpose: "排查登录", confirmation: "查看加密凭证" });
  assert.equal(revealed.secretPayload.password, "revealed");
});

test("connection API preserves stable server error codes", async () => {
  await assert.rejects(
    () => loadDataCenterConnections(async () => jsonResponse({ message: "版本冲突", error: { code: "DATA_CONNECTOR_VERSION_CONFLICT" } }, 409)),
    error => error.status === 409 && error.code === "DATA_CONNECTOR_VERSION_CONFLICT"
  );
});

test("existing store metadata is normalized to file import when no secret changes", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return jsonResponse({ synced: true, instance: { ...JSON.parse(options.body).instance, version: 3 } });
  };
  const saved = await persistConnectorConnection({
    instance: { id: "shop-1", connectorId: "douyin-ecommerce", name: "新名称", captureMethod: "export", version: 2 },
    secretPayload: {},
    vaultEntries: []
  }, fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/data-center/connectors");
  assert.equal(calls[0].body.expectedVersion, 2);
  assert.equal(calls[0].body.instance.captureMethod, "export");
  assert.equal(saved.version, 3);
});

test("connector persistence infers API access before any metadata write", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (url === "/api/platform/v1/credential-vault") {
      return jsonResponse({ synced: true, entry: { id: "cred-1", version: 1, hasSecret: true } });
    }
    const instance = body.instance;
    return jsonResponse({ synced: true, instance: { ...instance, id: instance.id || "ocean-1", version: (instance.version || 0) + 1 } });
  };

  await persistConnectorConnection({
    instance: { connectorId: "oceanengine", name: "千川官旗" },
    secretPayload: { appSecret: "api-secret", password: "browser-secret" },
    vaultEntries: []
  }, fetchImpl);

  const connectorWrites = calls.filter(call => call.url === "/api/data-center/connectors");
  assert.equal(connectorWrites.length, 2);
  assert.equal(connectorWrites[0].body.instance.captureMethod, "api");
  assert.equal(connectorWrites[1].body.instance.captureMethod, "api");
  assert.equal(JSON.stringify(connectorWrites).includes("api-secret"), false);
  assert.equal(JSON.stringify(connectorWrites).includes("browser-secret"), false);
});

test("connection client and provider never persist or expose plaintext secrets", () => {
  const client = readFileSync(new URL("../src/state/dataCenterConnectionsApi.js", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../src/state/DataCenterProvider.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB|caches\./);
  assert.doesNotMatch(provider, /localStorage\.setItem\([^\n]*(secretPayload|credentials|password)/);
  assert.match(provider, /saveConnection/);
  assert.match(provider, /refreshConnections/);
  assert.doesNotMatch(provider, /value = useMemo\([\s\S]*secretPayload/);
});
