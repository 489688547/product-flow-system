import {
  environmentCookieToken,
  getDisplayEnvironmentState,
  hashEnvironmentToken,
  resolveEnvironmentGrant
} from "./dataEnvironmentStorage.js";

export class DataEnvironmentError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message);
    this.name = "DataEnvironmentError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function controlDatabase(env = {}) {
  const db = env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
  if (!db) {
    throw new DataEnvironmentError(
      503,
      "DATA_ENVIRONMENT_BINDING_MISSING",
      "正式数据库连接暂不可用。",
      true
    );
  }
  return db;
}

export function dataEnvironmentActorId(session = {}) {
  return String(session.userId || session.unionId || "");
}

function validGrant(grant, actorId, now = new Date()) {
  return Boolean(
    grant
    && !grant.revoked_at
    && grant.actor_id === actorId
    && Date.parse(grant.expires_at) > now.getTime()
    && ["production", "display"].includes(grant.environment_id)
  );
}

async function selectedGrant(context) {
  const token = environmentCookieToken(context.request);
  if (!token) return null;
  const tokenHash = await hashEnvironmentToken(token);
  const grant = await resolveEnvironmentGrant(controlDatabase(context.env), tokenHash);
  const actorId = dataEnvironmentActorId(context.data?.session);
  return validGrant(grant, actorId) ? grant : null;
}

export async function currentDataEnvironmentSelection(context) {
  const grant = await selectedGrant(context);
  if (!grant) return { id: "production", version: 1, versionRequired: false };
  return {
    id: grant.environment_id,
    version: Math.max(1, Number(grant.environment_version || 1)),
    versionRequired: true
  };
}

function assertDisplayAvailable(state) {
  if (!state.enabled) {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_DISABLED", "展示数据库当前未启用。");
  }
  if (state.status === "refreshing") {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_MAINTENANCE", "展示数据库正在更新，请等待完成。", true);
  }
  if (state.status === "failed") {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_REFRESH_FAILED", "展示数据库生成失败，请在设置中重新生成。", true);
  }
  if (state.status !== "ready") {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_NOT_READY", "展示数据库尚未准备完成。", true);
  }
}

export async function resolveDataEnvironment(context) {
  const controlDb = controlDatabase(context.env);
  const selection = await currentDataEnvironmentSelection(context);
  if (selection.id === "production") {
    return {
      ...selection,
      status: "ready",
      businessDb: controlDb
    };
  }

  const displayDb = context.env.DEMO_FLOW_DB || null;
  if (!displayDb) {
    throw new DataEnvironmentError(
      503,
      "DATA_ENVIRONMENT_BINDING_MISSING",
      "展示数据库连接暂不可用。",
      true
    );
  }
  const state = await getDisplayEnvironmentState(controlDb);
  assertDisplayAvailable(state);
  if (selection.version !== state.version) {
    throw new DataEnvironmentError(
      409,
      "DATA_ENVIRONMENT_VERSION_CONFLICT",
      "展示数据库已经更新，请重新切换后再操作。"
    );
  }
  return {
    ...selection,
    status: state.status,
    businessDb: displayDb
  };
}

export function businessDatabase(context) {
  const db = context?.data?.businessDb || null;
  if (!db) {
    throw new DataEnvironmentError(
      503,
      "DATA_ENVIRONMENT_NOT_RESOLVED",
      "业务数据库尚未完成服务端路由。",
      true
    );
  }
  return db;
}

export function assertEnvironmentWriteVersion(request, dataEnvironment) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const value = request.headers.get("x-data-environment-version");
  if (!dataEnvironment?.versionRequired && !value) return;
  if (!/^\d+$/.test(value || "") || Number(value) !== Number(dataEnvironment?.version)) {
    throw new DataEnvironmentError(
      409,
      "DATA_ENVIRONMENT_VERSION_CONFLICT",
      "数据环境已切换或更新，请重新执行当前操作。"
    );
  }
}

export function withDataEnvironmentHeaders(response, dataEnvironment) {
  const headers = new Headers(response.headers);
  headers.set("x-data-environment", dataEnvironment.id);
  headers.set("x-data-environment-version", String(dataEnvironment.version));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function dataEnvironmentErrorResponse(error) {
  const known = error instanceof DataEnvironmentError;
  const status = known ? error.status : 500;
  const message = known ? error.message : "数据环境处理失败，请稍后重试。";
  const requestId = crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return new Response(JSON.stringify({
    synced: false,
    message,
    error: {
      code: known ? error.code : "DATA_ENVIRONMENT_UNEXPECTED",
      message,
      requestId,
      retryable: Boolean(known ? error.retryable : true)
    }
  }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export const dataEnvironmentInternals = {
  assertDisplayAvailable,
  validGrant
};
