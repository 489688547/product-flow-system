const TRANSIENT_STATUS = new Set([502, 503, 504]);
const DEFAULT_DELAYS = [0, 250, 750, 1500];
const PRODUCTION_ORIGIN = "https://product-flow-system.pages.dev";

function wait(delay) {
  return new Promise(resolve => setTimeout(resolve, delay));
}

function responseMessage(text, fallback) {
  try {
    const payload = JSON.parse(text);
    return String(payload?.message || payload?.error?.message || fallback);
  } catch {
    return fallback;
  }
}

function isColdStartFailure(response, text) {
  return TRANSIENT_STATUS.has(response.status)
    || (
      response.status === 500
      && /Worker exceeded resource limits|Error code:\s*1102/i.test(text)
    );
}

export async function fetchJsonWithRetry(url, options = {}, {
  delays = DEFAULT_DELAYS,
  fetchImpl = fetch,
  waitImpl = wait
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) await waitImpl(delays[attempt]);
    try {
      const response = await fetchImpl(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: {
          accept: "application/json",
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      if (response.ok) {
        try {
          return JSON.parse(text);
        } catch {
          throw new Error("登录服务返回了无法识别的结果。");
        }
      }
      const fallback = `登录服务暂时不可用（HTTP ${response.status}）。`;
      const error = new Error(responseMessage(text, fallback));
      if (!isColdStartFailure(response, text) || attempt === delays.length - 1) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === delays.length - 1) throw error;
      if (!(error instanceof TypeError)) throw error;
    }
  }
  throw lastError || new Error("登录服务暂时不可用。");
}

function statusView(documentRef, message, { failed = false } = {}) {
  const status = documentRef.querySelector("[data-oauth-status]");
  if (status) status.textContent = message;
  const retry = documentRef.querySelector("[data-oauth-retry]");
  if (retry) retry.hidden = !failed;
}

function safeReturnTo(value = "") {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

export async function runDingTalkOAuthStart({
  windowRef = window,
  documentRef = document,
  fetchImpl = fetch
} = {}) {
  const current = new URL(windowRef.location.href);
  const returnTo = safeReturnTo(current.searchParams.get("returnTo"));
  if (
    current.hostname.endsWith(".product-flow-system.pages.dev")
    && current.origin !== PRODUCTION_ORIGIN
  ) {
    const target = new URL("/api/auth/dingtalk/start", PRODUCTION_ORIGIN);
    if (returnTo) target.searchParams.set("returnTo", returnTo);
    windowRef.location.replace(target.toString());
    return;
  }

  statusView(documentRef, "正在安全连接钉钉…");
  try {
    const endpoint = new URL("/api/auth/dingtalk/bootstrap", current.origin);
    if (returnTo) endpoint.searchParams.set("returnTo", returnTo);
    const payload = await fetchJsonWithRetry(endpoint.toString(), {}, { fetchImpl });
    if (!payload?.authorizeUrl) throw new Error("登录服务没有返回钉钉授权地址。");
    statusView(documentRef, "即将打开钉钉登录…");
    windowRef.location.replace(payload.authorizeUrl);
  } catch (error) {
    statusView(documentRef, error?.message || "钉钉登录暂时不可用，请重试。", { failed: true });
  }
}

export async function runDingTalkOAuthCallback({
  windowRef = window,
  documentRef = document,
  fetchImpl = fetch
} = {}) {
  const current = new URL(windowRef.location.href);
  const code = current.searchParams.get("code") || current.searchParams.get("authCode") || "";
  const state = current.searchParams.get("state") || "";
  if (!code || !state) {
    statusView(documentRef, "登录参数不完整，请重新发起钉钉登录。", { failed: true });
    return;
  }

  statusView(documentRef, "正在完成企业身份校验…");
  try {
    const endpoint = new URL("/api/auth/dingtalk/complete", current.origin);
    endpoint.searchParams.set("code", code);
    endpoint.searchParams.set("state", state);
    const payload = await fetchJsonWithRetry(endpoint.toString(), {}, { fetchImpl });
    if (!payload?.authenticated || !payload?.redirectTo) {
      throw new Error("登录服务没有返回有效会话。");
    }
    statusView(documentRef, "登录成功，正在进入系统…");
    windowRef.location.replace(payload.redirectTo);
  } catch (error) {
    statusView(documentRef, error?.message || "钉钉登录失败，请重试。", { failed: true });
  }
}
