import {
  DataEnvironmentError,
  controlDatabase,
  currentDataEnvironmentSelection,
  dataEnvironmentActorId,
  dataEnvironmentErrorResponse
} from "../_shared/dataEnvironment.js";
import {
  appendDataEnvironmentAudit,
  createEnvironmentGrant,
  environmentCookieToken,
  environmentGrantCookie,
  getDisplayEnvironmentState,
  hashEnvironmentToken,
  revokeEnvironmentGrant
} from "../_shared/dataEnvironmentStorage.js";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function assertExecutive(session) {
  if (!session || session.role !== "executive") {
    throw new DataEnvironmentError(
      403,
      "DATA_ENVIRONMENT_PERMISSION_DENIED",
      "只有最高权限账号可以管理数据环境。"
    );
  }
}

function assertDisplaySelectable(state) {
  if (!state.enabled) {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_DISABLED", "展示数据库当前未启用。");
  }
  if (state.status === "refreshing") {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_MAINTENANCE", "展示数据库正在更新，请等待完成。", true);
  }
  if (state.status === "failed") {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_REFRESH_FAILED", "展示数据库生成失败，请重新生成。", true);
  }
  if (state.status !== "ready") {
    throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_NOT_READY", "展示数据库尚未准备完成。", true);
  }
}

function publicDisplayState(state) {
  return {
    enabled: state.enabled,
    status: state.status,
    version: state.version,
    activeJobId: state.activeJobId,
    ruleVersion: state.ruleVersion,
    sourceUpdatedAt: state.sourceUpdatedAt,
    coverage: state.coverage,
    validation: state.validation,
    lastErrorCode: state.lastErrorCode,
    lastUpdatedAt: state.updatedAt
  };
}

export async function handleDataEnvironmentRequest(context) {
  const { request, env = {}, data = {} } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!["GET", "PUT"].includes(request.method)) {
    throw new DataEnvironmentError(405, "DATA_ENVIRONMENT_METHOD_NOT_ALLOWED", "Method not allowed");
  }
  assertExecutive(data.session);
  const controlDb = data.controlDb || controlDatabase(env);
  const displayState = await getDisplayEnvironmentState(controlDb);

  if (request.method === "GET") {
    return jsonResponse({
      current: await currentDataEnvironmentSelection({ request, env, data: { ...data, controlDb } }),
      display: publicDisplayState(displayState),
      permissions: { canManage: true }
    });
  }

  const input = await request.json().catch(() => null);
  const environmentId = String(input?.environmentId || "");
  if (!["production", "display"].includes(environmentId)) {
    throw new DataEnvironmentError(400, "DATA_ENVIRONMENT_INVALID", "数据环境选项无效。");
  }
  if (environmentId === "display") {
    if (!env.DEMO_FLOW_DB) {
      throw new DataEnvironmentError(503, "DATA_ENVIRONMENT_BINDING_MISSING", "展示数据库连接暂不可用。", true);
    }
    assertDisplaySelectable(displayState);
  }

  const actorId = dataEnvironmentActorId(data.session);
  if (!actorId) {
    throw new DataEnvironmentError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
  }
  const existingToken = environmentCookieToken(request);
  if (existingToken) {
    await revokeEnvironmentGrant(
      controlDb,
      await hashEnvironmentToken(existingToken),
      actorId
    );
  }
  const environmentVersion = environmentId === "display" ? displayState.version : 1;
  const grant = await createEnvironmentGrant(controlDb, {
    actorId,
    environmentId,
    environmentVersion
  });
  await appendDataEnvironmentAudit(controlDb, {
    actorId,
    action: "switch",
    environmentId,
    environmentVersion,
    resultCode: "DATA_ENVIRONMENT_SWITCHED"
  });
  return jsonResponse({
    current: {
      id: environmentId,
      version: environmentVersion,
      versionRequired: true
    },
    display: publicDisplayState(displayState),
    permissions: { canManage: true }
  }, 200, {
    "set-cookie": environmentGrantCookie(grant.token, request.url)
  });
}

export async function onRequest(context) {
  try {
    return await handleDataEnvironmentRequest(context);
  } catch (error) {
    return dataEnvironmentErrorResponse(error);
  }
}
