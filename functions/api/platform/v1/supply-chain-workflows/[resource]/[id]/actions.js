import { idempotencyKey, jsonResponse, readJson, workflowError } from "../../_shared/http.js";
import { runSupplyWorkflowRoute } from "../../_shared/route.js";
import { applySupplyWorkflowAction } from "../../_shared/storage.js";

export async function onRequest(context) {
  return runSupplyWorkflowRoute(context, {
    action: "write",
    methods: ["POST"],
    handler: async ({ request, db, actor, resource }) => {
      const id = String(context.params?.id || "").trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(id)) {
        throw workflowError(400, "SUPPLY_WORKFLOW_INPUT_INVALID", "供应链工作流 ID 无效。");
      }
      const body = await readJson(request);
      const expectedVersion = Number(body.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw workflowError(400, "SUPPLY_WORKFLOW_INPUT_INVALID", "供应链工作流版本无效。");
      }
      const action = String(body.action || "").trim();
      const result = await applySupplyWorkflowAction(db, {
        resource,
        id,
        action,
        expectedVersion,
        fields: body.fields || {},
        reason: body.reason,
        idempotencyKey: idempotencyKey(request),
        actor
      });
      return jsonResponse({ synced: true, ...result });
    }
  });
}
