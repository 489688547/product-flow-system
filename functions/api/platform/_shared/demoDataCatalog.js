const DEFAULT_BATCH_SIZE = 200;

function table(tableName, policy, primaryKey, copyOrder, options = {}) {
  return Object.freeze({
    table: tableName,
    policy,
    primaryKey: Object.freeze(primaryKey),
    copyOrder,
    batchSize: options.batchSize || DEFAULT_BATCH_SIZE,
    required: Boolean(options.required),
    maskFields: options.maskFields ? Object.freeze({ ...options.maskFields }) : undefined,
    maskJsonFields: options.maskJsonFields ? Object.freeze([...options.maskJsonFields]) : undefined
  });
}

const BUSINESS_TABLES = [
  table("data_metric_definitions", "copy", ["id"], 10),
  table("data_metric_definition_versions", "copy", ["definition_id", "version"], 11),
  table("data_metric_results", "recalculate", ["id"], 12),
  table("data_metric_calculation_runs", "recalculate", ["id"], 13),

  table("product_flow_state", "mask", ["id"], 20, { required: true, maskJsonFields: ["payload"] }),
  table("product_flow_state_parts", "mask", ["state_id", "part_key", "part_index"], 21, { required: true, maskJsonFields: ["payload"] }),
  table("platform_records", "mask", ["entity_type", "id"], 22, { maskJsonFields: ["payload"] }),
  table("platform_meta", "copy", ["key"], 23),
  table("brand_content_state", "mask", ["id"], 24, { maskJsonFields: ["payload"] }),

  table("product_catalog_items", "copy", ["id"], 30),
  table("product_catalog_skus", "copy", ["id"], 31),
  table("product_catalog_components", "copy", ["id"], 32),
  table("product_catalog_sync_runs", "copy", ["id"], 33),
  table("product_catalog_meta", "copy", ["key"], 34),
  table("product_sales_daily", "transform_sales", ["code", "date", "platform"], 35, { required: true, batchSize: 250 }),
  table("product_sales_meta", "copy", ["id"], 36, { required: true }),

  table("data_sources", "copy", ["entity_type", "id"], 40),
  table("data_sync_runs", "copy", ["entity_type", "id"], 41),
  table("data_source_files", "copy", ["entity_type", "id"], 42),
  table("data_dimension_mappings", "copy", ["entity_type", "id"], 43),
  table("data_quality_issues", "copy", ["entity_type", "id"], 44),
  table("data_center_meta", "copy", ["key"], 45),

  table("ecommerce_operation_records", "mask", ["entity_type", "id"], 50, { maskJsonFields: ["payload"] }),
  table("ecommerce_operation_meta", "copy", ["key"], 51),
  table("ecommerce_operation_state", "mask", ["id"], 52, { maskJsonFields: ["payload"] }),
  table("performance_management_records", "mask", ["entity_type", "id"], 53, { maskJsonFields: ["payload"] }),
  table("performance_management_meta", "copy", ["key"], 54),
  table("performance_management_state", "mask", ["id"], 55, { maskJsonFields: ["payload"] }),

  table("supply_chain_records", "mask", ["entity_type", "id"], 60, { maskJsonFields: ["payload"] }),
  table("supply_chain_meta", "copy", ["key"], 61),
  table("goods_flow_events", "copy", ["id"], 62),
  table("goods_flow_inventory_daily", "copy", ["id"], 63),
  table("goods_flow_stocktakes", "copy", ["id"], 64),
  table("goods_flow_stocktake_lines", "copy", ["stocktake_id", "sku_id", "warehouse_id"], 65),
  table("goods_flow_receivable_terms", "copy", ["id"], 66),
  table("goods_flow_ccc_monthly", "recalculate", ["id"], 67),
  table("goods_flow_exceptions", "copy", ["id"], 68),

  table("collaboration_items", "mask", ["id"], 70, { maskJsonFields: ["payload"] }),
  table("collaboration_participants", "copy", ["subject_type", "subject_id", "item_id"], 71),
  table("collaboration_activities", "mask", ["id"], 72, { maskJsonFields: ["payload"] }),

  table("user_insight_category_mappings", "mask", ["id"], 80, { maskJsonFields: ["payload"] }),
  table("user_insight_rules", "mask", ["id"], 81, { maskJsonFields: ["payload"] }),
  table("user_insight_snapshots", "mask", ["id"], 82, { maskJsonFields: ["payload"] }),
  table("user_insight_entities", "mask", ["id"], 83, { maskJsonFields: ["payload"] }),
  table("user_insight_competitors", "mask", ["id"], 84, { maskJsonFields: ["payload"] }),
  table("user_insight_sync_runs", "mask", ["id"], 85, { maskJsonFields: ["payload"] }),
  table("user_insight_meta", "copy", ["key"], 86),

  table("hr_employees", "mask", ["id"], 90, {
    maskFields: { user_id: "identity", union_id: "identity", name: "name", updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_assignments", "mask", ["id"], 91, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_role_assignments", "mask", ["id"], 92, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_lifecycle_events", "mask", ["id"], 93, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_performance_templates", "mask", ["id"], 94, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_performance_cycles", "mask", ["id"], 95, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_performance_items", "mask", ["id"], 96, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_evidence_snapshots", "mask", ["id"], 97, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["payload"]
  }),
  table("hr_management_meta", "mask", ["key"], 98, {
    maskFields: { updated_by: "name" },
    maskJsonFields: ["value"]
  })
];

const CONTROL_TABLES = [
  "product_flow_sessions",
  "product_flow_ding_user_tokens",
  "product_flow_org_members",
  "production_data_access_tokens",
  "production_write_unlocks",
  "production_data_snapshots",
  "production_data_snapshot_parts",
  "production_data_audit",
  "platform_credentials",
  "platform_credential_audit",
  "credential_vault_entries",
  "credential_vault_permissions",
  "credential_vault_audit",
  "data_connector_instances",
  "internal_vault_items",
  "data_connections",
  "data_connection_shops",
  "data_connection_audit",
  "browser_agent_tasks",
  "browser_agent_task_grants",
  "data_environment_grants",
  "demo_data_environment_state",
  "demo_data_refresh_jobs",
  "data_environment_audit",
  "data_ai_providers",
  "data_ai_policies",
  "ai_request_leases",
  "ai_usage_audit",
  "ai_skill_audit",
  "erp_collector_tokens",
  "erp_collection_batches",
  "erp_collection_issues",
  "erp_file_archives",
  "erp_source_records",
  "web_collection_runners",
  "web_collection_jobs",
  "web_collection_runs",
  "web_collection_cursors",
  "web_collection_notifications",
  "user_insight_runner_tokens",
  "user_insight_audit_logs",
  "data_runners",
  "data_app_subscriptions",
  "data_audit_logs",
  "data_metric_audit_logs",
  "hr_audit_logs",
  "integration_private_profiles",
  "integration_profile_audit"
].map((name, index) => table(name, "skip", ["id"], 1000 + index));

export const DEMO_DATA_CATALOG = Object.freeze([...BUSINESS_TABLES, ...CONTROL_TABLES]);
const CATALOG_BY_TABLE = new Map(DEMO_DATA_CATALOG.map(entry => [entry.table, entry]));
const UNKNOWN_POLICY = Object.freeze({
  table: "",
  policy: "skip",
  primaryKey: Object.freeze([]),
  copyOrder: Number.MAX_SAFE_INTEGER,
  batchSize: DEFAULT_BATCH_SIZE,
  required: false
});

export function demoTablePolicy(tableName) {
  return CATALOG_BY_TABLE.get(String(tableName || "")) || {
    ...UNKNOWN_POLICY,
    table: String(tableName || "")
  };
}

export function copyableDemoTables() {
  return DEMO_DATA_CATALOG
    .filter(entry => ["copy", "mask", "transform_sales"].includes(entry.policy))
    .sort((left, right) => left.copyOrder - right.copyOrder);
}

export function recalculatedDemoTables() {
  return DEMO_DATA_CATALOG
    .filter(entry => entry.policy === "recalculate")
    .sort((left, right) => left.copyOrder - right.copyOrder);
}
