import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const INTEGRATION_REGISTRY_PATH = "docs/platform/integration-registry.json";
export const INTEGRATION_STATUSES = ["connected", "integrating", "planned", "retired"];

const TOP_LEVEL_FIELDS = new Set(["schemaVersion", "updatedAt", "platforms"]);
const PLATFORM_FIELDS = new Set([
  "id",
  "name",
  "status",
  "summary",
  "capabilities",
  "businessQuestions",
  "keywords",
  "codePaths",
  "envVars",
  "domains",
  "apiRoutes",
  "publicDocs",
  "evidence",
  "relations"
]);
const DOC_FIELDS = new Set(["label", "url"]);
const RELATION_FIELDS = new Set(["platformId", "type", "description"]);
const SECRET_VALUE_PATTERN = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\bsk-[A-Za-z0-9]{12,})/i;

function unknownFields(value, allowed, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${context} 必须是对象`];
  return Object.keys(value)
    .filter(key => !allowed.has(key))
    .map(key => `${context} 包含不允许的公开字段：${key}`);
}

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.trim());
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function matchesPath(pattern, path) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

export function loadIntegrationRegistry(rootDir = process.cwd()) {
  return JSON.parse(readFileSync(resolve(rootDir, INTEGRATION_REGISTRY_PATH), "utf8"));
}

export function validateIntegrationRegistry(registry) {
  const errors = unknownFields(registry, TOP_LEVEL_FIELDS, "注册表");
  if (registry?.schemaVersion !== 1) errors.push("注册表 schemaVersion 必须是 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registry?.updatedAt || "")) errors.push("注册表 updatedAt 必须是 YYYY-MM-DD");
  if (!Array.isArray(registry?.platforms) || !registry.platforms.length) {
    errors.push("注册表 platforms 必须是非空数组");
    return errors;
  }

  const ids = new Set();
  for (const [index, platform] of registry.platforms.entries()) {
    const context = `platforms[${index}]`;
    errors.push(...unknownFields(platform, PLATFORM_FIELDS, context));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(platform?.id || "")) errors.push(`${context}.id 格式无效`);
    if (ids.has(platform?.id)) errors.push(`平台 ID 重复：${platform.id}`);
    ids.add(platform?.id);
    if (!platform?.name?.trim()) errors.push(`${context}.name 不能为空`);
    if (!INTEGRATION_STATUSES.includes(platform?.status)) errors.push(`${context}.status 无效`);
    if (!platform?.summary?.trim()) errors.push(`${context}.summary 不能为空`);

    for (const field of ["capabilities", "businessQuestions", "keywords", "codePaths", "envVars", "domains", "apiRoutes", "evidence"]) {
      if (!nonEmptyStrings(platform?.[field]) && !(Array.isArray(platform?.[field]) && platform[field].length === 0)) {
        errors.push(`${context}.${field} 必须是字符串数组`);
      }
    }
    if (platform?.status === "integrating" && !platform?.evidence?.length) {
      errors.push(`${context} status=integrating 时 evidence 不能为空`);
    }

    if (!Array.isArray(platform?.publicDocs)) errors.push(`${context}.publicDocs 必须是数组`);
    else platform.publicDocs.forEach((doc, docIndex) => {
      const docContext = `${context}.publicDocs[${docIndex}]`;
      errors.push(...unknownFields(doc, DOC_FIELDS, docContext));
      if (!doc?.label?.trim()) errors.push(`${docContext}.label 不能为空`);
      if (!safeUrl(doc?.url)) errors.push(`${docContext}.url 必须是 HTTPS URL`);
    });

    if (!Array.isArray(platform?.relations)) errors.push(`${context}.relations 必须是数组`);
    else platform.relations.forEach((relation, relationIndex) => {
      const relationContext = `${context}.relations[${relationIndex}]`;
      errors.push(...unknownFields(relation, RELATION_FIELDS, relationContext));
      if (!relation?.platformId?.trim()) errors.push(`${relationContext}.platformId 不能为空`);
      if (!relation?.type?.trim()) errors.push(`${relationContext}.type 不能为空`);
      if (!relation?.description?.trim()) errors.push(`${relationContext}.description 不能为空`);
    });

    if (SECRET_VALUE_PATTERN.test(JSON.stringify(platform))) errors.push(`${context} 疑似包含敏感值`);
  }

  for (const platform of registry.platforms) {
    for (const relation of platform.relations || []) {
      if (!ids.has(relation.platformId)) errors.push(`${platform.id} 关系指向未知平台：${relation.platformId}`);
    }
  }

  return errors;
}

function addEvidence(matches, platform, evidence) {
  const current = matches.get(platform.id) || { platform, evidence: [], required: false };
  if (!current.evidence.some(item => item.type === evidence.type && item.value === evidence.value)) {
    current.evidence.push(evidence);
  }
  if (["path", "domain", "env", "api-route"].includes(evidence.type)) current.required = true;
  matches.set(platform.id, current);
}

export function matchIntegrationPlatforms(registry, { text = "", paths = [], content = "", expandRelated = true } = {}) {
  const matches = new Map();
  const normalizedText = String(text).toLocaleLowerCase("zh-CN");
  const normalizedContent = String(content).toLocaleLowerCase("zh-CN");

  for (const platform of registry.platforms) {
    for (const keyword of platform.keywords) {
      if (normalizedText.includes(keyword.toLocaleLowerCase("zh-CN"))) {
        addEvidence(matches, platform, { type: "keyword", value: keyword });
      }
    }
    for (const path of paths) {
      for (const pattern of platform.codePaths) {
        if (matchesPath(pattern, path)) addEvidence(matches, platform, { type: "path", value: path, pattern });
      }
    }
    for (const domain of platform.domains) {
      if (normalizedContent.includes(domain.toLocaleLowerCase("zh-CN"))) {
        addEvidence(matches, platform, { type: "domain", value: domain });
      }
    }
    for (const envVar of platform.envVars) {
      if (normalizedContent.includes(envVar.toLocaleLowerCase("zh-CN"))) {
        addEvidence(matches, platform, { type: "env", value: envVar });
      }
    }
    for (const apiRoute of platform.apiRoutes) {
      if (normalizedContent.includes(apiRoute.toLocaleLowerCase("zh-CN"))) {
        addEvidence(matches, platform, { type: "api-route", value: apiRoute });
      }
    }
  }

  const direct = [...matches.values()]
    .map(match => ({ id: match.platform.id, ...match.platform, evidence: match.evidence, required: match.required }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const directIds = new Set(direct.map(match => match.id));
  const relatedIds = new Set();
  if (expandRelated) {
    for (const match of direct) {
      for (const relation of match.relations) {
        if (!directIds.has(relation.platformId)) relatedIds.add(relation.platformId);
      }
    }
  }
  const related = registry.platforms
    .filter(platform => relatedIds.has(platform.id))
    .map(platform => ({ ...platform, required: false }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return { direct, related, ambiguous: direct.length > 1 };
}

export function parseIntegrationImpact(body = "") {
  const impactMatch = String(body).match(/^Integration-Impact:\s*(.+?)\s*$/im);
  const reasonMatch = String(body).match(/^Integration-Impact-Reason:\s*(.+?)\s*$/im);
  const declaredIds = impactMatch
    ? [...new Set(impactMatch[1].split(",").map(value => value.trim().toLowerCase()).filter(Boolean))]
    : [];
  return { declaredIds, reason: reasonMatch?.[1]?.trim() || "" };
}

export function checkIntegrationImpact(registry, { paths = [], content = "", body = "" } = {}) {
  const routing = matchIntegrationPlatforms(registry, { paths, content, expandRelated: false });
  const requiredIds = routing.direct.filter(match => match.required).map(match => match.id);
  const { declaredIds, reason } = parseIntegrationImpact(body);
  const knownIds = new Set(registry.platforms.map(platform => platform.id));
  const errors = [];

  if (!declaredIds.length && requiredIds.length) {
    errors.push(`缺少 Integration-Impact 声明；变更路径命中：${requiredIds.join(", ")}`);
  }
  if (declaredIds.length && !reason) errors.push("缺少 Integration-Impact-Reason 或原因为空");

  const unknownIds = declaredIds.filter(id => id !== "none" && !knownIds.has(id));
  if (unknownIds.length) errors.push(`Integration-Impact 包含未知平台：${unknownIds.join(", ")}`);

  if (declaredIds.includes("none") && declaredIds.length > 1) {
    errors.push("Integration-Impact 的 none 不能与平台 ID 同时声明");
  }

  const missingIds = requiredIds.filter(id => !declaredIds.includes(id));
  if (missingIds.length) errors.push(`Integration-Impact 漏报路径命中的平台：${missingIds.join(", ")}`);

  return { errors, requiredIds, declaredIds, reason, routing };
}
