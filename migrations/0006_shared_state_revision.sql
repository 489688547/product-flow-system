CREATE TABLE IF NOT EXISTS product_flow_state (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS product_flow_state_parts (
  state_id TEXT NOT NULL,
  part_key TEXT NOT NULL,
  part_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (state_id, part_key, part_index)
);

-- Older deployments stored only the sharded rows. Preserve them and add the
-- manifest revision used by the atomic compare-and-set write transaction.
INSERT OR IGNORE INTO product_flow_state (id, version, payload, updated_at, updated_by)
SELECT 'company', 'unknown', '{}', updated_at, updated_by
FROM product_flow_state_parts
WHERE state_id = 'company'
ORDER BY part_key, part_index
LIMIT 1;
