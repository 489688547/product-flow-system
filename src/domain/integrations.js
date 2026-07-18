const LIFECYCLE_STATUSES = ["connected", "integrating", "planned", "retired"];

const normalizeSearch = value => String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("zh-CN");

export function mergeIntegrationProfiles(registry, profiles = []) {
  const profilesById = new Map((Array.isArray(profiles) ? profiles : [])
    .filter(profile => profile?.platformId)
    .map(profile => [profile.platformId, profile]));
  return (registry?.platforms || []).map(platform => ({
    ...platform,
    internal: profilesById.get(platform.id) || null
  }));
}

export function filterIntegrations(platforms, { query = "", status = "all" } = {}) {
  const normalizedQuery = normalizeSearch(query);
  return (platforms || []).filter(platform => {
    if (status !== "all" && platform.status !== status) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      platform.id,
      platform.name,
      platform.summary,
      ...(platform.capabilities || []),
      ...(platform.businessQuestions || []),
      ...(platform.keywords || [])
    ].join("\n").toLocaleLowerCase("zh-CN");
    return searchable.includes(normalizedQuery);
  });
}

export function countIntegrationStatuses(platforms) {
  const counts = Object.fromEntries(["all", ...LIFECYCLE_STATUSES].map(status => [status, 0]));
  for (const platform of platforms || []) {
    counts.all += 1;
    if (Object.hasOwn(counts, platform.status)) counts[platform.status] += 1;
  }
  return counts;
}

export function resolveIntegrationRelations(platforms, platform) {
  const byId = new Map((platforms || []).map(item => [item.id, item]));
  return (platform?.relations || []).flatMap(relation => {
    const relatedPlatform = byId.get(relation.platformId);
    return relatedPlatform ? [{ ...relation, platform: relatedPlatform }] : [];
  });
}

export function isIntegrationProfileStale(profile, { now = new Date(), staleDays = 180 } = {}) {
  const verifiedAt = Date.parse(`${profile?.verifiedAt || ""}T00:00:00Z`);
  if (Number.isNaN(verifiedAt)) return true;
  return (now.getTime() - verifiedAt) / 86_400_000 > staleDays;
}
