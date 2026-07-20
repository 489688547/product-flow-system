const SENSITIVE_KEY = /(?:password|passwd|cookie|token|secret|authorization|verificationcode|smscode|session|rawhtml|screenshot)/i;
const VALID_DIMENSIONS = new Set(["audience", "product", "video", "live"]);
const VALID_TABS = new Set(["audience", "competitors", "rules"]);
const VALID_VIEW_TYPES = new Set(["shop", "product"]);
const VALID_COMPETITOR_TRANSITIONS = {
  candidate: new Set(["core", "rejected", "disabled"]),
  core: new Set(["disabled"]),
  rejected: new Set(["candidate", "disabled"]),
  disabled: new Set(["candidate", "core"])
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, number(value)));
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .map(([key, nested]) => [key, sanitize(nested)]));
}

function hasMissingMetric(metrics = {}) {
  return Object.values(metrics).some(value => value === null || value === undefined || value === "");
}

export function createDefaultUserInsightsState() {
  return {
    version: "user-insights-v1",
    advisoryOnly: true,
    viewType: "shop",
    activeTab: "audience",
    platform: "",
    shopId: "",
    productId: "",
    skuId: "",
    categoryId: "",
    platforms: [],
    categoryMappings: [],
    snapshots: [],
    entities: [],
    ruleSets: [],
    ruleHistory: [],
    competitors: [],
    suggestions: [],
    syncRuns: [],
    updatedAt: ""
  };
}

export function normalizeInsightScope(input = {}) {
  return {
    viewType: VALID_VIEW_TYPES.has(input.viewType) ? input.viewType : "shop",
    platform: String(input.platform || "").trim(),
    shopId: String(input.shopId || "").trim(),
    productId: String(input.productId || "").trim(),
    skuId: String(input.skuId || "").trim(),
    categoryId: String(input.categoryId || "").trim(),
    from: String(input.from || "").trim(),
    to: String(input.to || "").trim()
  };
}

export function normalizeUserInsightsState(input = {}) {
  const base = createDefaultUserInsightsState();
  const safe = sanitize(input);
  return {
    ...base,
    ...safe,
    advisoryOnly: true,
    viewType: VALID_VIEW_TYPES.has(safe.viewType) ? safe.viewType : base.viewType,
    activeTab: VALID_TABS.has(safe.activeTab) ? safe.activeTab : base.activeTab,
    platforms: Array.isArray(safe.platforms) ? safe.platforms : [],
    categoryMappings: Array.isArray(safe.categoryMappings) ? safe.categoryMappings : [],
    snapshots: Array.isArray(safe.snapshots) ? safe.snapshots.map(normalizeMarketSnapshot) : [],
    entities: Array.isArray(safe.entities) ? safe.entities.map(sanitize) : [],
    ruleSets: Array.isArray(safe.ruleSets) ? safe.ruleSets.map(sanitize) : [],
    ruleHistory: Array.isArray(safe.ruleHistory) ? safe.ruleHistory.map(sanitize) : [],
    competitors: Array.isArray(safe.competitors) ? safe.competitors.map(sanitize) : [],
    suggestions: Array.isArray(safe.suggestions) ? safe.suggestions.map(item => ({ ...sanitize(item), advisoryOnly: true })) : [],
    syncRuns: Array.isArray(safe.syncRuns) ? safe.syncRuns.map(sanitize) : []
  };
}

export function confirmCategoryMapping(mapping = {}, { name, department, now = new Date().toISOString() } = {}) {
  if (!mapping.id || !mapping.platform || !mapping.categoryId) throw new Error("类目映射信息不完整。");
  if (!name || !department) throw new Error("需要由产品或运营负责人确认类目。");
  return sanitize({
    ...mapping,
    status: "confirmed",
    confirmedBy: name,
    confirmedDepartment: department,
    confirmedAt: now,
    version: Math.max(1, number(mapping.version) + 1)
  });
}

export function copyInsightRuleSet(source = {}, options = {}) {
  if (!source.id || !options.id || !options.consumerAppId || !options.ownerDepartment) {
    throw new Error("复制规则需要来源、目标 App 和负责部门。");
  }
  return sanitize({
    ...source,
    id: options.id,
    consumerAppId: options.consumerAppId,
    ownerDepartment: options.ownerDepartment,
    sourceRuleId: source.id,
    sourceRuleVersion: number(source.version, 1),
    status: "draft",
    version: 1,
    createdBy: options.actor || "",
    createdAt: options.now || new Date().toISOString(),
    updatedAt: options.now || new Date().toISOString()
  });
}

export function transitionCompetitorCandidate(candidate = {}, nextStatus, options = {}) {
  const currentStatus = candidate.status || "candidate";
  if (!VALID_COMPETITOR_TRANSITIONS[currentStatus]?.has(nextStatus)) throw new Error("竞品状态转换无效。");
  if (["core", "rejected", "disabled"].includes(nextStatus) && !String(options.reason || "").trim()) {
    throw new Error("请填写竞品确认原因。");
  }
  const now = options.now || new Date().toISOString();
  return sanitize({
    ...candidate,
    status: nextStatus,
    confirmedBy: options.actor || "",
    confirmedDepartment: options.department || "",
    confirmationReason: String(options.reason || "").trim(),
    confirmedAt: now,
    updatedAt: now
  });
}

export function comparableMetricSummary(records = [], comparableMetrics = []) {
  const result = {};
  for (const metric of comparableMetrics) {
    const byPlatform = Object.fromEntries(records
      .filter(record => Number.isFinite(Number(record?.metrics?.[metric])))
      .map(record => [String(record.platform || "未知平台"), Number(record.metrics[metric])]));
    if (!Object.keys(byPlatform).length) continue;
    result[metric] = { byPlatform };
    if (/Count$|Volume$|Amount$|Sales$|Gmv$/i.test(metric)) {
      result[metric].total = Object.values(byPlatform).reduce((sum, value) => sum + value, 0);
      result[metric] = { total: result[metric].total, byPlatform };
    }
  }
  return result;
}

export function buildInsightSuggestion(input = {}) {
  const coverage = clamp(input.coverage);
  const freshness = input.freshness || "fresh";
  const limitations = [...(Array.isArray(input.limitations) ? input.limitations : [])];
  const requestedConfidence = input.requestedConfidence || input.confidence;
  let confidence = ["low", "medium", "high"].includes(requestedConfidence) ? requestedConfidence : "medium";
  if (coverage < 0.8) {
    confidence = "low";
    limitations.push(`当前数据覆盖率为 ${Math.round(coverage * 100)}%。`);
  } else if (coverage < 0.95 && confidence === "high") {
    confidence = "medium";
  }
  if (["stale", "partial", "failed"].includes(freshness)) {
    confidence = "low";
    limitations.push(freshness === "stale" ? "当前证据已过期。" : "当前证据不完整。");
  }
  const rawConclusion = String(input.conclusion || "").trim();
  const conditional = confidence === "low" && rawConclusion && !rawConclusion.startsWith("在当前数据覆盖范围内，")
    ? `在当前数据覆盖范围内，${rawConclusion}`
    : rawConclusion;
  return sanitize({
    id: input.id || "",
    category: input.category || "market",
    title: String(input.title || "").trim(),
    conclusion: conditional,
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    ruleSetId: input.ruleSetId || "",
    ruleVersion: number(input.ruleVersion, 1),
    coverage,
    freshness,
    confidence,
    limitations: [...new Set(limitations)],
    advisoryOnly: true,
    platform: input.platform || "",
    shopId: input.shopId || "",
    productId: input.productId || "",
    skuId: input.skuId || "",
    categoryId: input.categoryId || "",
    createdAt: input.createdAt || new Date().toISOString()
  });
}

export function normalizeMarketSnapshot(input = {}) {
  const snapshot = sanitize(input);
  const coverage = clamp(snapshot.coverage);
  const dimension = VALID_DIMENSIONS.has(snapshot.dimension) ? snapshot.dimension : "audience";
  const qualityStatus = ["login_required", "schema_changed", "failed", "stale", "unsupported"].includes(snapshot.qualityStatus)
    ? snapshot.qualityStatus
    : coverage < 1 || hasMissingMetric(snapshot.metrics) ? "partial" : "healthy";
  return {
    ...snapshot,
    dimension,
    coverage,
    metrics: snapshot.metrics && typeof snapshot.metrics === "object" ? snapshot.metrics : {},
    qualityStatus,
    schemaVersion: String(snapshot.schemaVersion || "v1")
  };
}

function conditionMatches(entity, condition = {}) {
  const actual = entity?.metrics?.[condition.field] ?? entity?.[condition.field];
  const expected = condition.value;
  if (condition.operator === "gte") return Number(actual) >= Number(expected);
  if (condition.operator === "lte") return Number(actual) <= Number(expected);
  if (condition.operator === "gt") return Number(actual) > Number(expected);
  if (condition.operator === "lt") return Number(actual) < Number(expected);
  if (condition.operator === "between") {
    const [minimum, maximum] = Array.isArray(expected) ? expected : [];
    return Number(actual) >= Number(minimum) && Number(actual) <= Number(maximum);
  }
  if (condition.operator === "includes") return String(actual || "").includes(String(expected || ""));
  return String(actual ?? "") === String(expected ?? "");
}

export function discoverCompetitorCandidates({ entities = [], ruleSets = [], existing = [] } = {}) {
  const existingKeys = new Set(existing.map(item => `${item.ruleSetId}:${item.platformEntityId || item.entityId}`));
  const candidates = [];
  for (const rule of ruleSets.filter(item => item.status === "published")) {
    const conditions = Array.isArray(rule.competitorConditions) ? rule.competitorConditions : [];
    if (!conditions.length) continue;
    for (const entity of entities) {
      if (entity.dimension !== "product") continue;
      if (rule.platform && entity.platform !== rule.platform) continue;
      if (rule.categoryId && entity.categoryId !== rule.categoryId) continue;
      if (!conditions.every(condition => conditionMatches(entity, condition))) continue;
      const key = `${rule.id}:${entity.platformEntityId || entity.id}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      candidates.push(sanitize({
        id: `candidate-${rule.id}-${entity.platformEntityId || entity.id}`,
        name: entity.name || entity.title || "未命名平台商品",
        platform: entity.platform,
        shopId: entity.shopId || "",
        productId: entity.productId || "",
        skuId: entity.skuId || "",
        categoryId: entity.categoryId || "",
        platformEntityId: entity.platformEntityId || entity.id,
        entityId: entity.id,
        ruleSetId: rule.id,
        ruleVersion: number(rule.version, 1),
        consumerAppId: rule.consumerAppId,
        ownerDepartment: rule.ownerDepartment,
        status: "candidate",
        matchedRules: [rule.name || rule.id],
        evidenceRefs: [entity.id],
        recommendationReason: `命中规则“${rule.name || rule.id}”`
      }));
    }
  }
  return candidates;
}

export function buildRuleSuggestions({ snapshots = [], ruleSets = [] } = {}) {
  const suggestions = [];
  for (const rule of ruleSets.filter(item => item.status === "published")) {
    for (const template of (Array.isArray(rule.suggestionTemplates) ? rule.suggestionTemplates : [])) {
      const snapshot = snapshots.find(item => (!rule.platform || item.platform === rule.platform)
        && (!rule.categoryId || item.categoryId === rule.categoryId)
        && (!template.dimension || item.dimension === template.dimension));
      if (!snapshot) continue;
      suggestions.push(buildInsightSuggestion({
        id: `suggestion-${rule.id}-${template.id || template.dimension || suggestions.length + 1}-${snapshot.id}`,
        category: template.category,
        title: template.title,
        conclusion: template.conclusion,
        evidenceRefs: [snapshot.id],
        ruleSetId: rule.id,
        ruleVersion: rule.version,
        coverage: snapshot.coverage,
        freshness: snapshot.qualityStatus === "healthy" ? "fresh" : snapshot.qualityStatus,
        requestedConfidence: template.confidence || "high",
        platform: snapshot.platform,
        shopId: snapshot.shopId || "",
        productId: snapshot.productId || "",
        skuId: snapshot.skuId || "",
        categoryId: snapshot.categoryId || "",
        createdAt: snapshot.capturedAt || new Date().toISOString()
      }));
    }
  }
  return suggestions;
}

export function isCollectionWorkday(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}
