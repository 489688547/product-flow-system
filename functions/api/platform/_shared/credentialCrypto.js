const ALGORITHM = "AES-256-GCM";
const DEFAULT_KEY_VERSION = 1;
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
    throw credentialError("平台连接的加密能力暂不可用。", "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
}

function validMasterKey(masterKey) {
  try {
    return base64UrlToBytes(masterKey).byteLength === 32;
  } catch {
    return false;
  }
}

export function isValidPlatformCredentialMasterKey(masterKey) {
  return validMasterKey(masterKey);
}

async function importMasterKey(masterKey) {
  if (!validMasterKey(masterKey)) {
    throw credentialError("平台连接的加密能力暂不可用。", "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
  try {
    return await crypto.subtle.importKey("raw", base64UrlToBytes(masterKey), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    throw credentialError("平台连接的加密能力暂不可用。", "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
}

function additionalData(platformId, keyVersion) {
  return encoder.encode(`product-flow-platform|${String(platformId || "")}|${Number(keyVersion || DEFAULT_KEY_VERSION)}`);
}

function assertPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw credentialError("平台连接内容格式不正确。", "PLATFORM_CONNECTION_INVALID", 400);
  }
}

export async function encryptPlatformCredentials(payload, options = {}) {
  assertPayload(payload);
  const platformId = String(options.platformId || "").trim();
  if (!platformId) throw credentialError("缺少平台标识。", "PLATFORM_CONNECTION_INVALID", 400);
  const keyVersion = Number(options.keyVersion || DEFAULT_KEY_VERSION);
  const key = await importMasterKey(options.masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const encrypted = await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv,
      additionalData: additionalData(platformId, keyVersion),
      tagLength: 128
    }, key, encoder.encode(JSON.stringify(payload)));
    return {
      ciphertext: bytesToBase64Url(new Uint8Array(encrypted)),
      iv: bytesToBase64Url(iv),
      algorithm: ALGORITHM,
      keyVersion
    };
  } catch {
    throw credentialError("平台连接保存失败。", "PLATFORM_CREDENTIAL_ENCRYPT_FAILED", 500);
  }
}

export async function decryptPlatformCredentials(record = {}, options = {}) {
  const keyVersion = Number(record.keyVersion || record.key_version || DEFAULT_KEY_VERSION);
  if (record.algorithm !== ALGORITHM || keyVersion !== Number(options.keyVersion || keyVersion)) {
    throw credentialError("平台连接的加密版本暂不可用。", "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
  const key = await importMasterKey(options.masterKey);
  try {
    const decrypted = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: base64UrlToBytes(record.iv),
      additionalData: additionalData(options.platformId, keyVersion),
      tagLength: 128
    }, key, base64UrlToBytes(record.ciphertext));
    const payload = JSON.parse(decoder.decode(decrypted));
    assertPayload(payload);
    return payload;
  } catch (error) {
    if (error?.code === "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE") throw error;
    throw credentialError("平台连接内容校验失败。", "PLATFORM_CREDENTIAL_DECRYPT_FAILED", 500);
  }
}

export const platformCredentialCryptoInternals = {
  ALGORITHM,
  DEFAULT_KEY_VERSION,
  base64UrlToBytes,
  bytesToBase64Url,
  validMasterKey
};
