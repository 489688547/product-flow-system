export function createPlatformCredentialD1Mock({ tables = [] } = {}) {
  const rows = new Map();
  const audits = [];
  return {
    rows,
    audits,
    prepare(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (normalized.includes("from platform_credentials")) return rows.get(statement.values[0]) || null;
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
            audits.push({ values: [...statement.values] });
          }
          return { success: true, meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
}
