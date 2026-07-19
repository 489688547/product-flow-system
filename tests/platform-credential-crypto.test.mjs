import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptPlatformCredentials,
  encryptPlatformCredentials,
  platformCredentialCryptoInternals
} from "../functions/api/platform/_shared/credentialCrypto.js";

function masterKey() {
  return platformCredentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

test("platform credentials round-trip without plaintext persistence", async () => {
  const options = { masterKey: masterKey(), platformId: "dingtalk", keyVersion: 1 };
  const first = await encryptPlatformCredentials({ appKey: "key-value", appSecret: "secret-value" }, options);
  const second = await encryptPlatformCredentials({ appKey: "key-value", appSecret: "secret-value" }, options);

  assert.equal(first.algorithm, "AES-256-GCM");
  assert.equal(first.keyVersion, 1);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.doesNotMatch(JSON.stringify(first), /key-value|secret-value/);
  assert.deepEqual(await decryptPlatformCredentials(first, options), { appKey: "key-value", appSecret: "secret-value" });
});

test("ciphertext is bound to its platform and rejects tampering safely", async () => {
  const options = { masterKey: masterKey(), platformId: "dingtalk", keyVersion: 1 };
  const encrypted = await encryptPlatformCredentials({ appSecret: "top-secret" }, options);

  await assert.rejects(
    () => decryptPlatformCredentials(encrypted, { ...options, platformId: "kuaimai" }),
    error => error.code === "PLATFORM_CREDENTIAL_DECRYPT_FAILED" && !/AES|operation/i.test(error.message)
  );
  await assert.rejects(
    () => decryptPlatformCredentials({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}aa` }, options),
    error => error.code === "PLATFORM_CREDENTIAL_DECRYPT_FAILED" && !/AES|operation/i.test(error.message)
  );
});

test("master key must be exactly 32 bytes", async () => {
  await assert.rejects(
    () => encryptPlatformCredentials({ appSecret: "value" }, { masterKey: "short", platformId: "dingtalk" }),
    error => error.code === "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE" && error.status === 503
  );
});
