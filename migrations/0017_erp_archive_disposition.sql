ALTER TABLE erp_file_archives
  ADD COLUMN ingestion_decision TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE erp_file_archives
  ADD COLUMN ingestion_reason_code TEXT;

ALTER TABLE erp_file_archives
  ADD COLUMN decision_at TEXT;

ALTER TABLE erp_file_archives
  ADD COLUMN decision_by TEXT;

ALTER TABLE erp_file_archives
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_erp_file_archives_decision_status
  ON erp_file_archives(ingestion_decision, status, archived_at DESC);
