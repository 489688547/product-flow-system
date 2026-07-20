CREATE TABLE IF NOT EXISTS goods_flow_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  sku_id TEXT,
  warehouse_id TEXT,
  supplier_id TEXT,
  purchase_id TEXT,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  source_version TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  UNIQUE(source, source_reference, source_version)
);

CREATE TABLE IF NOT EXISTS goods_flow_inventory_daily (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  product_id TEXT,
  sku_id TEXT NOT NULL,
  sku_code TEXT,
  warehouse_id TEXT NOT NULL,
  erp_quantity REAL NOT NULL DEFAULT 0,
  counted_quantity REAL,
  calibrated_quantity REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  calibrated_inventory_value REAL NOT NULL DEFAULT 0,
  sellable_quantity REAL,
  days_of_supply REAL,
  age_bucket TEXT,
  inventory_cash_tied REAL,
  stocktake_id TEXT,
  stocktake_status TEXT NOT NULL DEFAULT 'unverified',
  source_updated_at TEXT,
  confidence TEXT NOT NULL DEFAULT 'insufficient',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(snapshot_date, sku_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS goods_flow_stocktakes (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  counted_at TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  source_reference TEXT,
  submitted_by TEXT,
  difference_confirmed_by TEXT,
  amount_confirmed_by TEXT,
  corrected_from_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goods_flow_stocktake_lines (
  stocktake_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  erp_quantity REAL NOT NULL DEFAULT 0,
  counted_quantity REAL NOT NULL DEFAULT 0,
  quantity_variance REAL NOT NULL DEFAULT 0,
  unit_cost REAL,
  amount_variance REAL,
  reason TEXT,
  PRIMARY KEY(stocktake_id, sku_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS goods_flow_receivable_terms (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  days INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  reason TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goods_flow_ccc_monthly (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  version INTEGER NOT NULL,
  formula_version TEXT NOT NULL,
  ccc_days REAL,
  inventory_days REAL,
  receivable_days REAL,
  payable_days REAL,
  stockout_rate REAL,
  inventory_cash_tied REAL,
  coverage TEXT NOT NULL,
  confidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source_updated_at TEXT,
  calculated_at TEXT NOT NULL,
  calculated_by TEXT,
  frozen_at TEXT,
  frozen_by TEXT,
  UNIQUE(month, version)
);

CREATE TABLE IF NOT EXISTS goods_flow_exceptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner_department TEXT,
  entity_type TEXT,
  entity_id TEXT,
  source TEXT,
  source_reference TEXT,
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_goods_flow_events_source
  ON goods_flow_events(source, source_reference, occurred_at);
CREATE INDEX IF NOT EXISTS idx_goods_flow_inventory_sku_date
  ON goods_flow_inventory_daily(sku_id, warehouse_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_goods_flow_stocktakes_warehouse_date
  ON goods_flow_stocktakes(warehouse_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_goods_flow_terms_platform_date
  ON goods_flow_receivable_terms(platform, effective_from DESC, effective_to);
CREATE INDEX IF NOT EXISTS idx_goods_flow_ccc_month
  ON goods_flow_ccc_monthly(month, version DESC);
CREATE INDEX IF NOT EXISTS idx_goods_flow_exceptions_status
  ON goods_flow_exceptions(status, severity, owner_department);
