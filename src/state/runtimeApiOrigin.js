const BUILD_API_ORIGIN = typeof import.meta.env === "object"
  ? String(import.meta.env?.VITE_PFS_API_ORIGIN || "").trim()
  : "";

function browserPageOrigin() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function normalizedOrigin(value, label) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(`${label} must use HTTPS`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be an origin without a path`);
  }
  return url.origin;
}

function inputUrl(input, pageOrigin) {
  if (typeof Request !== "undefined" && input instanceof Request) return new URL(input.url);
  if (input instanceof URL) return new URL(input.href);
  const value = String(input);
  if (/^https?:\/\//i.test(value)) return new URL(value);
  if (!value.startsWith("/")) return null;
  return new URL(value, pageOrigin || "https://runtime.invalid");
}

export function resolveRuntimeApiUrl(input, {
  apiOrigin = BUILD_API_ORIGIN,
  pageOrigin = browserPageOrigin()
} = {}) {
  const original = typeof Request !== "undefined" && input instanceof Request
    ? input.url
    : input instanceof URL ? input.href : String(input);
  if (!apiOrigin) return original;

  const normalizedPageOrigin = pageOrigin ? normalizedOrigin(pageOrigin, "pageOrigin") : "";
  const url = inputUrl(input, normalizedPageOrigin);
  if (!url || !url.pathname.startsWith("/api/")) return original;

  const isRelative = typeof input === "string" && input.startsWith("/");
  if (!isRelative && (!normalizedPageOrigin || url.origin !== normalizedPageOrigin)) return original;

  const targetOrigin = normalizedOrigin(apiOrigin, "VITE_PFS_API_ORIGIN");
  return `${targetOrigin}${url.pathname}${url.search}${url.hash}`;
}

export function runtimeApiUrl(path) {
  return resolveRuntimeApiUrl(path);
}
