import { getDingAccessToken } from "../../dingtalk/_shared/dingtalk.js";
import { callKuaimai } from "../../kuaimai/_shared/kuaimai.js";

const VALIDATION_TIMEOUT_MS = 8_000;

function validationError(message, status = 422, retryable = false) {
  const error = new Error(message);
  error.code = "PLATFORM_CONNECTION_VALIDATION_FAILED";
  error.status = status;
  error.retryable = retryable;
  return error;
}

async function withTimeout(run, timeoutMs = VALIDATION_TIMEOUT_MS) {
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(validationError("平台连接验证超时，原连接未受影响。", 504, true));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function fetchWithSignal(fetchImpl, signal) {
  return (url, options = {}) => fetchImpl(url, { ...options, signal });
}

async function testDingTalk(values, fetchImpl, signal) {
  await getDingAccessToken({
    DINGTALK_APP_KEY: values.appKey,
    DINGTALK_APP_SECRET: values.appSecret
  }, fetchWithSignal(fetchImpl, signal));
  return { connected: true, message: "钉钉连接已验证。" };
}

async function testKuaimai(values, fetchImpl, signal) {
  const payload = await callKuaimai("open.system.time.get", {}, {
    appKey: values.appKey,
    appSecret: values.appSecret,
    accessToken: values.accessToken,
    refreshToken: values.refreshToken || ""
  }, fetchWithSignal(fetchImpl, signal));
  return {
    connected: true,
    message: "快麦连接已验证。",
    serverTime: payload.time || payload.systemTime || payload.date || ""
  };
}

const TESTERS = new Map([
  ["dingtalk", testDingTalk],
  ["kuaimai", testKuaimai]
]);

export async function testPlatformConnection(platformId, values, fetchImpl = fetch) {
  const tester = TESTERS.get(String(platformId || "").trim());
  if (!tester) throw validationError("该平台尚未开放连接验证。", 400, false);
  try {
    const result = await withTimeout(signal => tester(values, fetchImpl, signal));
    return { ...result, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error?.code === "PLATFORM_CONNECTION_VALIDATION_FAILED") throw error;
    const retryable = error?.status === 429 || Number(error?.status || 0) >= 500;
    throw validationError("连接验证失败，原连接未受影响。请检查填写内容和平台权限。", retryable ? 502 : 422, retryable);
  }
}

export const platformConnectionTesterInternals = { VALIDATION_TIMEOUT_MS, withTimeout };
