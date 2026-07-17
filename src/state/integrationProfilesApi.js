const PRODUCTION_INTEGRATIONS_API = "https://product-flow-system.pages.dev/api/platform/v1/integrations";

export function integrationProfilesApiUrl(hostname = "") {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname)
    ? PRODUCTION_INTEGRATIONS_API
    : "/api/platform/v1/integrations";
}

async function readPayload(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `内部平台资料请求失败（HTTP ${response.status}）。`);
  return payload;
}

export async function loadIntegrationProfiles({ hostname = "", fetchImpl = fetch } = {}) {
  const response = await fetchImpl(integrationProfilesApiUrl(hostname), { credentials: "include" });
  const payload = await readPayload(response);
  return Array.isArray(payload.profiles) ? payload.profiles : [];
}

export async function saveIntegrationProfile(profile, { hostname = "", fetchImpl = fetch } = {}) {
  const response = await fetchImpl(integrationProfilesApiUrl(hostname), {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile)
  });
  const payload = await readPayload(response);
  return payload.profile;
}
