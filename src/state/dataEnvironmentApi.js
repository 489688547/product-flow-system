const DATA_ENVIRONMENT_API = "/api/platform/v1/data-environment";

async function payloadFrom(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const error = new Error(payload.error?.message || payload.message || "数据环境处理失败，请稍后重试。");
  error.status = response.status;
  error.code = payload.error?.code || "DATA_ENVIRONMENT_REQUEST_FAILED";
  error.retryable = Boolean(payload.error?.retryable);
  throw error;
}

export async function loadDataEnvironment(fetchImpl = fetch) {
  return payloadFrom(await fetchImpl(DATA_ENVIRONMENT_API, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" }
  }));
}

export async function switchDataEnvironment(environmentId, fetchImpl = fetch) {
  if (!["production", "display"].includes(environmentId)) {
    const error = new Error("数据环境选项无效。");
    error.code = "DATA_ENVIRONMENT_INVALID";
    throw error;
  }
  return payloadFrom(await fetchImpl(DATA_ENVIRONMENT_API, {
    method: "PUT",
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({ environmentId })
  }));
}
