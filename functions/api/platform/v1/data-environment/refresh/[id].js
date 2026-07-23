import {
  DataEnvironmentError,
  controlDatabase,
  dataEnvironmentErrorResponse
} from "../../../_shared/dataEnvironment.js";
import {
  DemoDataRefreshError,
  createD1RefreshRepository
} from "../../../_shared/demoDataRefresh.js";

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
      "只有最高权限账号可以查看展示数据库更新。"
    );
  }
}

function safeJob(job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    currentTable: job.currentTable,
    counts: job.counts,
    lastErrorCode: job.lastErrorCode,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    terminal: ["succeeded", "failed"].includes(job.status)
  };
}

export async function handleGetDisplayRefresh(context) {
  const { request, env = {}, data = {}, params = {} } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "GET") {
    throw new DataEnvironmentError(405, "DATA_ENVIRONMENT_METHOD_NOT_ALLOWED", "Method not allowed");
  }
  assertExecutive(data.session);
  const repository = data.refreshRepository
    || createD1RefreshRepository(data.controlDb || controlDatabase(env));
  const job = await repository.getJob(String(params.id || ""));
  if (!job) {
    throw new DemoDataRefreshError("DEMO_DATA_REFRESH_NOT_FOUND", "没有找到展示数据库更新任务。", 404);
  }
  return response({ job: safeJob(job) });
}

export async function onRequest(context) {
  try {
    return await handleGetDisplayRefresh(context);
  } catch (error) {
    return dataEnvironmentErrorResponse(error);
  }
}
