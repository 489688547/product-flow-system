const WORKSPACE_RESOURCES = Object.freeze({
  workbench: [
    "procurement-suggestions",
    "purchase-batches",
    "quality-incidents"
  ],
  planning: [
    "responsibility-rules",
    "procurement-rules",
    "procurement-suggestions",
    "purchase-plans",
    "purchase-batches",
    "purchase-payment-links",
    "clearance-suggestions"
  ],
  suppliers: [
    "suppliers"
  ],
  transit: [
    "purchase-batches"
  ],
  inventory: [
    "bom-definitions",
    "clearance-suggestions"
  ],
  quality: [
    "quality-standards",
    "inspection-plans",
    "inspection-records",
    "quality-incidents"
  ],
  finance: [
    "purchase-payment-links",
    "freight-rate-rules",
    "freight-reconciliations"
  ],
  rules: [
    "responsibility-rules",
    "procurement-rules",
    "bom-definitions",
    "business-rules"
  ]
});

export function supplyChainWorkflowResourcesForWorkspace(workspace) {
  return [...(WORKSPACE_RESOURCES[String(workspace || "")] || [])];
}

export function mergeSupplyChainWorkflowEntity(resources = {}, entity = {}) {
  const resource = String(entity?.resource || "").trim();
  const id = String(entity?.id || "").trim();
  if (!resource || !id) return resources;
  const current = resources[resource] || {
    available: true,
    synced: true,
    items: [],
    nextCursor: "",
    scope: {},
    coverage: {
      status: "empty",
      asOf: null,
      sourceVersions: []
    }
  };
  const existingIndex = current.items.findIndex(item => String(item?.id || "") === id);
  const items = [...current.items];
  if (existingIndex >= 0) items.splice(existingIndex, 1);
  items.unshift(entity);
  return {
    ...resources,
    [resource]: {
      ...current,
      available: true,
      synced: true,
      items,
      coverage: {
        ...current.coverage,
        status: items.length ? "complete" : current.coverage?.status || "empty",
        asOf: entity.updatedAt || current.coverage?.asOf || null,
        sourceVersions: [...new Set([
          ...(current.coverage?.sourceVersions || []),
          Number(entity.version)
        ].filter(Number.isFinite))].sort((left, right) => left - right)
      }
    }
  };
}
