import {
  DataEnvironmentError,
  controlDatabase,
  dataEnvironmentActorId,
  dataEnvironmentErrorResponse
} from "../../_shared/dataEnvironment.js";
import {
  appendDataEnvironmentAudit,
  getDisplayEnvironmentState
} from "../../_shared/dataEnvironmentStorage.js";
import {
  createD1RefreshRepository,
  createDisplayRefreshJob
} from "../../_shared/demoDataRefresh.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function assertExecutive(session) {
  if (!session || session.role !== "executive") {
    throw new DataEnvironmentError(
      403,
      "DATA_ENVIRONMENT_PERMISSION_DENIED",
      "只有最高权限账号可以更新展示数据库。"
    );
  }
}

export async function handleCreateDisplayRefresh(context) {
  const { request, env = {}, data = {} } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") {
    throw new DataEnvironmentError(405, "DATA_ENVIRONMENT_METHOD_NOT_ALLOWED", "Method not allowed");
  }
  assertExecutive(data.session);
  if (!env.DEMO_FLOW_DB) {
    throw new DataEnvironmentError(
      503,
      "DATA_ENVIRONMENT_BINDING_MISSING",
      "展示数据库连接暂不可用。",
      true
    );
  }
  if (String(env.DEMO_DATA_MASKING_KEY || "").length < 16) {
    throw new DataEnvironmentError(
      503,
      "DEMO_MASKING_KEY_MISSING",
      "展示数据脱敏能力未配置，无法开始更新。",
      true
    );
  }
  const controlDb = data.controlDb || controlDatabase(env);
  const actorId = dataEnvironmentActorId(data.session);
  const displayState = await getDisplayEnvironmentState(controlDb);
  const job = await createDisplayRefreshJob({
    repository: data.refreshRepository || createD1RefreshRepository(controlDb),
    actorId,
    sourceVersion: new Date().toISOString()
  });
  await appendDataEnvironmentAudit(controlDb, {
    actorId,
    action: job.reused ? "refresh_resume" : "refresh_start",
    environmentId: "display",
    environmentVersion: displayState.version,
    jobId: job.id,
    resultCode: job.reused ? "DEMO_DATA_REFRESH_RESUMED" : "DEMO_DATA_REFRESH_STARTED"
  });
  return response({ job }, job.reused ? 200 : 202);
}

export async function onRequest(context) {
  try {
    return await handleCreateDisplayRefresh(context);
  } catch (error) {
    return dataEnvironmentErrorResponse(error);
  }
}
