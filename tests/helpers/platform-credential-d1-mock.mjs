export function createPlatformCredentialD1Mock({ tables = [] } = {}) {
  const rows = new Map();
  const audits = [];
  const db = {
    rows,
    audits,
    async batch(statements) {
      const rowsBefore = new Map([...rows].map(([key, value]) => [key, { ...value }]));
      const auditLength = audits.length;
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        rows.clear();
        for (const [key, value] of rowsBefore) rows.set(key, value);
        audits.splice(auditLength);
        throw error;
      }
    },
    prepare(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (normalized.includes("from platform_credentials")) return rows.get(statement.values[0]) || null;
          if (normalized.includes("count(*)") && normalized.includes("from platform_credential_audit")) {
            const [platformId, action, since] = statement.values;
            return {
              count: audits.filter(row => row.platform_id === platformId
                && row.action === action
                && row.result === "success"
                && row.created_at >= since).length
            };
          }
          return null;
        },
        async all() {
          if (normalized.includes("sqlite_master")) return { results: tables.map(name => ({ name })) };
          if (normalized.includes("from platform_credentials")) return { results: [...rows.values()] };
          return { results: [] };
        },
        async run() {
          if (normalized.startsWith("insert into platform_credentials")) {
            const [platformId, ciphertext, iv, algorithm, keyVersion, configuredFields, version, enabled, verifiedAt, verifiedBy, updatedAt, updatedBy] = statement.values;
            const current = rows.get(platformId);
            if (current && Number(current.version) !== Number(version) - 1) return { success: true, meta: { changes: 0 } };
            rows.set(platformId, { platform_id: platformId, ciphertext, iv, algorithm, key_version: keyVersion, configured_fields: configuredFields, version, enabled, verified_at: verifiedAt, verified_by: verifiedBy, updated_at: updatedAt, updated_by: updatedBy });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into platform_credential_audit")) {
            if (normalized.includes("count(*) from platform_credential_audit")) {
              const [id, platformId, requestId, actorId, actorName, purpose, createdAt, ratePlatformId, since, limit] = statement.values;
              const count = audits.filter(row => row.platform_id === ratePlatformId
                && row.action === "reveal"
                && row.result === "success"
                && row.created_at >= since).length;
              if (count >= Number(limit)) return { success: true, meta: { changes: 0 } };
              audits.push({ id, platform_id: platformId, action: "reveal", changed_fields: "[]", result: "success", request_id: requestId, actor_id: actorId, actor_name: actorName, purpose, created_at: createdAt });
              return { success: true, meta: { changes: 1 } };
            }
            const platformId = statement.values[1];
            const current = rows.get(platformId);
            if (normalized.includes("where not exists") && current) return { success: true, meta: { changes: 0 } };
            if (normalized.includes("where exists")) {
              const expectedVersion = statement.values.at(-1);
              if (!current || Number(current.version) !== Number(expectedVersion)) return { success: true, meta: { changes: 0 } };
            }
            const [id, , action, changedFields, result, requestId, actorId, actorName, purpose, createdAt] = statement.values;
            audits.push({
              id,
              platform_id: platformId,
              action,
              changed_fields: changedFields,
              result,
              request_id: requestId,
              actor_id: actorId,
              actor_name: actorName,
              purpose,
              created_at: createdAt
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
  return db;
}
