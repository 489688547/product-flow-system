export function createErpCollectionD1Mock() {
  const tables = {
    erp_collection_batches: new Map(),
    erp_source_records: new Map(),
    erp_collection_issues: new Map(),
    erp_file_archives: new Map(),
    erp_collector_tokens: new Map(),
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
        if (query.includes("from erp_collection_batches") && query.includes("platform_id = ?") && query.includes("content_hash = ?")) {
          const [platformId, resourceType, contentHash] = state.values;
          return [...tables.erp_collection_batches.values()].find(row => row.platform_id === platformId && row.resource_type === resourceType && row.content_hash === contentHash) || null;
        }
        if (query.includes("from erp_file_archives") && query.includes("platform_id = ?") && query.includes("content_hash = ?")) {
          const [platformId, contentHash] = state.values;
          return [...tables.erp_file_archives.values()].find(row => row.platform_id === platformId && row.content_hash === contentHash) || null;
        }
        if (query.includes("from erp_collector_tokens") && query.includes("token_hash = ?")) {
          const [tokenHash] = state.values;
          return [...tables.erp_collector_tokens.values()].find(row => row.token_hash === tokenHash && row.status === "active") || null;
        }
        if (query.includes("from production_data_access_tokens") && query.includes("token_hash = ?")) {
          const [tokenHash] = state.values;
          return tables.production_data_access_tokens.get(tokenHash) || null;
        }
        if (query.includes("from product_flow_org_members") && query.includes("user_id = ?")) {
          const [userId] = state.values;
          return tables.product_flow_org_members.get(userId) || null;
        }
        return null;
      },
      async all() {
        if (query.includes("from erp_source_records") && query.includes("source_key in")) {
          const [resourceType, ...sourceKeys] = state.values;
          return {
            results: sourceKeys
              .map(sourceKey => tables.erp_source_records.get(`${resourceType}:${sourceKey}`))
              .filter(Boolean)
              .map(row => ({ source_key: row.source_key, content_hash: row.content_hash }))
          };
        }
        if (query.includes("from erp_source_records") && query.includes("source_batch_id = ?")) {
          const [batchId] = state.values;
          return { results: [...tables.erp_source_records.values()].filter(row => row.source_batch_id === batchId) };
        }
        if (query.includes("from erp_file_archives") && query.includes("order by archived_at")) {
          return { results: [...tables.erp_file_archives.values()].sort((left, right) => right.archived_at.localeCompare(left.archived_at)) };
        }
        return { results: [] };
      },
      async run() {
        if (query.startsWith("insert into erp_collection_batches")) {
          const [id, platformId, resourceType, sourceFileName, contentHash, schemaVersion, rangeStart, rangeEnd, rowCount, status, collectedAt, importedAt, importedBy, summary, createdAt, updatedAt, archiveId, targetEnvironment, targetEnvironmentVersion] = state.values;
          const existing = [...tables.erp_collection_batches.values()].find(row => row.platform_id === platformId && row.resource_type === resourceType && row.content_hash === contentHash);
          const row = {
            id: existing?.id || id,
            platform_id: platformId,
            resource_type: resourceType,
            source_file_name: sourceFileName,
            content_hash: contentHash,
            schema_version: schemaVersion,
            range_start: rangeStart,
            range_end: rangeEnd,
            row_count: rowCount,
            status,
            collected_at: collectedAt,
            imported_at: importedAt,
            imported_by: importedBy,
            summary,
            created_at: existing?.created_at || createdAt,
            updated_at: updatedAt,
            archive_id: archiveId || null,
            target_environment: targetEnvironment,
            target_environment_version: targetEnvironmentVersion
          };
          tables.erp_collection_batches.set(row.id, row);
          return { success: true };
        }
        if (query.startsWith("insert into erp_source_records")) {
          const [id, resourceType, sourceKey, sourceBatchId, occurredAt, modifiedAt, shopId, warehouseId, contentHash, payload, createdAt, updatedAt] = state.values;
          const key = `${resourceType}:${sourceKey}`;
          const existing = tables.erp_source_records.get(key);
          tables.erp_source_records.set(key, {
            id: existing?.id || id,
            resource_type: resourceType,
            source_key: sourceKey,
            source_batch_id: sourceBatchId,
            occurred_at: occurredAt,
            modified_at: modifiedAt,
            shop_id: shopId,
            warehouse_id: warehouseId,
            content_hash: contentHash,
            payload,
            created_at: existing?.created_at || createdAt,
            updated_at: updatedAt
          });
          return { success: true };
        }
        if (query.startsWith("insert into erp_collection_issues")) {
          const [id, sourceBatchId, resourceType, sourceKey, code, severity, message, details, status, createdAt, updatedAt] = state.values;
          tables.erp_collection_issues.set(id, {
            id, source_batch_id: sourceBatchId, resource_type: resourceType, source_key: sourceKey,
            code, severity, message, details, status, created_at: createdAt, updated_at: updatedAt
          });
          return { success: true };
        }
        if (query.startsWith("insert into erp_file_archives")) {
          const [id, platformId, resourceType, contentHash, fileName, sizeBytes, relativePath, storageType, runnerId, status, batchId, archivedAt, processedAt, errorCode, createdAt, updatedAt] = state.values;
          const existing = [...tables.erp_file_archives.values()].find(row => row.platform_id === platformId && row.content_hash === contentHash);
          const row = {
            id: existing?.id || id,
            platform_id: platformId,
            resource_type: resourceType,
            content_hash: contentHash,
            file_name: fileName,
            size_bytes: sizeBytes,
            relative_path: relativePath,
            storage_type: storageType,
            runner_id: runnerId || existing?.runner_id || null,
            status: existing?.status === "processed" && status === "archived" ? "processed" : status,
            batch_id: batchId || existing?.batch_id || null,
            archived_at: archivedAt,
            processed_at: processedAt || existing?.processed_at || null,
            error_code: status === "archived" ? (existing?.error_code || null) : errorCode,
            created_at: existing?.created_at || createdAt,
            updated_at: updatedAt
          };
          tables.erp_file_archives.set(row.id, row);
          return { success: true };
        }
        if (query.startsWith("insert into erp_collector_tokens")) {
          const [id, tokenHash, name, scope, status, createdAt, createdBy] = state.values;
          tables.erp_collector_tokens.set(id, {
            id, token_hash: tokenHash, name, scope, status, created_at: createdAt, created_by: createdBy,
            last_seen_at: null, revoked_at: null, revoked_by: null
          });
          return { success: true };
        }
        if (query.startsWith("update erp_collector_tokens set last_seen_at")) {
          const [lastSeenAt, id] = state.values;
          const row = tables.erp_collector_tokens.get(id);
          if (row) row.last_seen_at = lastSeenAt;
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
