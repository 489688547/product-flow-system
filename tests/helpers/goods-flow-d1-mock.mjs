function tableMaps() {
  return {
    goods_flow_events: new Map(),
    goods_flow_inventory_daily: new Map(),
    goods_flow_stocktakes: new Map(),
    goods_flow_stocktake_lines: new Map(),
    goods_flow_receivable_terms: new Map(),
    goods_flow_ccc_monthly: new Map(),
    goods_flow_exceptions: new Map()
  };
}

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
  throw new Error(`Unsupported insert table ${table}`);
}

function keyFor(table, row) {
  if (table === "goods_flow_events") return `${row.source}:${row.source_reference}:${row.source_version}`;
  if (table === "goods_flow_inventory_daily") return `${row.snapshot_date}:${row.sku_id}:${row.warehouse_id}`;
  if (table === "goods_flow_stocktake_lines") return `${row.stocktake_id}:${row.sku_id}:${row.warehouse_id}`;
  if (table === "goods_flow_ccc_monthly") return `${row.month}:${row.version}`;
  return row.id;
}

export function createGoodsFlowD1Mock() {
  const tables = tableMaps();
  return {
    tables,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          const insert = normalized.match(/^insert into (goods_flow_[a-z_]+)/);
          if (!insert) throw new Error(`Unsupported run SQL: ${normalized}`);
          const table = insert[1];
          const row = rowForInsert(table, statement.values);
          const key = keyFor(table, row);
          if (table === "goods_flow_events" && tables[table].has(key)) return { success: true, meta: { changes: 0 } };
          tables[table].set(key, row);
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          const from = normalized.match(/ from (goods_flow_[a-z_]+)/);
          if (!from) throw new Error(`Unsupported all SQL: ${normalized}`);
          let results = [...tables[from[1]].values()];
          if (normalized.includes("where platform = ?")) results = results.filter(row => row.platform === statement.values[0]);
          if (normalized.includes("where snapshot_date <= ?")) results = results.filter(row => row.snapshot_date <= statement.values[0]);
          if (normalized.includes("where month = ?")) results = results.filter(row => row.month === statement.values[0]);
          if (normalized.includes("where id = ?")) results = results.filter(row => row.id === statement.values[0]);
          if (normalized.includes("where stocktake_id = ?")) results = results.filter(row => row.stocktake_id === statement.values[0]);
          return { results };
        },
        async first() {
          const result = await statement.all();
          return result.results[0] || null;
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}
