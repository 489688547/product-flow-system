import assert from "node:assert/strict";
import test from "node:test";
import {
  credentialCryptoInternals,
  decryptCredential,
  encryptCredential
} from "../functions/api/platform/_shared/credentialCrypto.js";

function testMasterKey() {
  return credentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

test("AES-GCM round trips with unique IVs and bound additional data", async () => {
  const masterKey = testMasterKey();
  const options = { masterKey, entryId: "cred-1", purpose: "connector", keyVersion: 1 };
  const first = await encryptCredential({ password: "one" }, options);
  const second = await encryptCredential({ password: "one" }, options);

  assert.equal(first.algorithm, "AES-256-GCM");
  assert.equal(first.keyVersion, 1);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(await decryptCredential(first, options), { password: "one" });
  await assert.rejects(
    () => decryptCredential(first, { ...options, entryId: "cred-2" }),
    error => error.code === "CREDENTIAL_DECRYPT_FAILED"
  );
});

test("master key must be exactly 32 bytes and secret payload must be an object", async () => {
  await assert.rejects(
    () => encryptCredential({ password: "one" }, { masterKey: "short", entryId: "cred-1", purpose: "connector", keyVersion: 1 }),
    error => error.code === "CREDENTIAL_KEY_UNAVAILABLE"
  );
  await assert.rejects(
    () => encryptCredential("plaintext", { masterKey: testMasterKey(), entryId: "cred-1", purpose: "connector", keyVersion: 1 }),
    /凭证内容/
  );
});

test("tampered ciphertext never exposes a Web Crypto error", async () => {
  const options = { masterKey: testMasterKey(), entryId: "cred-1", purpose: "connector", keyVersion: 1 };
  const encrypted = await encryptCredential({ token: "top-secret" }, options);
  const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}aa` };
  await assert.rejects(
    () => decryptCredential(tampered, options),
    error => error.code === "CREDENTIAL_DECRYPT_FAILED" && !/operation|decrypt|AES/i.test(error.message)
  );
});
