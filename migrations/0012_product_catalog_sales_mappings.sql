CREATE TABLE IF NOT EXISTS product_catalog_sales_mappings (
  code TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES product_catalog_items(id)
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_sales_mappings_product
  ON product_catalog_sales_mappings(product_id, active);

CREATE TABLE IF NOT EXISTS product_catalog_sales_mapping_audit (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  product_id TEXT NOT NULL,
  action TEXT NOT NULL,
  version INTEGER NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_sales_mapping_audit_code
  ON product_catalog_sales_mapping_audit(code, created_at DESC);
