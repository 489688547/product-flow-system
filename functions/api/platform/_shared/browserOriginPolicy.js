const ALLOW_METHODS = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOW_HEADERS = "content-type,x-data-environment-version";

function configuredOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PFS_ALLOWED_BROWSER_ORIGIN must be an HTTPS origin");
  }
  return url.origin;
}

function requestOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("invalid Origin header");
  return url.origin;
}

export function browserOriginPolicy(request, env = {}) {
  let allowedOrigin;
  try {
    allowedOrigin = configuredOrigin(env.PFS_ALLOWED_BROWSER_ORIGIN);
  } catch (error) {
    return {
      allowed: false,
      status: 503,
      code: "BROWSER_ORIGIN_INVALID",
      message: error.message,
      crossOrigin: false,
      origin: ""
    };
  }

  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return { allowed: true, crossOrigin: false, origin: "" };

  let origin;
  try {
    origin = requestOrigin(rawOrigin);
  } catch {
    return {
      allowed: false,
      status: 403,
      code: "BROWSER_ORIGIN_FORBIDDEN",
      message: "浏览器来源不被允许。",
      crossOrigin: false,
      origin: ""
    };
  }

  if (origin === new URL(request.url).origin) {
    return { allowed: true, crossOrigin: false, origin };
  }
  if (!allowedOrigin || origin !== allowedOrigin) {
    return {
      allowed: false,
      status: 403,
      code: "BROWSER_ORIGIN_FORBIDDEN",
      message: "浏览器来源不被允许。",
      crossOrigin: false,
      origin: ""
    };
  }
  return { allowed: true, crossOrigin: true, origin };
}

export function browserOriginErrorResponse(policy) {
  return new Response(JSON.stringify({
    message: policy.message,
    error: { code: policy.code, retryable: policy.status >= 500 }
  }), {
    status: policy.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function withBrowserCors(response, policy) {
  const headers = new Headers(response.headers);
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-credentials");
  headers.delete("access-control-allow-methods");
  headers.delete("access-control-allow-headers");
  headers.delete("access-control-max-age");
  if (!policy.crossOrigin) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  headers.set("access-control-allow-origin", policy.origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", ALLOW_METHODS);
  headers.set("access-control-allow-headers", ALLOW_HEADERS);
  headers.set("access-control-max-age", "600");
  const vary = headers.get("vary");
  if (!vary) headers.set("vary", "Origin");
  else if (!vary.split(",").some(value => value.trim().toLowerCase() === "origin")) {
    headers.set("vary", `${vary}, Origin`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function browserPreflightResponse(policy) {
  return withBrowserCors(new Response(null, { status: 204 }), policy);
}
