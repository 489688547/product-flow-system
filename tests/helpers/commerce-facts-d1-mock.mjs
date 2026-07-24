export function createCommerceFactsD1Mock() {
  const tables = {
    web_collection_runners: new Map(),
    web_collection_jobs: new Map(),
    commerce_fact_batches: new Map(),
    commerce_store_daily_facts: new Map(),
    commerce_product_daily_facts: new Map(),
    commerce_live_daily_facts: new Map(),
    commerce_video_daily_facts: new Map()
  };

  function rowsFor(tableName) {
    return [...tables[tableName].values()];
  }

  function insertRow(sql, values) {
    const match = sql.match(/insert into\s+([a-z0-9_]+)\s*\(([^)]+)\)/i);
    if (!match || !tables[match[1]]) return false;
    const columns = match[2].split(",").map(value => value.trim());
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    tables[match[1]].set(row.id, { ...(tables[match[1]].get(row.id) || {}), ...row });
    return true;
  }

  function statement(sql) {
    const source = String(sql).replace(/\s+/g, " ").trim();
    const query = source.toLowerCase();
    const state = {
      values: [],
      bind(...values) {
        state.values = values;
        return state;
      },
      async first() {
        if (query.includes("from web_collection_runners") && query.includes("token_hash = ?")) {
          const [tokenHash] = state.values;
          return rowsFor("web_collection_runners")
            .find(row => row.token_hash === tokenHash && row.status === "active") || null;
        }
        if (query.includes("from web_collection_jobs") && query.includes("where id = ?")) {
          return tables.web_collection_jobs.get(state.values[0]) || null;
        }
        if (query.includes("from commerce_fact_batches") && query.includes("where id = ?")) {
          return tables.commerce_fact_batches.get(state.values[0]) || null;
        }
        if (query.startsWith("select count(*) as count from commerce_")) {
          const tableName = query.match(/from\s+(commerce_[a-z0-9_]+)/)?.[1];
          const [batchId] = state.values;
          return { count: rowsFor(tableName).filter(row => row.batch_id === batchId).length };
        }
        return null;
      },
      async all() {
        if (query.includes("from commerce_fact_batches") && query.includes("status = 'completed'")) {
          const [providerId, storeId, resourceType, from, to] = state.values;
          return {
            results: rowsFor("commerce_fact_batches").filter(row =>
              row.status === "completed"
              && row.provider_id === providerId
              && row.store_id === storeId
              && row.resource_type === resourceType
              && row.business_date >= from
              && row.business_date <= to
            )
          };
        }
        const tableName = query.match(/from\s+(commerce_(?:store|product|live|video)_daily_facts)\s+f/)?.[1];
        if (tableName) {
          const [providerId, storeId, from, to, dimension] = state.values;
          const dimensionColumn = query.includes("f.product_id = ?")
            ? "product_id"
            : query.includes("f.sku_id = ?")
              ? "sku_id"
              : query.includes("f.live_session_id = ?")
                ? "live_session_id"
                : query.includes("f.video_id = ?")
                  ? "video_id"
                  : null;
          return {
            results: rowsFor(tableName)
              .filter(row => {
                const batch = tables.commerce_fact_batches.get(row.batch_id);
                return batch?.status === "completed"
                  && row.provider_id === providerId
                  && row.store_id === storeId
                  && row.business_date >= from
                  && row.business_date <= to
                  && (!dimensionColumn || row[dimensionColumn] === dimension);
              })
          };
        }
        return { results: [] };
      },
      async run() {
        if (insertRow(source, state.values)) return { success: true };
        if (query.startsWith("update commerce_fact_batches set status = 'superseded'")) {
          const [updatedAt, providerId, storeId, resourceType, businessDate, currentId] = state.values;
          for (const row of tables.commerce_fact_batches.values()) {
            if (
              row.status === "completed"
              && row.provider_id === providerId
              && row.store_id === storeId
              && row.resource_type === resourceType
              && row.business_date === businessDate
              && row.id !== currentId
            ) {
              row.status = "superseded";
              row.updated_at = updatedAt;
            }
          }
          return { success: true };
        }
        if (query.startsWith("update commerce_fact_batches set status = 'completed'")) {
          const [expectedCount, rowCount, coverage, confidence, completedAt, updatedAt, id] = state.values;
          Object.assign(tables.commerce_fact_batches.get(id), {
            status: "completed",
            expected_count: expectedCount,
            row_count: rowCount,
            coverage,
            confidence,
            completed_at: completedAt,
            updated_at: updatedAt,
            error_code: null
          });
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
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}
