const PRODUCTION_PLATFORM_API = "https://product-flow-system.pages.dev/api/platform";

export function platformApiUrl(hostname = "") {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname)
    ? PRODUCTION_PLATFORM_API
    : "/api/platform";
}
