function normalizeSql(sql = "") {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

export function createAuthD1Mock() {
  const sessions = new Map();
  const members = new Map();
  const dingTokens = new Map();
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
          } else if (normalized.startsWith("insert into product_flow_ding_user_tokens")) {
            const [sessionIdHash, accessCiphertext, iv, expiresAt, updatedAt] = statement.values;
            dingTokens.set(sessionIdHash, {
              session_id_hash: sessionIdHash,
              access_ciphertext: accessCiphertext,
              iv,
              expires_at: expiresAt,
              updated_at: updatedAt
            });
          } else if (normalized.startsWith("delete from product_flow_ding_user_tokens")) {
            dingTokens.delete(statement.values[0]);
          }

          return { success: true };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });
          if (normalized.includes("from product_flow_sessions")) {
            return sessions.get(statement.values[0]) || null;
          }
          if (normalized.includes("from product_flow_org_members")) {
            if (normalized.includes("where corp_id = ? and union_id = ?")) {
              return [...members.values()].find(row => row.corp_id === statement.values[0] && row.union_id === statement.values[1]) || null;
            }
            return members.get(memberKey(statement.values[0], statement.values[1])) || null;
          }
          if (normalized.includes("from product_flow_ding_user_tokens")) {
            return dingTokens.get(statement.values[0]) || null;
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
    dumpDingTokens() {
      return [...dingTokens.values()].map(row => ({ ...row }));
    },
    setDingTokenExpires(idHash, expiresAt) {
      const row = dingTokens.get(idHash);
      if (row) row.expires_at = expiresAt;
    },
    setSessionExpires(idHash, expiresAt) {
      const row = sessions.get(idHash);
      if (row) row.expires_at = expiresAt;
    }
  };
}
