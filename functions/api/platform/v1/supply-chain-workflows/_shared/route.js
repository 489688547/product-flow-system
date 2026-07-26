import { assertSupplyChainWorkflowResource } from "../../../../../../src/domain/supplyChainWorkflows.js";
import { authorizeSupplyWorkflow } from "./authorization.js";
import { errorResponse, requestId, workflowError } from "./http.js";
import { ensureSupplyWorkflowTables, supplyWorkflowDatabase } from "./storage.js";

export async function runSupplyWorkflowRoute(context, {
  action = "read",
  methods = ["GET"],
  handler
}) {
  const id = requestId();
  try {
    if (context.request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { allow: "GET, POST, OPTIONS" } });
    }
    if (!methods.includes(context.request.method)) {
      throw workflowError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed");
    }
    let resource;
    try {
      resource = assertSupplyChainWorkflowResource(context.params?.resource);
    } catch (error) {
      throw workflowError(400, error.code || "SUPPLY_WORKFLOW_RESOURCE_INVALID", error.message);
    }
    const actor = authorizeSupplyWorkflow(context.data?.session, resource, action);
    const db = supplyWorkflowDatabase(context.env, context.data);
    if (!db) throw workflowError(501, "SUPPLY_WORKFLOW_STORAGE_UNAVAILABLE", "供应链工作流数据库暂不可用。", true);
    await ensureSupplyWorkflowTables(db);
    return await handler({ ...context, db, actor, resource, requestId: id });
  } catch (error) {
    if (!error.status && /^SUPPLY_WORKFLOW_/.test(String(error.code || ""))) {
      return errorResponse(workflowError(400, error.code, error.message), id);
    }
    return errorResponse(error, id);
  }
}
