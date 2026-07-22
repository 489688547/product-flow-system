ALTER TABLE ai_usage_audit ADD COLUMN app_id TEXT NOT NULL DEFAULT 'company-ai-assistant';
ALTER TABLE ai_usage_audit ADD COLUMN feature_id TEXT NOT NULL DEFAULT 'assistant-chat';
ALTER TABLE ai_usage_audit ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'model';
ALTER TABLE ai_usage_audit ADD COLUMN provider_called INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS ai_usage_audit_feature_range
  ON ai_usage_audit(created_at, app_id, feature_id);
