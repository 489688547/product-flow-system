import { createDefaultAiDataPolicies, normalizeAiProvider } from "../../src/domain/aiAssistant.js";

const TABLE_TO_COLLECTION = {
  data_sources: "sources",
  data_runners: "runners",
  data_sync_runs: "syncRuns",
  data_source_files: "sourceFiles",
  data_dimension_mappings: "mappings",
  data_metric_definitions: "metricDefinitions",
  data_quality_issues: "qualityIssues",
  data_app_subscriptions: "subscriptions",
  data_audit_logs: "auditLogs",
  data_ai_providers: "aiProviders",
  data_ai_policies: "aiDataPolicies"
};

export function createAiD1Mock({ providerEnabled = false } = {}) {
  const records = new Map();
  const meta = new Map();
  const audits = [];
  const leases = new Map();
  const provider = normalizeAiProvider({ enabled: providerEnabled });
  records.set(`aiProviders:${provider.providerId}`, {
    entity_type: "aiProviders",
    id: provider.providerId,
    payload: JSON.stringify(provider),
    updated_at: "2026-07-18T00:00:00Z",
    updated_by: "test"
  });
  for (const policy of createDefaultAiDataPolicies()) {
    records.set(`aiDataPolicies:${policy.domainId}`, {
      entity_type: "aiDataPolicies",
      id: policy.domainId,
      payload: JSON.stringify(policy),
      updated_at: "2026-07-18T00:00:00Z",
      updated_by: "test"
    });
  }
  return {
    records,
    meta,
    audits,
    leases,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/insert into data_\w+ \(entity_type/i.test(sql)) {
            const [entityType, id, payload, updatedAt, updatedBy] = statement.values;
            records.set(`${entityType}:${id}`, { entity_type: entityType, id, payload, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/delete from data_\w+ where entity_type/i.test(sql)) {
            [...records.keys()].filter(key => key.startsWith(`${statement.values[0]}:`)).forEach(key => records.delete(key));
          } else if (/insert into data_center_meta/i.test(sql)) {
            meta.set(statement.values[0], statement.values[1]);
          } else if (/insert into ai_usage_audit/i.test(sql)) {
            audits.push(statement.values);
          } else if (/insert into ai_request_leases/i.test(sql)) {
            const [userId, requestId, expiresAt] = statement.values;
            if (leases.has(userId)) throw new Error("UNIQUE constraint failed");
            leases.set(userId, { requestId, expiresAt });
          } else if (/delete from ai_request_leases where expires_at/i.test(sql)) {
            for (const [userId, lease] of leases) {
              if (lease.expiresAt <= statement.values[0]) leases.delete(userId);
            }
          } else if (/delete from ai_request_leases where user_id/i.test(sql)) {
            const [userId, requestId] = statement.values;
            if (leases.get(userId)?.requestId === requestId) leases.delete(userId);
          }
          return { success: true };
        },
        async all() {
          const table = Object.keys(TABLE_TO_COLLECTION).find(name => new RegExp(`from ${name}`, "i").test(sql));
          if (table) return { results: [...records.values()].filter(row => row.entity_type === TABLE_TO_COLLECTION[table]) };
          if (/from product_sales_daily/i.test(sql)) return { results: [] };
          if (/from platform_records/i.test(sql)) return { results: [{ entity_type: "projects", id: "project-1", payload: JSON.stringify({ id: "project-1", title: "重点项目", status: "at_risk", department: "总经办" }), updated_at: "2026-07-18T00:00:00Z", updated_by: "test" }] };
          if (/from product_flow_state_parts|supply_chain_records/i.test(sql)) return { results: [] };
          return { results: [] };
        },
        async first() {
          if (/data_center_meta/i.test(sql) && meta.has(statement.values[0])) return { value: meta.get(statement.values[0]) };
          return null;
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}
