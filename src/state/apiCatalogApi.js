import { buildApiLiveUrl, sanitizeApiPreview } from "../domain/apiCatalog.js";

function apiCatalogRequestError(code, message, cause) {
  return Object.assign(new Error(message, { cause }), { code });
}

export async function runApiLiveTest({
  endpoint,
  params = {},
  fetchImpl = fetch,
  now = () => new Date(),
  timeoutMs = 15_000
}) {
  const url = buildApiLiveUrl(endpoint, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = now();

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const rawBody = contentType.includes("application/json")
      ? await response.json()
      : { text: await response.text() };
    const preview = sanitizeApiPreview(rawBody);
    const finishedAt = now();

    return {
      testedAt: finishedAt.toISOString(),
      status: response.status,
      durationMs: Math.max(0, finishedAt.valueOf() - startedAt.valueOf()),
      requestId: response.headers.get("x-request-id")
        || rawBody?.requestId
        || rawBody?.meta?.requestId
        || null,
      dataEnvironment: response.headers.get("x-data-environment")
        || rawBody?.meta?.dataEnvironment
        || null,
      body: preview.body,
      truncated: preview.truncated
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw apiCatalogRequestError("API_LIVE_TEST_TIMEOUT", "接口实测超过 15 秒。", error);
    }
    if (error?.code?.startsWith?.("API_")) throw error;
    throw apiCatalogRequestError("API_LIVE_TEST_FAILED", "接口实测失败。", error);
  } finally {
    clearTimeout(timeout);
  }
}
