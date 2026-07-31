import {
  authorizeCollectorTemplateWrite,
  authorizeWebCollectionTrigger,
  authorizeWebCollectionView
} from "./authorization.js";
import { errorResponse, requestId, routeError } from "./http.js";
import { webCollectionDatabase } from "./storage.js";

const DOMAIN_STATUS = Object.freeze({
  COLLECTOR_TEMPLATE_ACTION_DENIED: 403,
  COLLECTOR_TEMPLATE_ORIGIN_NOT_ALLOWED: 400,
  COLLECTOR_TEMPLATE_PROVIDER_NOT_REGISTERED: 400,
  COLLECTOR_TEMPLATE_STEP_NOT_REGISTERED: 400,
  COLLECTOR_TEMPLATE_SENSITIVE_ACCESS: 400,
  COLLECTOR_TEMPLATE_FIELD_NOT_ALLOWED: 400,
  COLLECTOR_TEMPLATE_INVALID: 400,
  COLLECTOR_RUN_QUALITY_INVALID: 400
});

export function normalizeCollectorRouteError(error) {
  if (error?.status) return error;
  const status = DOMAIN_STATUS[error?.code];
  return status
    ? routeError(status, error.code, error.message)
    : error;
}

export async function runCollectorSessionRoute(context, {
  permission = "view",
  methods,
  handler
}) {
  const id = requestId();
  try {
    if (context.request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { allow: [...methods, "OPTIONS"].join(", ") } });
    }
    if (!methods.includes(context.request.method)) {
      throw routeError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    }
    const authorize = permission === "write"
      ? authorizeCollectorTemplateWrite
      : permission === "trigger"
        ? authorizeWebCollectionTrigger
        : authorizeWebCollectionView;
    const actor = authorize(context.data?.session);
    const db = webCollectionDatabase(context.env);
    if (!db) throw routeError(501, "WEB_COLLECTION_STORAGE_UNAVAILABLE", "网页采集控制数据库暂不可用。", true);
    return await handler({ ...context, db, actor, requestId: id });
  } catch (error) {
    return errorResponse(normalizeCollectorRouteError(error), id);
  }
}
