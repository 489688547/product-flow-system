import { authorizeCredentialAction } from "../../../_shared/credentialVaultAuthorization.js";
import {
  assertCredentialRevealRateLimit,
  credentialDatabase,
  listCredentialMetadata,
  revealCredentialEntry
} from "../../../_shared/credentialVaultStorage.js";
import {
  assertCredentialFields,
  credentialContext,
  credentialErrorResponse,
  credentialJsonResponse,
  credentialOptionsResponse,
  credentialRequestBody,
  credentialRequestId
} from "../../../_shared/credentialVaultHttp.js";

const REVEAL_FIELDS = new Set(["purpose", "confirmation"]);

function revealError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return credentialOptionsResponse(["POST"]);
  const requestId = credentialRequestId();
  if (request.method !== "POST") return credentialErrorResponse(revealError("Method not allowed", "VALIDATION_METHOD_NOT_ALLOWED", 405), requestId);
  try {
    if (!data.session) throw revealError("请先使用钉钉登录。", "AUTH_SESSION_REQUIRED", 401);
    const db = credentialDatabase(env);
    if (!db) throw revealError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，加密凭证暂不可用。", "CREDENTIAL_STORAGE_UNAVAILABLE", 501);
    const id = String(params.id || "").trim();
    const entry = (await listCredentialMetadata(db, {})).find(item => item.id === id);
    if (!entry) throw revealError("凭证条目不存在。", "CREDENTIAL_ENTRY_NOT_FOUND", 404);
    authorizeCredentialAction(data.session, "credential:reveal", { scopeType: entry.scopeType });
    const body = await credentialRequestBody(request);
    assertCredentialFields(body, REVEAL_FIELDS);
    const purpose = String(body.purpose || "").trim();
    if (!purpose || purpose.length > 200) throw revealError("请填写本次查看用途。", "CREDENTIAL_ENTRY_INVALID", 400);
    if (body.confirmation !== "查看加密凭证") throw revealError("确认短语不正确。", "CREDENTIAL_ENTRY_INVALID", 400);
    await assertCredentialRevealRateLimit(db, id);
    const revealed = await revealCredentialEntry(db, id, credentialContext(data.session, env, requestId, { purpose }));
    return credentialJsonResponse({ synced: true, ...revealed, revealedAt: new Date().toISOString() }, 200, {
      "cache-control": "no-store, private",
      pragma: "no-cache"
    });
  } catch (error) {
    return credentialErrorResponse(error, requestId);
  }
}
