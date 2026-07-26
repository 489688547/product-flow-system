CREATE TABLE IF NOT EXISTS goods_flow_inventory_daily_stage (
  projection_id TEXT NOT NULL,
  id TEXT NOT NULL,
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
  PRIMARY KEY(projection_id, snapshot_date, sku_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_goods_flow_inventory_stage_projection
  ON goods_flow_inventory_daily_stage(projection_id, snapshot_date);
