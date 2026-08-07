import { readSession } from "./auth/_shared/session.js";
import { authorizeCoreDeveloperRequest, productionAccessError } from "./platform/_shared/productionDataAccess.js";
import {
  assertEnvironmentWriteVersion,
  dataEnvironmentErrorResponse,
  resolveDataEnvironment,
  withDataEnvironmentHeaders
} from "./platform/_shared/dataEnvironment.js";
import {
  browserOriginErrorResponse,
  browserOriginPolicy,
  browserPreflightResponse,
  withBrowserCors
} from "./platform/_shared/browserOriginPolicy.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function coreDeveloperErrorResponse(error) {
  const resolved = error?.code
    ? error
    : productionAccessError("核心开发者认证暂不可用。", 503, "CORE_DEVELOPER_AUTH_UNAVAILABLE", true);
  const message = resolved.message;
  const requestId = crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({
    authenticated: false,
    message,
    error: {
      code: resolved.code,
      message,
      requestId,
      retryable: Boolean(resolved.retryable)
    }
  }, resolved.status || 500);
}

const PUBLIC_PATHS = new Set([
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/dingtalk/start",
  "/api/auth/dingtalk/bootstrap",
  "/api/auth/dingtalk/callback",
  "/api/auth/dingtalk/complete",
  "/api/auth/dingtalk/embedded",
  "/api/dingtalk/config",
  "/api/dingtalk/login"
]);

const ALTERNATE_AUTH_PATHS = new Set([
  "/api/platform/v1/production-write-session",
  "/api/platform/v1/production-data/state",
  "/api/platform/v1/production-data/store-connections",
  "/api/platform/v1/environment-readiness",
  "/api/platform/v1/erp-collection/runners",
  "/api/platform/v1/web-collection/runners"
]);

const DATA_ENVIRONMENT_CONTROL_PATHS = [
  "/api/auth/",
  "/api/platform/v1/data-environment",
  "/api/platform/v1/environment-readiness",
  "/api/platform/v1/production-data/",
  "/api/platform/v1/production-write-session",
  "/api/platform/v1/platform-connections",
  "/api/platform/v1/credential-vault"
];

function usesControlDatabaseOnly(path) {
  return DATA_ENVIRONMENT_CONTROL_PATHS.some(prefix =>
    path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

function usesHandlerBearerAuth(path) {
  return path === "/api/platform/v1/user-insights/collector"
    || path === "/api/platform/v1/user-insights/ingest"
    || path === "/api/platform/v1/erp-collection/archives"
    || path === "/api/platform/v1/erp-collection/ingest"
    || path === "/api/platform/v1/erp-collection/sales-facts"
    || path === "/api/platform/v1/commerce-facts/ingest"
    || path === "/api/platform/v1/web-collection/jobs"
    || path.startsWith("/api/platform/v1/browser-agent/");
}

const SELF_AUTHENTICATING_PATH_PREFIXES = [
  "/api/platform/v1/data-standards"
];

function usesRouteAuthentication(path) {
  return SELF_AUTHENTICATING_PATH_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export async function onRequest(context) {
  const originPolicy = browserOriginPolicy(context.request, context.env);
  if (!originPolicy.allowed) return browserOriginErrorResponse(originPolicy);
  if (context.request.method === "OPTIONS") return browserPreflightResponse(originPolicy);
  const finish = response => withBrowserCors(response, originPolicy);
  const path = new URL(context.request.url).pathname.replace(/\/$/, "") || "/";
  let authenticated = false;
  const coreDeveloperToken = String(context.request.headers.get("x-pfs-core-developer-token") || "").trim();
  if (coreDeveloperToken) {
    if (!context.env.PRODUCT_FLOW_DB) {
      return finish(coreDeveloperErrorResponse(productionAccessError(
        "核心开发者认证数据库暂不可用。",
        503,
        "CORE_DEVELOPER_STORAGE_UNAVAILABLE",
        true
      )));
    }
    try {
      context.data.session = await authorizeCoreDeveloperRequest(context.request, context.env.PRODUCT_FLOW_DB);
      authenticated = true;
    } catch (error) {
      return finish(coreDeveloperErrorResponse(error));
    }
  }
  if (PUBLIC_PATHS.has(path)) return finish(await context.next());

  if (!authenticated) {
    const session = await readSession(context.request, context.env);
    if (session) {
      context.data.session = session;
      authenticated = true;
    }
  }
  if (authenticated) {
    if (usesControlDatabaseOnly(path)) return finish(await context.next());
    try {
      const resolved = await resolveDataEnvironment(context);
      context.data.controlDb = context.env.PRODUCT_FLOW_DB;
      context.data.dataEnvironment = resolved;
      context.data.businessDb = resolved.businessDb;
      assertEnvironmentWriteVersion(context.request, resolved);
      return finish(withDataEnvironmentHeaders(await context.next(), resolved));
    } catch (error) {
      return finish(dataEnvironmentErrorResponse(error));
    }
  }
  if (ALTERNATE_AUTH_PATHS.has(path) || usesRouteAuthentication(path) || usesHandlerBearerAuth(path)) {
    return finish(await context.next());
  }

  return finish(jsonResponse({
    authenticated: false,
    message: "请先使用钉钉登录。"
  }, 401));
}
