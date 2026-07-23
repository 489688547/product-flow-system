import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { readSession } from "./auth/_shared/session.js";
import { authorizeProductionToken, productionAccessError } from "./platform/_shared/productionDataAccess.js";
import {
  assertEnvironmentWriteVersion,
  dataEnvironmentErrorResponse,
  resolveDataEnvironment,
  withDataEnvironmentHeaders
} from "./platform/_shared/dataEnvironment.js";

const PUBLIC_PATHS = new Set([
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/dingtalk/start",
  "/api/auth/dingtalk/callback",
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
    || path === "/api/platform/v1/web-collection/jobs"
    || path.startsWith("/api/platform/v1/browser-agent/");
}

function isLoopbackRequest(request) {
  const hostname = new URL(request.url).hostname;
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function localOnlineError(error) {
  return jsonResponse({
    authenticated: false,
    message: error?.message || "本地线上账号验证失败。",
    error: {
      code: error?.code || "LOCAL_ONLINE_AUTH_FAILED",
      retryable: Boolean(error?.retryable)
    }
  }, error?.status || 500);
}

async function localOnlineAccountSession(request, env = {}) {
  if (env.LOCAL_ONLINE_ACCOUNT_MODE !== "1" || !isLoopbackRequest(request)) return null;
  if (!env.PRODUCTION_DATA_ACCESS_TOKEN) {
    throw productionAccessError("本地线上账号缺少个人令牌。", 401, "LOCAL_ONLINE_TOKEN_REQUIRED");
  }
  if (!env.PRODUCT_FLOW_DB) {
    throw productionAccessError("本地线上账号缺少生产 D1 绑定。", 503, "LOCAL_ONLINE_DATABASE_REQUIRED");
  }
  const capability = ["GET", "HEAD"].includes(request.method) ? "read" : "write";
  const access = await authorizeProductionToken(env.PRODUCTION_DATA_ACCESS_TOKEN, env.PRODUCT_FLOW_DB, { capability });
  return {
    corpId: access.corpId,
    userId: access.userId,
    unionId: access.unionId,
    name: access.name,
    role: access.role,
    department: access.department,
    title: access.title,
    loginMode: "local-online-account"
  };
}

const SELF_AUTHENTICATING_PATH_PREFIXES = [
  "/api/platform/v1/data-standards"
];

function usesRouteAuthentication(path) {
  return SELF_AUTHENTICATING_PATH_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return optionsResponse();
  const path = new URL(context.request.url).pathname.replace(/\/$/, "") || "/";
  let authenticated = false;
  try {
    const localSession = await localOnlineAccountSession(context.request, context.env);
    if (localSession) {
      context.data.session = localSession;
      authenticated = true;
    }
  } catch (error) {
    return localOnlineError(error);
  }
  if (PUBLIC_PATHS.has(path)) return context.next();

  if (!authenticated) {
    const session = await readSession(context.request, context.env);
    if (session) {
      context.data.session = session;
      authenticated = true;
    }
  }
  if (authenticated) {
    if (usesControlDatabaseOnly(path)) return context.next();
    try {
      const resolved = await resolveDataEnvironment(context);
      context.data.controlDb = context.env.PRODUCT_FLOW_DB;
      context.data.dataEnvironment = resolved;
      context.data.businessDb = resolved.businessDb;
      assertEnvironmentWriteVersion(context.request, resolved);
      return withDataEnvironmentHeaders(await context.next(), resolved);
    } catch (error) {
      return dataEnvironmentErrorResponse(error);
    }
  }
  if (ALTERNATE_AUTH_PATHS.has(path) || usesRouteAuthentication(path) || usesHandlerBearerAuth(path)) return context.next();

  return jsonResponse({
    authenticated: false,
    message: "请先使用钉钉登录。"
  }, 401);
}
