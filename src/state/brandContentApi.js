const PRODUCTION_BRAND_CONTENT_API = "https://product-flow-system.pages.dev/api/brand-content";

export function brandContentApiUrl(hostname = "") {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname)
    ? PRODUCTION_BRAND_CONTENT_API
    : "/api/brand-content";
}
