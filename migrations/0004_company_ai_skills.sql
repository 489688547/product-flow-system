CREATE TABLE IF NOT EXISTS ai_skill_audit (
  request_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  argument_summary TEXT NOT NULL DEFAULT '[]',
  result_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  result_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, call_id)
);

CREATE INDEX IF NOT EXISTS ai_skill_audit_created_at ON ai_skill_audit(created_at);
CREATE INDEX IF NOT EXISTS ai_skill_audit_skill_id ON ai_skill_audit(skill_id);
