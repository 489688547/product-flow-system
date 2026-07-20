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

function base64UrlToBytes(value, code = "CREDENTIAL_KEY_UNAVAILABLE") {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw credentialError("加密主密钥不可用。", code, 503);
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

async function importMasterKey(masterKey, code) {
  const bytes = base64UrlToBytes(masterKey, code);
  if (bytes.byteLength !== 32) throw credentialError("加密主密钥不可用。", code, 503);
  try {
    return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    throw credentialError("加密主密钥不可用。", code, 503);
  }
}

function assertPayload(payload, { message, code }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw credentialError(message, code, 400);
  }
}

async function encryptPayload(payload, { masterKey, keyVersion, additionalData, keyErrorCode, invalidCode, invalidMessage, encryptCode, encryptMessage }) {
  assertPayload(payload, { message: invalidMessage, code: invalidCode });
  const key = await importMasterKey(masterKey, keyErrorCode);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, key, encoder.encode(JSON.stringify(payload)));
    return { ciphertext: bytesToBase64Url(new Uint8Array(encrypted)), iv: bytesToBase64Url(iv), algorithm: ALGORITHM, keyVersion };
  } catch {
    throw credentialError(encryptMessage, encryptCode, 500);
  }
}

async function decryptPayload(record, { masterKey, keyVersion, additionalData, keyErrorCode, invalidCode, invalidMessage, decryptCode, decryptMessage }) {
  if (record.algorithm !== ALGORITHM || Number(record.keyVersion ?? record.key_version) !== Number(keyVersion)) {
    throw credentialError("凭证密钥版本不可用。", keyErrorCode, 503);
  }
  const key = await importMasterKey(masterKey, keyErrorCode);
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(record.iv, keyErrorCode), additionalData, tagLength: 128 }, key, base64UrlToBytes(record.ciphertext, keyErrorCode));
    const payload = JSON.parse(decoder.decode(decrypted));
    assertPayload(payload, { message: invalidMessage, code: invalidCode });
    return payload;
  } catch (error) {
    if (error?.code === invalidCode || error?.code === keyErrorCode) throw error;
    throw credentialError(decryptMessage, decryptCode, 500);
  }
}

export async function encryptPlatformCredentials(payload, options = {}) {
  const platformId = String(options.platformId || "").trim();
  if (!platformId) throw credentialError("缺少平台标识。", "PLATFORM_CONNECTION_INVALID", 400);
  const keyVersion = Number(options.keyVersion || KEY_VERSION);
  return encryptPayload(payload, {
    ...options,
    keyVersion,
    additionalData: encoder.encode(`product-flow-platform|${platformId}|${keyVersion}`),
    keyErrorCode: "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE",
    invalidCode: "PLATFORM_CONNECTION_INVALID",
    invalidMessage: "平台连接内容格式不正确。",
    encryptCode: "PLATFORM_CREDENTIAL_ENCRYPT_FAILED",
    encryptMessage: "平台连接保存失败。"
  });
}

export async function decryptPlatformCredentials(record = {}, options = {}) {
  const keyVersion = Number(record.keyVersion || record.key_version || KEY_VERSION);
  return decryptPayload(record, {
    ...options,
    keyVersion,
    additionalData: encoder.encode(`product-flow-platform|${String(options.platformId || "")}|${keyVersion}`),
    keyErrorCode: "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE",
    invalidCode: "PLATFORM_CONNECTION_INVALID",
    invalidMessage: "平台连接内容格式不正确。",
    decryptCode: "PLATFORM_CREDENTIAL_DECRYPT_FAILED",
    decryptMessage: "平台连接内容校验失败。"
  });
}

export async function encryptCredential(payload, options = {}) {
  if (!options.entryId || !options.purpose) throw credentialError("凭证加密上下文不完整。", "CREDENTIAL_ENTRY_INVALID", 400);
  const keyVersion = Number(options.keyVersion || KEY_VERSION);
  return encryptPayload(payload, {
    ...options,
    keyVersion,
    additionalData: encoder.encode(`${options.entryId}|${options.purpose}|${keyVersion}`),
    keyErrorCode: "CREDENTIAL_KEY_UNAVAILABLE",
    invalidCode: "CREDENTIAL_ENTRY_INVALID",
    invalidMessage: "凭证内容必须是对象。",
    encryptCode: "CREDENTIAL_ENCRYPT_FAILED",
    encryptMessage: "凭证加密失败。"
  });
}

export async function decryptCredential(record = {}, options = {}) {
  const keyVersion = Number(record.keyVersion || KEY_VERSION);
  return decryptPayload(record, {
    ...options,
    keyVersion,
    additionalData: encoder.encode(`${options.entryId || ""}|${options.purpose || ""}|${keyVersion}`),
    keyErrorCode: "CREDENTIAL_KEY_UNAVAILABLE",
    invalidCode: "CREDENTIAL_ENTRY_INVALID",
    invalidMessage: "凭证内容必须是对象。",
    decryptCode: "CREDENTIAL_DECRYPT_FAILED",
    decryptMessage: "凭证内容校验失败。"
  });
}

export const platformCredentialCryptoInternals = { ALGORITHM, DEFAULT_KEY_VERSION: KEY_VERSION, base64UrlToBytes, bytesToBase64Url, validMasterKey };
export const credentialCryptoInternals = { ALGORITHM, KEY_VERSION, base64UrlToBytes, bytesToBase64Url };
