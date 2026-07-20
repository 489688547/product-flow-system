import { requireDataConnectionActor, requireDataConnectionManager, requireFreshSession } from "../_shared/access.js";
import { errorResponse, methodNotAllowed, revealResponse, requireD1 } from "../_shared/http.js";
import { createDataConnectionStore } from "../_shared/storage.js";

export async function handleDataConnectionRevealRequest(context, dependencies = {}) {
  try {
    if (context.request.method !== "POST") return methodNotAllowed("POST");
    const actor = requireDataConnectionActor(context.data);
    requireDataConnectionManager(actor);
    requireFreshSession(actor, dependencies.now || new Date());
    const store = dependencies.store || createDataConnectionStore(requireD1(context.env), {
      masterKey: context.env.PLATFORM_CREDENTIAL_MASTER_KEY,
      actor,
      requestId: context.request.headers.get("cf-ray") || globalThis.crypto?.randomUUID?.() || ""
    });
    return revealResponse({ synced: true, ...(await store.reveal(String(context.params?.id || ""))) });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequest(context) {
  return handleDataConnectionRevealRequest(context);
}
