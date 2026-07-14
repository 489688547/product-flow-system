function normalizeSql(sql = "") {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

export function createAuthD1Mock() {
  const sessions = new Map();
  const members = new Map();
  const calls = [];

  function memberKey(corpId, userId) {
    return `${corpId}:${userId}`;
  }

  return {
    calls,
    prepare(sql) {
      const normalized = normalizeSql(sql);
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ type: "run", sql, values: statement.values });

          if (normalized.startsWith("insert into product_flow_sessions")) {
            const [
              idHash,
              corpId,
              userId,
              unionId,
              name,
              role,
              department,
              title,
              loginMode,
              createdAt,
              lastSeenAt,
              expiresAt
            ] = statement.values;
            sessions.set(idHash, {
              id_hash: idHash,
              corp_id: corpId,
              user_id: userId,
              union_id: unionId,
              name,
              role,
              department,
              title,
              login_mode: loginMode,
              created_at: createdAt,
              last_seen_at: lastSeenAt,
              expires_at: expiresAt,
              revoked_at: null
            });
          } else if (normalized.startsWith("update product_flow_sessions set revoked_at")) {
            const [revokedAt, idHash] = statement.values;
            const row = sessions.get(idHash);
            if (row) row.revoked_at = revokedAt;
          } else if (normalized.startsWith("update product_flow_sessions set last_seen_at")) {
            const [lastSeenAt, idHash] = statement.values;
            const row = sessions.get(idHash);
            if (row) row.last_seen_at = lastSeenAt;
          } else if (normalized.startsWith("insert into product_flow_org_members")) {
            const [corpId, userId, unionId, name, department, title, role, active, syncedAt] = statement.values;
            members.set(memberKey(corpId, userId), {
              corp_id: corpId,
              user_id: userId,
              union_id: unionId,
              name,
              department,
              title,
              role,
              active,
              synced_at: syncedAt
            });
          }

          return { success: true };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });
          if (normalized.includes("from product_flow_sessions")) {
            return sessions.get(statement.values[0]) || null;
          }
          if (normalized.includes("from product_flow_org_members")) {
            if (normalized.includes("union_id")) {
              return [...members.values()].find(row => row.corp_id === statement.values[0] && row.union_id === statement.values[1]) || null;
            }
            return members.get(memberKey(statement.values[0], statement.values[1])) || null;
          }
          return null;
        },
        async all() {
          calls.push({ type: "all", sql, values: statement.values });
          return { results: [] };
        }
      };
      return statement;
    },
    dumpSessions() {
      return [...sessions.values()].map(row => ({ ...row }));
    },
    dumpMembers() {
      return [...members.values()].map(row => ({ ...row }));
    },
    setSessionExpires(idHash, expiresAt) {
      const row = sessions.get(idHash);
      if (row) row.expires_at = expiresAt;
    }
  };
}
