import { canAccessCompanyPlatform } from "../../../../../../src/domain/permissions.js";
import { normalizeAiDataPolicies } from "../../../../../../src/domain/aiAssistant.js";

function sessionDepartments(session = {}) {
  return [...new Set([
    session.department,
    session.departmentName,
    ...(Array.isArray(session.departments) ? session.departments : []),
    ...(Array.isArray(session.departmentNames) ? session.departmentNames : [])
  ].flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(value => value.trim().replaceAll("产品团队", "产品部"))
    .filter(Boolean))];
}

function matchesTitle(title, allowed = []) {
  return allowed.some(item => title === item || title.includes(item));
}

export function resolveAiDataAccess({ session = {}, policies = [], providerId = "lingsuan-responses" } = {}) {
  const executive = canAccessCompanyPlatform(session);
  const departments = sessionDepartments(session);
  const title = String(session.title || "").trim();
  const allowed = [];
  const blocked = [];
  for (const policy of normalizeAiDataPolicies(policies)) {
    const canView = executive
      || policy.viewDepartments.some(item => departments.includes(item.replaceAll("产品团队", "产品部")))
      || matchesTitle(title, policy.viewTitles);
    if (!canView) {
      blocked.push({ domainId: policy.domainId, reason: "user_permission" });
    } else if (policy.providerTransfer?.[providerId] !== "allowed") {
      blocked.push({ domainId: policy.domainId, reason: "provider_transfer" });
    } else {
      allowed.push(policy.domainId);
    }
  }
  return {
    allowed,
    blocked,
    scope: {
      executive,
      departments,
      title
    }
  };
}
