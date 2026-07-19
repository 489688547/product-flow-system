const ALGORITHM = "AES-256-GCM";
const KEY_VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function credentialError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw credentialError("加密主密钥不可用。", "CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
}

function additionalData({ entryId, purpose, keyVersion }) {
  return encoder.encode(`${String(entryId || "")}|${String(purpose || "")}|${Number(keyVersion || KEY_VERSION)}`);
}

async function importMasterKey(masterKey) {
  const bytes = base64UrlToBytes(masterKey);
  if (bytes.byteLength !== 32) throw credentialError("加密主密钥不可用。", "CREDENTIAL_KEY_UNAVAILABLE", 503);
  try {
    return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    throw credentialError("加密主密钥不可用。", "CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
}

function assertPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw credentialError("凭证内容必须是对象。", "CREDENTIAL_ENTRY_INVALID", 400);
  }
}

export async function encryptCredential(payload, options = {}) {
  assertPayload(payload);
  if (!options.entryId || !options.purpose) {
    throw credentialError("凭证加密上下文不完整。", "CREDENTIAL_ENTRY_INVALID", 400);
  }
  const keyVersion = Number(options.keyVersion || KEY_VERSION);
  const key = await importMasterKey(options.masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  try {
    const encrypted = await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv,
      additionalData: additionalData({ ...options, keyVersion }),
      tagLength: 128
    }, key, plaintext);
    return {
      ciphertext: bytesToBase64Url(new Uint8Array(encrypted)),
      iv: bytesToBase64Url(iv),
      algorithm: ALGORITHM,
      keyVersion
    };
  } catch {
    throw credentialError("凭证加密失败。", "CREDENTIAL_ENCRYPT_FAILED", 500);
  }
}

export async function decryptCredential(record = {}, options = {}) {
  if (record.algorithm !== ALGORITHM || Number(record.keyVersion) !== Number(options.keyVersion || KEY_VERSION)) {
    throw credentialError("凭证密钥版本不可用。", "CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
  const keyVersion = Number(record.keyVersion);
  const key = await importMasterKey(options.masterKey);
  try {
    const decrypted = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: base64UrlToBytes(record.iv),
      additionalData: additionalData({ ...options, keyVersion }),
      tagLength: 128
    }, key, base64UrlToBytes(record.ciphertext));
    const payload = JSON.parse(decoder.decode(decrypted));
    assertPayload(payload);
    return payload;
  } catch (error) {
    if (error?.code === "CREDENTIAL_ENTRY_INVALID") throw error;
    throw credentialError("凭证内容校验失败。", "CREDENTIAL_DECRYPT_FAILED", 500);
  }
}

export const credentialCryptoInternals = {
  ALGORITHM,
  KEY_VERSION,
  base64UrlToBytes,
  bytesToBase64Url
};
