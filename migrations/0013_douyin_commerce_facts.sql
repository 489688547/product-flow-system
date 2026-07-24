ALTER TABLE web_collection_jobs
  ADD COLUMN store_id TEXT NOT NULL DEFAULT '';

ALTER TABLE web_collection_cursors RENAME TO web_collection_cursors_legacy;

CREATE TABLE web_collection_cursors (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL,
  business_date TEXT NOT NULL,
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  batch_id TEXT,
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_id, store_id, resource_type),
  FOREIGN KEY(job_id) REFERENCES web_collection_jobs(id),
  FOREIGN KEY(run_id) REFERENCES web_collection_runs(id)
);

INSERT INTO web_collection_cursors (
  id, provider_id, store_id, resource_type, business_date, job_id, run_id,
  batch_id, completed_at, updated_at
)
SELECT
  id, provider_id, '', resource_type, business_date, job_id, run_id,
  batch_id, completed_at, updated_at
FROM web_collection_cursors_legacy;

DROP TABLE web_collection_cursors_legacy;

CREATE TABLE web_collection_stores (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disabled')),
  runner_id TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_id, store_id),
  FOREIGN KEY(runner_id) REFERENCES web_collection_runners(id)
);

CREATE TABLE commerce_fact_batches (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  business_date TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_version TEXT,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'staging'
    CHECK (status IN ('staging', 'completed', 'superseded', 'failed')),
  expected_count INTEGER,
  row_count INTEGER,
  coverage REAL,
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE commerce_store_daily_facts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  source_version TEXT,
  transaction_amount REAL,
  transaction_order_count INTEGER,
  transaction_buyer_count INTEGER,
  user_payment_amount REAL,
  settlement_amount REAL,
  refund_amount_by_payment_date REAL,
  refund_amount_by_refund_date REAL,
  refund_order_count_by_payment_date INTEGER,
  refund_order_count_by_refund_date INTEGER,
  product_exposure_users INTEGER,
  product_click_users INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES commerce_fact_batches(id)
);

CREATE TABLE commerce_product_daily_facts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sku_id TEXT,
  product_name TEXT,
  sku_name TEXT,
  merchant_code TEXT,
  source_version TEXT,
  exposure_users INTEGER,
  click_users INTEGER,
  transaction_buyers INTEGER,
  transaction_order_count INTEGER,
  transaction_quantity INTEGER,
  transaction_amount REAL,
  user_payment_amount REAL,
  refund_order_count INTEGER,
  refund_quantity INTEGER,
  refund_amount REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES commerce_fact_batches(id)
);

CREATE TABLE commerce_live_daily_facts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  account_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_seconds INTEGER,
  source_version TEXT,
  exposure_users INTEGER,
  entry_users INTEGER,
  viewer_users INTEGER,
  effective_viewer_users INTEGER,
  product_click_users INTEGER,
  add_to_cart_users INTEGER,
  transaction_buyers INTEGER,
  transaction_order_count INTEGER,
  transaction_quantity INTEGER,
  transaction_amount REAL,
  user_payment_amount REAL,
  refund_order_count INTEGER,
  refund_amount REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES commerce_fact_batches(id)
);

CREATE TABLE commerce_video_daily_facts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  video_id TEXT NOT NULL,
  account_id TEXT,
  published_at TEXT,
  title TEXT,
  product_id TEXT,
  material_id TEXT,
  source_version TEXT,
  play_users INTEGER,
  play_count INTEGER,
  effective_play_count INTEGER,
  like_count INTEGER,
  comment_count INTEGER,
  share_count INTEGER,
  product_exposure_count INTEGER,
  product_click_count INTEGER,
  transaction_buyers INTEGER,
  transaction_order_count INTEGER,
  transaction_quantity INTEGER,
  transaction_amount REAL,
  refund_order_count INTEGER,
  refund_amount REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES commerce_fact_batches(id)
);

CREATE INDEX idx_web_collection_jobs_store_date
  ON web_collection_jobs(provider_id, store_id, business_date, status);

CREATE INDEX idx_web_collection_stores_provider
  ON web_collection_stores(provider_id, status, updated_at);

CREATE INDEX idx_commerce_fact_batches_lookup
  ON commerce_fact_batches(provider_id, store_id, resource_type, business_date, status);

CREATE INDEX idx_commerce_store_daily_lookup
  ON commerce_store_daily_facts(provider_id, store_id, business_date);

CREATE INDEX idx_commerce_product_daily_lookup
  ON commerce_product_daily_facts(provider_id, store_id, business_date, product_id);

CREATE INDEX idx_commerce_live_daily_lookup
  ON commerce_live_daily_facts(provider_id, store_id, business_date, live_session_id);

CREATE INDEX idx_commerce_video_daily_lookup
  ON commerce_video_daily_facts(provider_id, store_id, business_date, video_id);
