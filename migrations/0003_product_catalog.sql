CREATE TABLE IF NOT EXISTS product_catalog_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_product_id TEXT,
  merchant_code TEXT,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  present_in_source INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_items_source ON product_catalog_items(source, active, present_in_source);
CREATE INDEX IF NOT EXISTS idx_product_catalog_items_merchant_code ON product_catalog_items(merchant_code);

CREATE TABLE IF NOT EXISTS product_catalog_skus (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_sku_id TEXT,
  merchant_sku_code TEXT,
  barcode TEXT,
  payload TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_skus_item ON product_catalog_skus(item_id, active);
CREATE INDEX IF NOT EXISTS idx_product_catalog_skus_barcode ON product_catalog_skus(barcode);
CREATE INDEX IF NOT EXISTS idx_product_catalog_skus_merchant_code ON product_catalog_skus(merchant_sku_code);

CREATE TABLE IF NOT EXISTS product_catalog_sync_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_sync_runs_started ON product_catalog_sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS product_catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
