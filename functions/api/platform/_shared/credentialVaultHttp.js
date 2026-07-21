const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff"
};

export function credentialJsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...headers }
  });
}

export function credentialOptionsResponse(methods) {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": [...methods, "OPTIONS"].join(","),
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600"
    }
  });
}

export function credentialRequestId() {
  return crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

export function credentialErrorResponse(error, requestId = credentialRequestId()) {
  const status = Number(error?.status || 500);
  const code = error?.code || "INTERNAL_UNEXPECTED";
  const message = status >= 500 && code === "INTERNAL_UNEXPECTED"
    ? "加密凭证服务暂不可用。"
    : String(error?.message || "加密凭证操作失败。");
  return credentialJsonResponse({
    synced: false,
    message,
    error: { code, message, requestId, retryable: status >= 500 && code !== "CREDENTIAL_DECRYPT_FAILED" }
  }, status);
}

export function credentialContext(session, env, requestId, extra = {}) {
  return {
    masterKey: env.PLATFORM_CREDENTIAL_MASTER_KEY || env.DATA_CREDENTIAL_MASTER_KEY || "",
    actorType: "employee",
    actorId: String(session.userId || session.unionId || "unknown"),
    actorName: String(session.name || session.userId || "unknown"),
    requestId,
    ...extra
  };
}

export async function credentialRequestBody(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("缺少有效的请求内容。");
    error.code = "CREDENTIAL_ENTRY_INVALID";
    error.status = 400;
    throw error;
  }
  return body;
}

export function assertCredentialFields(body, allowed) {
  const unknown = Object.keys(body).filter(key => !allowed.has(key));
  if (unknown.length) {
    const error = new Error(`凭证请求包含不允许的字段：${unknown.join("、")}。`);
    error.code = "CREDENTIAL_ENTRY_INVALID";
    error.status = 400;
    throw error;
  }
}
