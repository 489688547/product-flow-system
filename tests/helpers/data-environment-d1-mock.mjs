export function createDataEnvironmentD1Mock({
  displayState = {
    id: "display",
    enabled: 1,
    status: "ready",
    version: 7,
    active_job_id: null,
    rule_version: "sales-2x-v1",
    source_updated_at: "2026-07-22T16:00:00.000Z",
    coverage_json: "{\"from\":\"2026-01-01\",\"to\":\"2026-07-22\"}",
    validation_json: "{\"salesFactor\":2}",
    last_error_code: null,
    updated_by: "executive-1",
    updated_at: "2026-07-23T01:00:00.000Z"
  }
} = {}) {
  const grants = new Map();
  const audits = [];
  const calls = [];
  let state = displayState ? { ...displayState } : null;

  const db = {
    grants,
    audits,
    calls,
    get displayState() {
      return state;
    },
    set displayState(value) {
      state = value ? { ...value } : null;
    },
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first() {
          calls.push({ type: "first", sql, values: [...statement.values] });
          if (/FROM demo_data_environment_state/i.test(sql)) return state ? { ...state } : null;
          if (/FROM data_environment_grants/i.test(sql)) {
            const grant = grants.get(statement.values[0]);
            return grant ? { ...grant } : null;
          }
          return null;
        },
        async run() {
          calls.push({ type: "run", sql, values: [...statement.values] });
          if (/INSERT INTO data_environment_grants/i.test(sql)) {
            const [
              id,
              tokenHash,
              actorId,
              environmentId,
              environmentVersion,
              expiresAt,
              createdAt,
              updatedAt
            ] = statement.values;
            grants.set(tokenHash, {
              id,
              token_hash: tokenHash,
              actor_id: actorId,
              environment_id: environmentId,
              environment_version: environmentVersion,
              expires_at: expiresAt,
              revoked_at: null,
              created_at: createdAt,
              updated_at: updatedAt
            });
          } else if (/UPDATE data_environment_grants SET revoked_at/i.test(sql)) {
            const [revokedAt, updatedAt, tokenHash, actorId] = statement.values;
            const grant = grants.get(tokenHash);
            if (grant && grant.actor_id === actorId) {
              grant.revoked_at = revokedAt;
              grant.updated_at = updatedAt;
            }
          } else if (/INSERT INTO data_environment_audit/i.test(sql)) {
            audits.push([...statement.values]);
          }
          return { success: true, meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };

  return db;
}
