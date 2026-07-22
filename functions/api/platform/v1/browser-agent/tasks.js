import { authenticateRunner } from "../user-insights/_shared/storage.js";
import { DataConnectionHttpError, errorResponse, jsonResponse, methodNotAllowed, requireD1 } from "../data-connections/_shared/http.js";
import { createBrowserAgentTaskStore } from "./_shared/tasks.js";
import { registeredDataAcquisitionProviders } from "../../../../../src/domain/dataAcquisition.js";

function assertRegisteredScope(runner) {
  const registered = new Set(registeredDataAcquisitionProviders().map(item => item.id));
  if (!Array.isArray(runner.allowedScope?.platforms) || !runner.allowedScope.platforms.some(item => registered.has(item))) {
    throw new DataConnectionHttpError(403, "BROWSER_AGENT_SCOPE_DENIED", "当前采集设备未获已登记平台的数据采集权限。");
  }
}

export async function handleBrowserAgentTasksRequest(context, dependencies = {}) {
  try {
    if (context.request.method !== "GET") return methodNotAllowed("GET");
    const db = dependencies.store ? context.env.PRODUCT_FLOW_DB : requireD1(context.env);
    const runner = await (dependencies.authenticate || authenticateRunner)(db, context.request);
    assertRegisteredScope(runner);
    const store = dependencies.store || createBrowserAgentTaskStore(db, { masterKey: context.env.PLATFORM_CREDENTIAL_MASTER_KEY, runner });
    return jsonResponse({ synced: true, runner: { id: runner.id, name: runner.name }, tasks: await store.claim() });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequest(context) { return handleBrowserAgentTasksRequest(context); }
