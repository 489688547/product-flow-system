import { normalizeRecognizedShops } from "../../../../../../../src/domain/dataConnections.js";
import { authenticateRunner } from "../../../user-insights/_shared/storage.js";
import { DataConnectionHttpError, errorResponse, jsonResponse, methodNotAllowed, readJson, requireD1 } from "../../../data-connections/_shared/http.js";
import { createBrowserAgentTaskStore } from "../../_shared/tasks.js";
import { registeredDataAcquisitionProviders } from "../../../../../../../src/domain/dataAcquisition.js";

const SENSITIVE_KEY = /(?:password|passwd|cookie|token|secret|authorization|verificationcode|smscode|rawhtml|screenshot|session)/i;
const STATUSES = new Set(["waiting_human_verification", "recognizing", "succeeded", "failed"]);

function containsSensitive(value) {
  if (Array.isArray(value)) return value.some(containsSensitive);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => SENSITIVE_KEY.test(key) || containsSensitive(nested));
}

export async function handleBrowserAgentResultRequest(context, dependencies = {}) {
  try {
    if (context.request.method !== "POST") return methodNotAllowed("POST");
    const db = dependencies.store ? context.env.PRODUCT_FLOW_DB : requireD1(context.env);
    const runner = await (dependencies.authenticate || authenticateRunner)(db, context.request);
    const registered = new Set(registeredDataAcquisitionProviders().map(item => item.id));
    if (!runner.allowedScope?.platforms?.some(item => registered.has(item))) {
      throw new DataConnectionHttpError(403, "BROWSER_AGENT_SCOPE_DENIED", "当前采集设备未获已登记平台的数据采集权限。");
    }
    const body = await readJson(context.request);
    if (containsSensitive(body)) throw new DataConnectionHttpError(400, "BROWSER_AGENT_RESULT_SENSITIVE", "任务结果不能包含登录凭证、验证码或页面内容。");
    if (!STATUSES.has(body.status)) throw new DataConnectionHttpError(400, "BROWSER_AGENT_RESULT_INVALID", "任务结果状态无效。");
    const input = {
      status: body.status,
      shops: normalizeRecognizedShops(body.shops),
      message: String(body.message || "").slice(0, 300),
      errorCode: String(body.errorCode || "").slice(0, 80)
    };
    const store = dependencies.store || createBrowserAgentTaskStore(db, { masterKey: context.env.PLATFORM_CREDENTIAL_MASTER_KEY, runner });
    return jsonResponse({ synced: true, task: await store.result(String(context.params?.id || ""), input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequest(context) { return handleBrowserAgentResultRequest(context); }
