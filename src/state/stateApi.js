const PRODUCTION_STATE_API = "https://product-flow-system.pages.dev/api/state";

export function sharedStateApiUrl(hostname = "") {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname)
    ? PRODUCTION_STATE_API
    : "/api/state";
}
