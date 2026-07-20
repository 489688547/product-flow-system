import { authorizeCredentialAction } from "../../_shared/credentialVaultAuthorization.js";
import {
  archiveCredentialEntry,
  credentialDatabase,
  listCredentialMetadata,
  replaceCredentialEntry
} from "../../_shared/credentialVaultStorage.js";
import {
  assertCredentialFields,
  credentialContext,
  credentialErrorResponse,
  credentialJsonResponse,
  credentialOptionsResponse,
  credentialRequestBody,
  credentialRequestId
} from "../../_shared/credentialVaultHttp.js";

const REPLACE_FIELDS = new Set(["expectedVersion", "name", "schemaVersion", "secretPayload"]);
const ARCHIVE_FIELDS = new Set(["expectedVersion", "action"]);

function routeError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return credentialOptionsResponse(["PUT"]);
  const requestId = credentialRequestId();
  if (request.method !== "PUT") return credentialErrorResponse(routeError("Method not allowed", "VALIDATION_METHOD_NOT_ALLOWED", 405), requestId);
  try {
    if (!data.session) throw routeError("请先使用钉钉登录。", "AUTH_SESSION_REQUIRED", 401);
    const db = credentialDatabase(env);
    if (!db) throw routeError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，加密凭证暂不可用。", "CREDENTIAL_STORAGE_UNAVAILABLE", 501);
    const id = String(params.id || "").trim();
    const entry = (await listCredentialMetadata(db, {})).find(item => item.id === id);
    if (!entry) throw routeError("凭证条目不存在。", "CREDENTIAL_ENTRY_NOT_FOUND", 404);
    const body = await credentialRequestBody(request);
    if (body.action === "archive") {
      assertCredentialFields(body, ARCHIVE_FIELDS);
      authorizeCredentialAction(data.session, "credential:archive", { scopeType: entry.scopeType });
      const archived = await archiveCredentialEntry(db, id, body, credentialContext(data.session, env, requestId));
      return credentialJsonResponse({ synced: true, entry: archived });
    }
    assertCredentialFields(body, REPLACE_FIELDS);
    authorizeCredentialAction(data.session, "credential:replace", { scopeType: entry.scopeType });
    const replaced = await replaceCredentialEntry(db, id, body, credentialContext(data.session, env, requestId));
    return credentialJsonResponse({ synced: true, entry: replaced });
  } catch (error) {
    return credentialErrorResponse(error, requestId);
  }
}
