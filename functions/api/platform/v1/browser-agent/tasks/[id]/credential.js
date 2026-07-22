import { errorResponse, methodNotAllowed, revealResponse, requireD1 } from "../../../data-connections/_shared/http.js";
import { createBrowserAgentTaskStore } from "../../_shared/tasks.js";

function bearer(request) {
  const value = String(request.headers.get("authorization") || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function handleBrowserAgentCredentialRequest(context, dependencies = {}) {
  try {
    if (context.request.method !== "POST") return methodNotAllowed("POST");
    const grant = bearer(context.request);
    const store = dependencies.store || createBrowserAgentTaskStore(requireD1(context.env), { masterKey: context.env.PLATFORM_CREDENTIAL_MASTER_KEY, runner: {} });
    return revealResponse({ synced: true, ...(await store.credential(String(context.params?.id || ""), grant)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequest(context) { return handleBrowserAgentCredentialRequest(context); }
