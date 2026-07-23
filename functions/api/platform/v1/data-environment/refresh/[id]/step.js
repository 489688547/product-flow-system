import {
  DataEnvironmentError,
  controlDatabase,
  dataEnvironmentActorId,
  dataEnvironmentErrorResponse
} from "../../../../_shared/dataEnvironment.js";
import {
  appendDataEnvironmentAudit,
  getDisplayEnvironmentState
} from "../../../../_shared/dataEnvironmentStorage.js";
import {
  createD1RefreshData,
  createD1RefreshRepository,
  runDisplayRefreshStep
} from "../../../../_shared/demoDataRefresh.js";

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

export async function handleRunDisplayRefreshStep(context) {
  const { request, env = {}, data = {}, params = {} } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") {
    throw new DataEnvironmentError(405, "DATA_ENVIRONMENT_METHOD_NOT_ALLOWED", "Method not allowed");
  }
  assertExecutive(data.session);
  const controlDb = data.controlDb || controlDatabase(env);
  if (!env.DEMO_FLOW_DB) {
    throw new DataEnvironmentError(
      503,
      "DATA_ENVIRONMENT_BINDING_MISSING",
      "展示数据库连接暂不可用。",
      true
    );
  }
  const repository = data.refreshRepository || createD1RefreshRepository(controlDb);
  const jobId = String(params.id || "");
  const before = await repository.getJob(jobId);
  const job = await runDisplayRefreshStep({
    repository,
    data: data.refreshData || createD1RefreshData({ sourceDb: controlDb, targetDb: env.DEMO_FLOW_DB }),
    jobId,
    maskingKey: env.DEMO_DATA_MASKING_KEY
  });
  if (!before?.finishedAt && job.terminal) {
    const displayState = await getDisplayEnvironmentState(controlDb);
    await appendDataEnvironmentAudit(controlDb, {
      actorId: dataEnvironmentActorId(data.session),
      action: "refresh_finish",
      environmentId: "display",
      environmentVersion: displayState.version,
      jobId,
      resultCode: job.status === "succeeded"
        ? "DEMO_DATA_REFRESH_SUCCEEDED"
        : job.lastErrorCode || "DEMO_DATA_REFRESH_FAILED"
    });
  }
  return response({ job }, job.busy ? 202 : 200);
}

export async function onRequest(context) {
  try {
    return await handleRunDisplayRefreshStep(context);
  } catch (error) {
    return dataEnvironmentErrorResponse(error);
  }
}
