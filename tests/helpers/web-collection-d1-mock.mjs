export function createWebCollectionD1Mock() {
  const tables = {
    web_collection_runners: new Map(),
    web_collection_jobs: new Map(),
    web_collection_runs: new Map(),
    web_collection_cursors: new Map(),
    web_collection_notifications: new Map(),
    production_data_access_tokens: new Map(),
    product_flow_org_members: new Map()
  };

  function statement(sql) {
    const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    const state = {
      values: [],
      bind(...values) {
        state.values = values;
        return state;
      },
      async first() {
        if (query.includes("from web_collection_runners") && query.includes("token_hash = ?")) {
          const [hash] = state.values;
          return [...tables.web_collection_runners.values()].find(row => row.token_hash === hash && row.status === "active") || null;
        }
        if (query.includes("from web_collection_jobs") && query.includes("idempotency_key = ?")) {
          const [key] = state.values;
          return [...tables.web_collection_jobs.values()].find(row => row.idempotency_key === key) || null;
        }
        if (query.includes("from web_collection_jobs") && query.includes("where id = ?")) {
          return tables.web_collection_jobs.get(state.values[0]) || null;
        }
        if (query.includes("from web_collection_jobs") && query.includes("status = 'queued'")) {
          const [now] = state.values;
          return [...tables.web_collection_jobs.values()]
            .filter(row => row.status === "queued" || (row.status === "claimed" && row.lease_expires_at < now))
            .sort((left, right) => `${left.business_date}:${left.created_at}`.localeCompare(`${right.business_date}:${right.created_at}`))[0] || null;
        }
        if (query.includes("from web_collection_notifications") && query.includes("dedupe_key = ?")) {
          const [key] = state.values;
          return [...tables.web_collection_notifications.values()].find(row => row.dedupe_key === key) || null;
        }
        if (query.includes("from production_data_access_tokens") && query.includes("token_hash = ?")) {
          return tables.production_data_access_tokens.get(state.values[0]) || null;
        }
        if (query.includes("from product_flow_org_members") && query.includes("user_id = ?")) {
          return tables.product_flow_org_members.get(state.values[0]) || null;
        }
        return null;
      },
      async all() {
        if (query.includes("from web_collection_runners")) return { results: [...tables.web_collection_runners.values()] };
        if (query.includes("from web_collection_jobs")) return { results: [...tables.web_collection_jobs.values()] };
        if (query.includes("from web_collection_cursors")) return { results: [...tables.web_collection_cursors.values()] };
        if (query.includes("from web_collection_notifications")) return { results: [...tables.web_collection_notifications.values()] };
        return { results: [] };
      },
      async run() {
        if (query.startsWith("insert into web_collection_runners")) {
          const [id, name, tokenHash, scope, status, createdAt, createdBy] = state.values;
          tables.web_collection_runners.set(id, {
            id, name, token_hash: tokenHash, scope, status, version: null, chrome_status: null,
            current_job_id: null, last_seen_at: null, created_at: createdAt, created_by: createdBy
          });
          return { success: true };
        }
        if (query.startsWith("update web_collection_runners set version")) {
          const [version, chromeStatus, currentJobId, lastSeenAt, id] = state.values;
          Object.assign(tables.web_collection_runners.get(id), {
            version, chrome_status: chromeStatus, current_job_id: currentJobId, last_seen_at: lastSeenAt
          });
          return { success: true };
        }
        if (query.startsWith("insert into web_collection_jobs")) {
          const [id, providerId, resourceType, businessDate, rangeKind, rangeStart, rangeEnd, timeZone,
            scheduleVersion, idempotencyKey, status, selectorVersion, createdAt, updatedAt] = state.values;
          tables.web_collection_jobs.set(id, {
            id, provider_id: providerId, resource_type: resourceType, business_date: businessDate,
            range_kind: rangeKind, range_start: rangeStart, range_end: rangeEnd, time_zone: timeZone,
            schedule_version: scheduleVersion, idempotency_key: idempotencyKey, status, selector_version: selectorVersion,
            stage: null, attempt: 0, runner_id: null, lease_expires_at: null, error_code: null, error_summary: null,
            created_at: createdAt, updated_at: updatedAt, started_at: null, completed_at: null
          });
          return { success: true };
        }
        if (query.startsWith("update web_collection_jobs set status = 'claimed'")) {
          const [runnerId, leaseExpiresAt, startedAt, updatedAt, id] = state.values;
          const row = tables.web_collection_jobs.get(id);
          Object.assign(row, {
            status: "claimed", stage: "claimed", runner_id: runnerId, lease_expires_at: leaseExpiresAt,
            attempt: Number(row.attempt || 0) + 1, started_at: row.started_at || startedAt, updated_at: updatedAt
          });
          return { success: true };
        }
        if (query.startsWith("update web_collection_jobs set status = ?")) {
          const [status, stage, errorCode, errorSummary, leaseExpiresAt, updatedAt, id] = state.values;
          Object.assign(tables.web_collection_jobs.get(id), {
            status, stage, error_code: errorCode, error_summary: errorSummary, lease_expires_at: leaseExpiresAt, updated_at: updatedAt
          });
          return { success: true };
        }
        if (query.startsWith("insert into web_collection_runs")) {
          const [id, jobId, runnerId, attempt, status, stage, batchId, archiveId, fileHash, rowCount, startedAt, completedAt, createdAt] = state.values;
          tables.web_collection_runs.set(id, {
            id, job_id: jobId, runner_id: runnerId, attempt, status, stage, batch_id: batchId,
            archive_id: archiveId, file_hash: fileHash, row_count: rowCount, started_at: startedAt,
            completed_at: completedAt, created_at: createdAt
          });
          return { success: true };
        }
        if (query.startsWith("update web_collection_jobs set status = 'success'")) {
          const [completedAt, updatedAt, id] = state.values;
          Object.assign(tables.web_collection_jobs.get(id), {
            status: "success", stage: "success", lease_expires_at: null, error_code: null,
            error_summary: null, completed_at: completedAt, updated_at: updatedAt
          });
          return { success: true };
        }
        if (query.startsWith("insert into web_collection_cursors")) {
          const [id, providerId, resourceType, businessDate, jobId, runId, batchId, completedAt, updatedAt] = state.values;
          const key = `${providerId}:${resourceType}`;
          const existing = tables.web_collection_cursors.get(key);
          tables.web_collection_cursors.set(key, {
            id: existing?.id || id, provider_id: providerId, resource_type: resourceType, business_date: businessDate,
            job_id: jobId, run_id: runId, batch_id: batchId, completed_at: completedAt, updated_at: updatedAt
          });
          return { success: true };
        }
        if (query.startsWith("insert into web_collection_notifications")) {
          const [id, jobId, runnerId, kind, dedupeKey, result, sentAt, createdAt] = state.values;
          tables.web_collection_notifications.set(id, {
            id, job_id: jobId, runner_id: runnerId, kind, dedupe_key: dedupeKey, result, sent_at: sentAt, created_at: createdAt
          });
          return { success: true };
        }
        if (query.startsWith("update production_data_access_tokens set last_used_at")) {
          const [lastUsedAt, tokenHash] = state.values;
          const row = tables.production_data_access_tokens.get(tokenHash);
          if (row) row.last_used_at = lastUsedAt;
          return { success: true };
        }
        return { success: true };
      }
    };
    return state;
  }

  return {
    tables,
    prepare: statement,
    async batch(statements) {
      return Promise.all(statements.map(item => item.run()));
    }
  };
}
