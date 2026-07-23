import { normalizeErpCollectionPayload } from "../../../../../src/domain/kuaimaiErpCollection.js";
import {
  collectionIdempotencyKey,
  collectionTargetFromRequestData,
  resolveCollectionBusinessDatabase,
  targetFromWebCollectionJob
} from "../../_shared/collectionTarget.js";
import { authorizeErpCollection } from "./_shared/authorization.js";
import { errorResponse, requestId, routeError, successResponse } from "./_shared/http.js";
import { authenticateErpCollector, erpCollectionDatabase, ingestErpCollection } from "./_shared/storage.js";

export async function onRequest({ request, env, data = {} }) {
  const id = requestId();
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
    if (request.method !== "POST") throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    const controlDb = erpCollectionDatabase(env);
    if (!controlDb) throw routeError(501, "ERP_COLLECTION_STORAGE_UNAVAILABLE", "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", true);
    const actor = data.session ? authorizeErpCollection(data.session) : await authenticateErpCollector(controlDb, request);
    const idempotencyKey = String(request.headers.get("idempotency-key") || "").trim();
    if (!idempotencyKey) throw routeError(400, "ERP_COLLECTION_IDEMPOTENCY_KEY_REQUIRED", "写入操作需要 Idempotency-Key。");
    const body = await request.json().catch(() => {
      throw routeError(400, "VALIDATION_INVALID_JSON", "请求内容不是有效的 JSON 对象。");
    });
    if (body?.targetEnvironment || body?.targetEnvironmentVersion || body?.databaseId || body?.binding) {
      throw routeError(400, "COLLECTION_TARGET_CLIENT_FORBIDDEN", "采集目标只能由服务端账号和任务决定。");
    }
    const normalized = normalizeErpCollectionPayload(body, { idempotencyKey });
    const linkedJobId = String(request.headers.get("x-web-collection-job-id") || "").trim();
    const target = data.session
      ? collectionTargetFromRequestData(data)
      : (await targetFromWebCollectionJob(controlDb, linkedJobId))
        || { environmentId: "production", environmentVersion: 1 };
    normalized.idempotencyKey = collectionIdempotencyKey(normalized.idempotencyKey, target);
    if (normalized.archive && actor.runnerId) normalized.archive.runnerId = actor.runnerId;
    const businessDb = data.businessDb || await resolveCollectionBusinessDatabase({
      env,
      controlDb,
      target
    });
    const result = await ingestErpCollection(controlDb, normalized, {
      ...actor,
      actor: actor.actor || actor.name || actor.userId || "",
      businessDb,
      target
    });
    return successResponse(result, id, result.duplicateFile && result.counts.inserted === 0 && result.counts.updated === 0 ? 200 : 201);
  } catch (error) {
    return errorResponse(error, id);
  }
}
