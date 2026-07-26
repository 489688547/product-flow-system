import { idempotencyKey, jsonResponse, readJson, workflowError } from "./_shared/http.js";
import { runSupplyWorkflowRoute } from "./_shared/route.js";
import {
  createSupplyWorkflowEntity,
  listSupplyWorkflowEntities
} from "./_shared/storage.js";

function validId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(id)) {
    throw workflowError(400, "SUPPLY_WORKFLOW_INPUT_INVALID", "供应链工作流 ID 无效。");
  }
  return id;
}

export async function onRequest(context) {
  const action = context.request.method === "GET" ? "read" : "write";
  return runSupplyWorkflowRoute(context, {
    action,
    methods: ["GET", "POST"],
    handler: async ({ request, db, actor, resource, requestId }) => {
      if (request.method === "GET") {
        const url = new URL(request.url);
        const cursor = Number(url.searchParams.get("cursor") || 0);
        const status = String(url.searchParams.get("status") || "");
        if (!Number.isInteger(cursor) || cursor < 0 || status.length > 80) {
          throw workflowError(400, "SUPPLY_WORKFLOW_QUERY_INVALID", "供应链工作流筛选无效。");
        }
        const result = await listSupplyWorkflowEntities(db, resource, { status, cursor });
        const versions = [...new Set(result.items.map(item => item.version))].sort((left, right) => left - right);
        return jsonResponse({
          synced: true,
          items: result.items,
          nextCursor: result.nextCursor,
          scope: { resource, department: actor.department || null },
          coverage: {
            status: result.items.length ? "complete" : "empty",
            asOf: result.items.map(item => item.updatedAt).filter(Boolean).sort().at(-1) || null,
            sourceVersions: versions
          },
          meta: { requestId }
        });
      }
      const body = await readJson(request);
      const id = validId(body.id);
      const result = await createSupplyWorkflowEntity(db, {
        resource,
        id,
        fields: body.fields || {},
        idempotencyKey: idempotencyKey(request),
        actor
      });
      return jsonResponse({ synced: true, ...result }, result.idempotentReplay ? 200 : 201);
    }
  });
}
