import { authorizeCredentialAction } from "../../../_shared/credentialVaultAuthorization.js";
import { canManagePlatformConnections } from "../../../../../../src/domain/permissions.js";
import {
  assertPlatformCredentialRevealRateLimit,
  platformCredentialDatabase,
  revealPlatformCredentials
} from "../../../_shared/platformCredentials.js";
import {
  credentialErrorResponse,
  credentialJsonResponse,
  credentialOptionsResponse,
  credentialRequestBody,
  credentialRequestId
} from "../../../_shared/credentialVaultHttp.js";

const REVEAL_FIELDS = new Set(["purpose", "confirmation"]);
const SUPPORTED_PLATFORM_ID = "lingsuan-ai-gateway";
const REVEAL_TTL_MS = 5 * 60 * 1000;

function revealError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

function assertRequestFields(body) {
  const unknown = Object.keys(body).filter(key => !REVEAL_FIELDS.has(key));
  if (unknown.length) throw revealError(`查看请求包含不允许的字段：${unknown.join("、")}。`, "PLATFORM_CREDENTIAL_REVEAL_INVALID", 400);
}

export async function onRequest({ request, env = {}, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return credentialOptionsResponse(["POST"]);
  const requestId = credentialRequestId();
  try {
    if (request.method !== "POST") throw revealError("当前请求方法不受支持。", "VALIDATION_METHOD_NOT_ALLOWED", 405);
    if (!data.session) throw revealError("请先使用钉钉登录。", "AUTH_SESSION_REQUIRED", 401);
    const platformId = String(params.platformId || "").trim();
    if (platformId !== SUPPORTED_PLATFORM_ID) {
      throw revealError("当前平台不支持查看已保存内容。", "PLATFORM_CREDENTIAL_REVEAL_UNAVAILABLE", 404);
    }
    if (!canManagePlatformConnections(data.session)) {
      throw revealError("当前身份没有凭据查看权限。", "CREDENTIAL_REVEAL_DENIED", 403);
    }
    authorizeCredentialAction(data.session, "credential:reveal", { scopeType: "company" });
    const body = await credentialRequestBody(request);
    assertRequestFields(body);
    const purpose = String(body.purpose || "").trim();
    if (!purpose || purpose.length > 200) throw revealError("请填写本次查看用途。", "PLATFORM_CREDENTIAL_REVEAL_INVALID", 400);
    if (body.confirmation !== "查看灵算凭据") throw revealError("确认短语不正确。", "PLATFORM_CREDENTIAL_REVEAL_INVALID", 400);
    const db = platformCredentialDatabase(env);
    if (!db) throw revealError("平台连接存储暂不可用。", "PLATFORM_CONNECTION_STORAGE_UNAVAILABLE", 501);
    await assertPlatformCredentialRevealRateLimit(db, platformId);
    const revealed = await revealPlatformCredentials(db, platformId, {
      masterKey: env.PLATFORM_CREDENTIAL_MASTER_KEY,
      actorId: data.session.userId || data.session.unionId || "unknown",
      actorName: data.session.name || "未知管理员",
      purpose,
      requestId
    });
    const revealedAt = new Date();
    return credentialJsonResponse({
      synced: true,
      ...revealed,
      revealedAt: revealedAt.toISOString(),
      expiresAt: new Date(revealedAt.getTime() + REVEAL_TTL_MS).toISOString()
    }, 200, {
      "cache-control": "private, no-store",
      pragma: "no-cache"
    });
  } catch (error) {
    return credentialErrorResponse(error, requestId);
  }
}

export const platformCredentialRevealInternals = { REVEAL_TTL_MS, SUPPORTED_PLATFORM_ID };
