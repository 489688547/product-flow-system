import { canManagePermissions } from "../../../../src/domain/permissions.js";
import {
  PLATFORM_CONNECTION_DEFINITIONS,
  platformEnvironmentValues,
  platformRequiredFields
} from "../../../../src/domain/platformConnections.js";
import { testPlatformConnection } from "../_shared/platformConnectionTesters.js";
import {
  disablePlatformCredentials,
  listPlatformCredentialMetadata,
  platformCredentialDatabase,
  savePlatformCredentials
} from "../_shared/platformCredentials.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

function errorResponse(error, fallbackRequestId) {
  const knownCode = String(error?.code || "");
  const status = Number(error?.status || 500);
  const message = knownCode
    ? String(error?.message || "平台连接操作失败。")
    : "平台连接操作失败，请稍后重试。";
  return jsonResponse({
    synced: false,
    message,
    error: {
      code: knownCode || "INTERNAL_UNEXPECTED",
      message,
      requestId: fallbackRequestId,
      retryable: Boolean(error?.retryable || status >= 500)
    }
  }, status);
}

function canManage(session) {
  return Boolean(session && session.role !== "readonly" && canManagePermissions(session));
}

function assertManage(session) {
  if (!canManage(session)) {
    const error = new Error("仅最高权限管理员可以修改平台连接。");
    error.code = "PERMISSION_WRITE_DENIED";
    error.status = 403;
    throw error;
  }
}

function connectionSummaries(env, metadataRows) {
  const rows = new Map(metadataRows.map(row => [row.platformId, row]));
  return PLATFORM_CONNECTION_DEFINITIONS.map(definition => {
    const row = rows.get(definition.id);
    if (!definition.available) {
      return {
        platformId: definition.id,
        status: "unavailable",
        enabled: false,
        configuredFields: [],
        version: 0,
        verifiedAt: "",
        verifiedBy: "",
        source: "none"
      };
    }
    const environmentValues = platformEnvironmentValues(env, definition.id);
    const environmentFields = Object.keys(environmentValues).sort();
    const required = platformRequiredFields(definition.id);
    const environmentComplete = required.every(field => environmentFields.includes(field));
    if (row?.enabled) return { ...row, status: "connected", source: "vault" };
    if (environmentFields.length) {
      return {
        platformId: definition.id,
        status: environmentComplete ? "configured" : "incomplete",
        enabled: true,
        configuredFields: environmentFields,
        version: Number(row?.version || 0),
        verifiedAt: row?.verifiedAt || "",
        verifiedBy: row?.verifiedBy || "",
        source: "environment"
      };
    }
    return {
      platformId: definition.id,
      status: row ? "disabled" : "unconfigured",
      enabled: false,
      configuredFields: row?.configuredFields || [],
      version: Number(row?.version || 0),
      verifiedAt: row?.verifiedAt || "",
      verifiedBy: row?.verifiedBy || "",
      source: row ? "disabled" : "none"
    };
  });
}

export async function handlePlatformConnectionsRequest(context, dependencies = {}) {
  const { request, env = {}, data = {} } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  const id = requestId();
  if (!data.session) {
    return errorResponse(Object.assign(new Error("请先使用钉钉登录。"), { code: "AUTH_SESSION_REQUIRED", status: 401 }), id);
  }
  if (!["GET", "PUT", "DELETE"].includes(request.method)) {
    return errorResponse(Object.assign(new Error("当前请求方法不受支持。"), { code: "VALIDATION_METHOD_NOT_ALLOWED", status: 405 }), id);
  }
  const db = platformCredentialDatabase(env);
  if (!db) {
    return errorResponse(Object.assign(new Error("平台连接存储暂不可用。"), { code: "PLATFORM_CONNECTION_STORAGE_UNAVAILABLE", status: 501 }), id);
  }

  try {
    if (request.method === "GET") {
      const metadata = await listPlatformCredentialMetadata(db);
      return jsonResponse({ synced: true, canManage: canManage(data.session), connections: connectionSummaries(env, metadata) });
    }

    assertManage(data.session);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      const error = new Error("平台连接请求格式不正确。");
      error.code = "PLATFORM_CONNECTION_INVALID";
      error.status = 400;
      throw error;
    }
    const operationContext = {
      masterKey: env.PLATFORM_CREDENTIAL_MASTER_KEY,
      actorId: data.session.userId || data.session.unionId || "unknown",
      actorName: data.session.name || "未知管理员",
      requestId: id
    };
    if (request.method === "PUT") {
      const validate = dependencies.testConnection || testPlatformConnection;
      const connection = await savePlatformCredentials(db, body, {
        ...operationContext,
        validate: values => validate(body.platformId, values)
      });
      return jsonResponse({ synced: true, connection: { ...connection, status: "connected" } });
    }
    const connection = await disablePlatformCredentials(db, body, operationContext);
    return jsonResponse({ synced: true, connection: { ...connection, status: "disabled" } });
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function onRequest(context) {
  return handlePlatformConnectionsRequest(context);
}
