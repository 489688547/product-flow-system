CREATE TABLE IF NOT EXISTS product_catalog_components (
  id TEXT PRIMARY KEY,
  parent_item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  component_code TEXT,
  ratio INTEGER NOT NULL,
  payload TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_components_parent ON product_catalog_components(parent_item_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_product_catalog_components_code ON product_catalog_components(component_code);
