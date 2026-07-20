import { authorizeCredentialAction } from "../_shared/credentialVaultAuthorization.js";
import {
  createCredentialEntry,
  credentialDatabase,
  listCredentialMetadata
} from "../_shared/credentialVaultStorage.js";
import {
  assertCredentialFields,
  credentialContext,
  credentialErrorResponse,
  credentialJsonResponse,
  credentialOptionsResponse,
  credentialRequestBody,
  credentialRequestId
} from "../_shared/credentialVaultHttp.js";

const CREATE_FIELDS = new Set(["scopeType", "scopeId", "category", "name", "schemaVersion", "secretPayload"]);

function storageUnavailable() {
  const error = new Error("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，加密凭证暂不可用。");
  error.code = "CREDENTIAL_STORAGE_UNAVAILABLE";
  error.status = 501;
  return error;
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return credentialOptionsResponse(["GET", "POST"]);
  const requestId = credentialRequestId();
  if (!["GET", "POST"].includes(request.method)) {
    const error = new Error("Method not allowed");
    error.code = "VALIDATION_METHOD_NOT_ALLOWED";
    error.status = 405;
    return credentialErrorResponse(error, requestId);
  }
  try {
    const session = data.session;
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get("scopeType") || "";
    const scopeType = requestedScope || (String(session?.department || "").includes("运营部") ? "connector" : "");
    authorizeCredentialAction(session, request.method === "GET" ? "metadata:read" : "credential:create", { scopeType: scopeType || "connector" });
    const db = credentialDatabase(env);
    if (!db) throw storageUnavailable();

    if (request.method === "GET") {
      const entries = await listCredentialMetadata(db, { scopeType });
      return credentialJsonResponse({ synced: true, entries });
    }

    const body = await credentialRequestBody(request);
    assertCredentialFields(body, CREATE_FIELDS);
    authorizeCredentialAction(session, "credential:create", { scopeType: body.scopeType });
    const entry = await createCredentialEntry(db, body, credentialContext(session, env, requestId));
    return credentialJsonResponse({ synced: true, entry });
  } catch (error) {
    return credentialErrorResponse(error, requestId);
  }
}
