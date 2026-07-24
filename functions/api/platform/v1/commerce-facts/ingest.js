import { normalizeCommerceBatchInput } from "../../../../../src/domain/commerceFacts.js";
import {
  resolveCollectionBusinessDatabase,
  targetFromWebCollectionJob
} from "../../_shared/collectionTarget.js";
import {
  authenticateWebCollectionRunner,
  webCollectionDatabase
} from "../web-collection/_shared/storage.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { stageCommerceFactChunk } from "./_shared/storage.js";

async function matchingJob(controlDb, runner, input) {
  const row = await controlDb.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1")
    .bind(input.jobId)
    .first();
  if (!row) throw routeError(404, "COLLECTION_JOB_NOT_FOUND", "经营事实对应的采集任务不存在。");
  if (
    row.runner_id !== runner.id
    || row.status !== "ingesting"
    || Date.parse(row.lease_expires_at || "") <= Date.now()
    || row.provider_id !== input.providerId
    || String(row.store_id || "") !== input.storeId
    || row.resource_type !== input.resourceType
    || row.business_date !== input.businessDate
  ) {
    throw routeError(409, "COLLECTION_JOB_MISMATCH", "经营事实与当前设备领取的采集任务不一致。");
  }
  return row;
}

export async function onRequest({ request, env, data = {} }) {
  const id = requestId();
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
    }
    if (request.method !== "POST") {
      throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    }
    const controlDb = webCollectionDatabase(env);
    if (!controlDb) throw routeError(501, "COMMERCE_FACTS_STORAGE_UNAVAILABLE", "正式数据库连接暂不可用。", true);
    const runner = await authenticateWebCollectionRunner(controlDb, request);
    const body = await request.json().catch(() => {
      throw routeError(400, "INVALID_REQUEST", "请求内容不是有效的 JSON 对象。");
    });
    const input = normalizeCommerceBatchInput(body);
    await matchingJob(controlDb, runner, input);
    const target = await targetFromWebCollectionJob(controlDb, input.jobId);
    if (!target) throw routeError(409, "COLLECTION_JOB_MISMATCH", "采集任务缺少服务端目标环境。");
    const businessDb = await resolveCollectionBusinessDatabase({ env, controlDb, target });
    const result = await stageCommerceFactChunk(businessDb, input);
    return successResponse(result, id, result.status === "completed" ? 201 : 202);
  } catch (error) {
    return errorResponse(error, id);
  }
}
