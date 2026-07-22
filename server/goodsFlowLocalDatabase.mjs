const TABLE_NAMES = [
  "goods_flow_events",
  "goods_flow_inventory_daily",
  "goods_flow_stocktakes",
  "goods_flow_stocktake_lines",
  "goods_flow_receivable_terms",
  "goods_flow_ccc_monthly",
  "goods_flow_exceptions",
  "product_catalog_items",
  "product_catalog_skus",
  "product_catalog_components",
  "product_catalog_sync_runs",
  "product_catalog_meta"
];

function rowForInsert(table, values) {
  if (table === "goods_flow_events") {
    const [id, event_type, sku_id, warehouse_id, supplier_id, purchase_id, occurred_at, source, source_reference, source_version, payload, created_at, created_by] = values;
    return { id, event_type, sku_id, warehouse_id, supplier_id, purchase_id, occurred_at, source, source_reference, source_version, payload, created_at, created_by };
  }
  if (table === "goods_flow_inventory_daily") {
    const [id, snapshot_date, product_id, sku_id, sku_code, warehouse_id, erp_quantity, counted_quantity, calibrated_quantity, unit_cost, calibrated_inventory_value, sellable_quantity, days_of_supply, age_bucket, inventory_cash_tied, stocktake_id, stocktake_status, source_updated_at, confidence, created_at, updated_at] = values;
    return { id, snapshot_date, product_id, sku_id, sku_code, warehouse_id, erp_quantity, counted_quantity, calibrated_quantity, unit_cost, calibrated_inventory_value, sellable_quantity, days_of_supply, age_bucket, inventory_cash_tied, stocktake_id, stocktake_status, source_updated_at, confidence, created_at, updated_at };
  }
  if (table === "goods_flow_receivable_terms") {
    const [id, platform, days, effective_from, effective_to, reason, version, created_at, created_by] = values;
    return { id, platform, days, effective_from, effective_to, reason, version, created_at, created_by };
  }
  if (table === "goods_flow_stocktakes") {
    const [id, warehouse_id, counted_at, status, version, source, source_reference, submitted_by, difference_confirmed_by, amount_confirmed_by, corrected_from_id, created_at, updated_at] = values;
    return { id, warehouse_id, counted_at, status, version, source, source_reference, submitted_by, difference_confirmed_by, amount_confirmed_by, corrected_from_id, created_at, updated_at };
  }
  if (table === "goods_flow_stocktake_lines") {
    const [stocktake_id, sku_id, warehouse_id, erp_quantity, counted_quantity, quantity_variance, unit_cost, amount_variance, reason] = values;
    return { stocktake_id, sku_id, warehouse_id, erp_quantity, counted_quantity, quantity_variance, unit_cost, amount_variance, reason };
  }
  if (table === "goods_flow_ccc_monthly") {
    const [id, month, version, formula_version, ccc_days, inventory_days, receivable_days, payable_days, stockout_rate, inventory_cash_tied, coverage, confidence, status, source_updated_at, calculated_at, calculated_by, frozen_at, frozen_by] = values;
    return { id, month, version, formula_version, ccc_days, inventory_days, receivable_days, payable_days, stockout_rate, inventory_cash_tied, coverage, confidence, status, source_updated_at, calculated_at, calculated_by, frozen_at, frozen_by };
  }
  if (table === "goods_flow_exceptions") {
    const [id, code, severity, status, owner_department, entity_type, entity_id, source, source_reference, message, details, created_at, updated_at, resolved_at, resolved_by] = values;
    return { id, code, severity, status, owner_department, entity_type, entity_id, source, source_reference, message, details, created_at, updated_at, resolved_at, resolved_by };
  }
  if (table === "product_catalog_items") {
    const [id, source, source_product_id, merchant_code, name, payload, active, present_in_source, synced_at, updated_at, updated_by] = values;
    return { id, source, source_product_id, merchant_code, name, payload, active, present_in_source, synced_at, updated_at, updated_by };
  }
  if (table === "product_catalog_skus") {
    const [id, item_id, source, source_sku_id, merchant_sku_code, barcode, payload, active, synced_at, updated_at, updated_by] = values;
    return { id, item_id, source, source_sku_id, merchant_sku_code, barcode, payload, active, synced_at, updated_at, updated_by };
  }
  if (table === "product_catalog_components") {
    const [id, parent_item_id, source, component_code, ratio, payload, synced_at, updated_at, updated_by] = values;
    return { id, parent_item_id, source, component_code, ratio, payload, synced_at, updated_at, updated_by };
  }
  if (table === "product_catalog_sync_runs") {
    const [id, source, mode, status, payload, started_at, completed_at, updated_by] = values;
    return { id, source, mode, status, payload, started_at, completed_at, updated_by };
  }
  if (table === "product_catalog_meta") {
    const [key, value] = values;
    return { key, value };
  }
  throw new Error(`Unsupported insert table ${table}`);
}

function keyFor(table, row) {
  if (table === "goods_flow_events") return `${row.source}:${row.source_reference}:${row.source_version}`;
  if (table === "goods_flow_inventory_daily") return `${row.snapshot_date}:${row.sku_id}:${row.warehouse_id}`;
  if (table === "goods_flow_stocktake_lines") return `${row.stocktake_id}:${row.sku_id}:${row.warehouse_id}`;
  if (table === "goods_flow_ccc_monthly") return `${row.month}:${row.version}`;
  if (table === "product_catalog_meta") return row.key;
  return row.id;
}

export function createGoodsFlowLocalDatabase(snapshot = {}) {
  const tables = Object.fromEntries(TABLE_NAMES.map(name => [name, new Map()]));
  for (const name of TABLE_NAMES) {
    for (const row of Array.isArray(snapshot[name]) ? snapshot[name] : []) tables[name].set(keyFor(name, row), row);
  }
  return {
    tables,
    snapshot() {
      return Object.fromEntries(TABLE_NAMES.map(name => [name, [...tables[name].values()]]));
    },
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          if (/^create (table|index)/.test(normalized)) return { success: true, meta: { changes: 0 } };
          const deleteComponents = normalized.match(/^delete from product_catalog_components where parent_item_id = \?/);
          if (deleteComponents) {
            let changes = 0;
            for (const [key, row] of tables.product_catalog_components) {
              if (row.parent_item_id !== statement.values[0]) continue;
              tables.product_catalog_components.delete(key);
              changes += 1;
            }
            return { success: true, meta: { changes } };
          }
          if (/^update product_catalog_items set present_in_source = 0/.test(normalized)) {
            let changes = 0;
            for (const [key, row] of tables.product_catalog_items) {
              if (row.source !== statement.values[0] || row.synced_at === statement.values[1]) continue;
              tables.product_catalog_items.set(key, { ...row, present_in_source: 0 });
              changes += 1;
            }
            return { success: true, meta: { changes } };
          }
          const insert = normalized.match(/^insert into ((?:goods_flow|product_catalog)_[a-z_]+)/);
          if (!insert) throw new Error(`Unsupported local goods-flow SQL: ${normalized}`);
          const table = insert[1];
          const row = rowForInsert(table, statement.values);
          const key = keyFor(table, row);
          if (table === "goods_flow_events" && tables[table].has(key)) return { success: true, meta: { changes: 0 } };
          tables[table].set(key, row);
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          const from = normalized.match(/ from ((?:goods_flow|product_catalog)_[a-z_]+)/);
          if (!from) throw new Error(`Unsupported local goods-flow SQL: ${normalized}`);
          let results = [...tables[from[1]].values()];
          if (normalized.includes("where platform = ?")) results = results.filter(row => row.platform === statement.values[0]);
          if (normalized.includes("where snapshot_date <= ?")) results = results.filter(row => row.snapshot_date <= statement.values[0]);
          if (normalized.includes("where month = ?")) results = results.filter(row => row.month === statement.values[0]);
          if (normalized.includes("where id = ?")) results = results.filter(row => row.id === statement.values[0]);
          if (normalized.includes("where stocktake_id = ?")) results = results.filter(row => row.stocktake_id === statement.values[0]);
          if (normalized.includes("where key = ?")) results = results.filter(row => row.key === statement.values[0]);
          return { results };
        },
        async first() {
          return (await statement.all()).results[0] || null;
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}
