const LOCAL_CORE_ORIGIN = "http://127.0.0.1:8127";
const LOCAL_CORE_HOST = "127.0.0.1:8127";
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function coreDeveloperProxyDecision({ method = "GET", host = "", origin = "" } = {}) {
  if (String(host).toLowerCase() !== LOCAL_CORE_HOST) {
    return { allowed: false, status: 403, code: "CORE_DEVELOPER_PROXY_HOST_FORBIDDEN" };
  }
  const normalizedOrigin = String(origin || "").trim();
  if (normalizedOrigin && normalizedOrigin !== LOCAL_CORE_ORIGIN) {
    return { allowed: false, status: 403, code: "CORE_DEVELOPER_PROXY_ORIGIN_FORBIDDEN" };
  }
  if (!READ_METHODS.has(String(method).toUpperCase()) && !normalizedOrigin) {
    return { allowed: false, status: 403, code: "CORE_DEVELOPER_PROXY_ORIGIN_REQUIRED" };
  }
  return { allowed: true, status: 200, code: "" };
}

export function applyCoreDeveloperProxyHeaders(proxyRequest, token) {
  proxyRequest.removeHeader("origin");
  proxyRequest.removeHeader("referer");
  proxyRequest.setHeader("x-pfs-core-developer-token", token);
}

export function coreDeveloperProxyGuard() {
  return {
    name: "core-developer-proxy-guard",
    configureServer(server) {
      server.middlewares.use("/api", (request, response, next) => {
        const decision = coreDeveloperProxyDecision({
          method: request.method,
          host: request.headers.host,
          origin: request.headers.origin
        });
        if (decision.allowed) return next();
        response.statusCode = decision.status;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(JSON.stringify({
          authenticated: false,
          message: "本地开发代理拒绝了非本机来源。",
          error: { code: decision.code, retryable: false }
        }));
      });
    }
  };
}

export function coreDeveloperProxyOptions({ target, token }) {
  if (!token) throw new Error("Core developer proxy token is required.");
  return {
    target,
    changeOrigin: true,
    secure: true,
    configure(proxy) {
      proxy.on("proxyReq", proxyRequest => applyCoreDeveloperProxyHeaders(proxyRequest, token));
    }
  };
}
