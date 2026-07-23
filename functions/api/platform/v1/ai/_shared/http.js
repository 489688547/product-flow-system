import { jsonResponse } from "../../../../dingtalk/_shared/dingtalk.js";
import { dataCenterDatabase, readDataCenterState } from "../../../../data-center/_shared/storage.js";
import { resolveProviderConfig } from "./provider-config.js";
import { platformEnv } from "../../../_shared/platformCredentials.js";
import { controlDatabase, requestBusinessDatabase } from "../../../_shared/dataEnvironment.js";

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

export function aiError(message, status, code, retryable = false, id = requestId()) {
  return jsonResponse({ message, error: { code, message, requestId: id, retryable } }, status);
}

export function aiDatabase(env = {}) {
  return dataCenterDatabase(env);
}

function selectedEnvironment(data = {}) {
  return data.dataEnvironment?.id === "display" ? "display" : "production";
}

export async function loadAiConfiguration(env = {}, data = {}) {
  let controlDb;
  try {
    controlDb = data.controlDb || controlDatabase(env);
  } catch {
    throw Object.assign(new Error("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。"), {
      code: "AI_STORAGE_UNAVAILABLE",
      status: 501,
      retryable: false
    });
  }
  const businessDb = requestBusinessDatabase({ env, data }) || controlDb;
  const stored = await readDataCenterState(controlDb);
  const providerEnvironment = await platformEnv(env, "lingsuan-ai-gateway");
  const provider = resolveProviderConfig({ env: providerEnvironment, storedProvider: stored.state.aiProviders[0] });
  return {
    db: controlDb,
    controlDb,
    businessDb,
    dataEnvironment: selectedEnvironment(data),
    stored,
    provider
  };
}
