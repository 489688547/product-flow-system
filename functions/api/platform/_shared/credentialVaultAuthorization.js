import { canManagePermissions } from "../../../../src/domain/permissions.js";

const OPERATIONS_ACTIONS = new Set(["metadata:read", "credential:create", "credential:replace"]);
const REVEAL_WINDOW_MS = 15 * 60 * 1000;

function authorizationError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function authorizeCredentialAction(session, action, options = {}) {
  if (!session) throw authorizationError("请先使用钉钉登录。", "AUTH_SESSION_REQUIRED", 401);
  if (session.role === "readonly") throw authorizationError("当前身份不能维护加密凭证。", "PERMISSION_WRITE_DENIED", 403);
  const admin = canManagePermissions(session);
  const operations = String(session.department || "").split(/\s*(?:\/|、|,|，)\s*/).includes("运营部");
  if (!admin && !(options.scopeType === "connector" && operations && OPERATIONS_ACTIONS.has(action))) {
    throw authorizationError("当前身份没有该凭证操作权限。", action === "credential:reveal" ? "CREDENTIAL_REVEAL_DENIED" : "PERMISSION_WRITE_DENIED", 403);
  }
  if (action === "credential:reveal") {
    const createdAt = Date.parse(session.createdAt || "");
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > REVEAL_WINDOW_MS) {
      throw authorizationError("查看明文需要重新登录。", "CREDENTIAL_REAUTH_REQUIRED", 401);
    }
  }
  return { admin, operations };
}

export const credentialAuthorizationInternals = { REVEAL_WINDOW_MS };
