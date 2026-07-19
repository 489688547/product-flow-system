export async function ensureAiAuditTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_usage_audit (
    request_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    user_id TEXT NOT NULL,
    department TEXT,
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    allowed_domains TEXT NOT NULL DEFAULT '[]',
    blocked_domains TEXT NOT NULL DEFAULT '[]',
    domain_counts TEXT NOT NULL DEFAULT '{}',
    source_freshness TEXT NOT NULL DEFAULT '{}',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    result_code TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_request_leases (
    user_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_skill_audit (
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
  )`).run();
}

export async function writeAiSkillAudit(db, record = {}) {
  await ensureAiAuditTables(db);
  const argumentSummary = safeStringList(record.argumentSummary).slice(0, 20);
  await db.prepare(`INSERT INTO ai_skill_audit
    (request_id, call_id, skill_id, app_id, argument_summary, result_count, latency_ms, result_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      String(record.requestId || "").slice(0, 120),
      String(record.callId || "").slice(0, 120),
      String(record.skillId || "").slice(0, 120),
      String(record.appId || "unknown").slice(0, 80),
      JSON.stringify(argumentSummary),
      Math.max(0, Number(record.resultCount) || 0),
      Math.max(0, Number(record.latencyMs) || 0),
      String(record.resultCode || "AI_SKILL_UNKNOWN").slice(0, 80),
      String(record.createdAt || new Date().toISOString()).slice(0, 40)
    )
    .run();
}

export async function acquireAiLease(db, userId, requestId, now = Date.now()) {
  await ensureAiAuditTables(db);
  await db.prepare("DELETE FROM ai_request_leases WHERE expires_at <= ?")
    .bind(new Date(now).toISOString())
    .run();
  try {
    await db.prepare("INSERT INTO ai_request_leases (user_id, request_id, expires_at) VALUES (?, ?, ?)")
      .bind(String(userId).slice(0, 120), String(requestId).slice(0, 120), new Date(now + 60_000).toISOString())
      .run();
    return true;
  } catch {
    return false;
  }
}

export async function releaseAiLease(db, userId, requestId) {
  await db.prepare("DELETE FROM ai_request_leases WHERE user_id = ? AND request_id = ?")
    .bind(String(userId).slice(0, 120), String(requestId).slice(0, 120))
    .run();
}

function safeStringList(value) {
  return (Array.isArray(value) ? value : []).map(item => String(item).slice(0, 80)).slice(0, 50);
}

function safeCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 50)
    .map(([key, count]) => [String(key).slice(0, 80), Math.max(0, Number(count) || 0)]));
}

export async function writeAiAudit(db, record = {}) {
  await ensureAiAuditTables(db);
  const allowedDomains = safeStringList(record.allowedDomains || record.domains);
  const blockedDomains = safeStringList(record.blockedDomains);
  const domainCounts = safeCounts(record.domainCounts);
  const sourceFreshness = Object.fromEntries(Object.entries(record.sourceFreshness || {}).slice(0, 50)
    .map(([key, value]) => [String(key).slice(0, 80), String(value || "").slice(0, 40)]));
  await db.prepare(`INSERT INTO ai_usage_audit
    (request_id, created_at, user_id, department, provider_id, model, allowed_domains,
     blocked_domains, domain_counts, source_freshness, input_tokens, output_tokens,
     latency_ms, result_code, completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      String(record.requestId || "").slice(0, 120),
      String(record.createdAt || new Date().toISOString()).slice(0, 40),
      String(record.userId || "unknown").slice(0, 120),
      String(record.department || "").slice(0, 80),
      String(record.providerId || "").slice(0, 80),
      String(record.model || "").slice(0, 120),
      JSON.stringify(allowedDomains),
      JSON.stringify(blockedDomains),
      JSON.stringify(domainCounts),
      JSON.stringify(sourceFreshness),
      Math.max(0, Number(record.inputTokens) || 0),
      Math.max(0, Number(record.outputTokens) || 0),
      Math.max(0, Number(record.latencyMs) || 0),
      String(record.resultCode || "AI_UNKNOWN").slice(0, 80),
      record.completed === true || record.streamInterrupted === false ? 1 : 0
    )
    .run();
}
