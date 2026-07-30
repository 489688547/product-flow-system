import {
  collectorRunTrustLevel,
  collectorTemplateContentHash,
  createCollectorTemplateVersion,
  normalizeCollectorRunQuality,
  normalizeCollectorTemplate,
  signCollectorExecutionBundle
} from "../../../../../../src/domain/collectorTemplates.js";
import { routeError } from "./http.js";

const PROVIDER_ORIGINS = Object.freeze({
  kuaimai: Object.freeze(["https://erp.superboss.cc"]),
  "douyin-ecommerce": Object.freeze(["https://compass.jinritemai.com"]),
  qianchuan: Object.freeze(["https://qianchuan.jinritemai.com"])
});
const RUN_ACTIONS = new Set(["start", "complete", "fail", "wait_human", "resume", "cancel"]);
const RUN_TRANSITIONS = Object.freeze({
  queued: Object.freeze({ start: "running", cancel: "cancelled" }),
  running: Object.freeze({
    complete: "completed",
    fail: "failed",
    wait_human: "waiting_human",
    cancel: "cancelled"
  }),
  waiting_human: Object.freeze({ resume: "running", fail: "failed", cancel: "cancelled" })
});

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])])
  );
}

async function requestHash(value) {
  const payload = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)].map(item => item.toString(16).padStart(2, "0")).join("");
}

function allowedOrigins(providerId) {
  const origins = PROVIDER_ORIGINS[String(providerId || "")];
  if (!origins) throw routeError(400, "COLLECTOR_TEMPLATE_PROVIDER_NOT_REGISTERED", "采集模板 Provider 未登记。");
  return origins;
}

function mapTemplate(row) {
  if (!row) return null;
  return {
    templateId: row.id,
    currentVersion: Number(row.current_version),
    mode: row.mode,
    providerId: row.provider_id,
    profileId: row.profile_id,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    templateId: row.template_id,
    version: Number(row.version),
    contentHash: row.content_hash,
    template: parseObject(row.payload),
    status: row.status,
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    createdBy: row.created_by
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    templateId: row.template_id,
    templateVersion: Number(row.template_version),
    contentHash: row.content_hash,
    runnerId: row.runner_id,
    status: row.status,
    trustLevel: row.trust_level,
    quality: parseObject(row.quality),
    version: Number(row.version),
    targetEnvironment: row.target_environment,
    targetEnvironmentVersion: Number(row.target_environment_version),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null
  };
}

function safeSummary(value) {
  const summary = String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 240);
  if (/password|cookie|token|authorization|bearer|验证码/i.test(summary)) {
    return "实验采集运行失败，敏感详情已隐藏。";
  }
  return summary || null;
}

async function templateRow(db, templateId) {
  return db.prepare("SELECT * FROM collector_templates WHERE id = ? LIMIT 1")
    .bind(templateId)
    .first();
}

async function versionRow(db, templateId, version) {
  return db.prepare(`SELECT * FROM collector_template_versions
    WHERE template_id = ? AND version = ? LIMIT 1`)
    .bind(templateId, version)
    .first();
}

async function runRow(db, runId) {
  return db.prepare("SELECT * FROM collector_experimental_runs WHERE id = ? LIMIT 1")
    .bind(runId)
    .first();
}

async function signedExecutionBundle(row, version, verificationKey) {
  const bundle = {
    runId: row.id,
    runnerId: row.runner_id,
    templateId: row.template_id,
    version: Number(row.template_version),
    contentHash: row.content_hash,
    expiresAt: row.expires_at,
    targetEnvironment: row.target_environment,
    targetEnvironmentVersion: Number(row.target_environment_version),
    template: parseObject(version?.payload)
  };
  return {
    ...bundle,
    signature: await signCollectorExecutionBundle(bundle, { verificationKey })
  };
}

export function collectorIdempotencyKey(request) {
  const value = String(request.headers.get("idempotency-key") || "").trim();
  if (!/^[^\s]{8,160}$/.test(value)) {
    throw routeError(400, "COLLECTOR_IDEMPOTENCY_KEY_REQUIRED", "写入操作需要有效的 Idempotency-Key。");
  }
  return value;
}

export async function listCollectorTemplates(db) {
  const result = await db.prepare("SELECT * FROM collector_templates ORDER BY updated_at DESC, id").all();
  return { templates: (result?.results || []).map(mapTemplate) };
}

export async function getCollectorTemplate(db, templateId) {
  const current = await templateRow(db, templateId);
  if (!current) throw routeError(404, "COLLECTOR_TEMPLATE_NOT_FOUND", "采集模板不存在。");
  const versions = await db.prepare(`SELECT * FROM collector_template_versions
    WHERE template_id = ? ORDER BY version DESC`).bind(templateId).all();
  return {
    template: mapTemplate(current),
    versions: (versions?.results || []).map(mapVersion)
  };
}

export async function createCollectorTemplate(db, input, { actor, idempotencyKey, now = new Date().toISOString() }) {
  const normalized = normalizeCollectorTemplate(input, {
    allowedOrigins: allowedOrigins(input?.providerId)
  });
  if (normalized.version !== 1 || normalized.status !== "draft") {
    throw routeError(400, "COLLECTOR_TEMPLATE_INVALID", "新采集模板必须从 draft 版本 1 开始。");
  }
  const contentHash = await collectorTemplateContentHash(normalized);
  const existing = await templateRow(db, normalized.templateId);
  if (existing) {
    if (existing.create_idempotency_key !== idempotencyKey) {
      throw routeError(409, "COLLECTOR_TEMPLATE_ALREADY_EXISTS", "采集模板标识已存在。");
    }
    const detail = await getCollectorTemplate(db, normalized.templateId);
    if (detail.versions.find(item => item.version === 1)?.contentHash !== contentHash) {
      throw routeError(409, "COLLECTOR_IDEMPOTENCY_CONFLICT", "幂等键对应的采集模板请求内容不同。");
    }
    return { ...detail, version: detail.versions.find(item => item.version === 1), idempotentReplay: true };
  }
  await db.batch([
    db.prepare(`INSERT INTO collector_templates
      (id, current_version, mode, provider_id, profile_id, status, create_idempotency_key,
        last_idempotency_key, created_at, created_by, updated_at, updated_by)
      VALUES (?, 1, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`).bind(
      normalized.templateId, normalized.mode, normalized.providerId, normalized.profileId,
      idempotencyKey, idempotencyKey, now, actor.actor, now, actor.actor
    ),
    db.prepare(`INSERT INTO collector_template_versions
      (template_id, version, content_hash, payload, status, idempotency_key,
        published_at, created_at, created_by)
      VALUES (?, 1, ?, ?, 'draft', ?, NULL, ?, ?)`).bind(
      normalized.templateId, contentHash, JSON.stringify(normalized), idempotencyKey, now, actor.actor
    )
  ]);
  return {
    template: mapTemplate(await templateRow(db, normalized.templateId)),
    version: mapVersion(await versionRow(db, normalized.templateId, 1)),
    idempotentReplay: false
  };
}

export async function appendCollectorTemplateVersion(db, templateId, {
  expectedVersion,
  patch,
  actor,
  idempotencyKey,
  now = new Date().toISOString()
}) {
  const replay = await db.prepare(`SELECT * FROM collector_template_versions
    WHERE idempotency_key = ? LIMIT 1`).bind(idempotencyKey).first();
  if (replay) {
    if (
      replay.template_id !== templateId
      || Number(expectedVersion) !== Number(replay.version) - 1
    ) {
      throw routeError(409, "COLLECTOR_IDEMPOTENCY_CONFLICT", "幂等键已用于其他采集模板操作。");
    }
    const previous = await versionRow(db, templateId, Number(replay.version) - 1);
    const candidate = createCollectorTemplateVersion(parseObject(previous?.payload), patch, {
      actor: { role: actor.role, userId: actor.userId },
      allowedOrigins: allowedOrigins(previous?.provider_id || parseObject(previous?.payload).providerId)
    });
    if (await collectorTemplateContentHash(candidate) !== replay.content_hash) {
      throw routeError(409, "COLLECTOR_IDEMPOTENCY_CONFLICT", "幂等键对应的采集模板请求内容不同。");
    }
    return {
      template: mapTemplate(await templateRow(db, templateId)),
      version: mapVersion(replay),
      idempotentReplay: true
    };
  }
  const current = await templateRow(db, templateId);
  if (!current) throw routeError(404, "COLLECTOR_TEMPLATE_NOT_FOUND", "采集模板不存在。");
  if (Number(current.current_version) !== Number(expectedVersion)) {
    throw routeError(409, "COLLECTOR_TEMPLATE_VERSION_CONFLICT", "采集模板已更新，请刷新后重试。");
  }
  const currentVersion = await versionRow(db, templateId, expectedVersion);
  const next = createCollectorTemplateVersion(parseObject(currentVersion.payload), patch, {
    actor: { role: actor.role, userId: actor.userId },
    allowedOrigins: allowedOrigins(current.provider_id)
  });
  const contentHash = await collectorTemplateContentHash(next);
  await db.batch([
    db.prepare(`INSERT INTO collector_template_versions
      (template_id, version, content_hash, payload, status, idempotency_key,
        published_at, created_at, created_by)
      VALUES (?, ?, ?, ?, 'draft', ?, NULL, ?, ?)`).bind(
      templateId, next.version, contentHash, JSON.stringify(next), idempotencyKey, now, actor.actor
    ),
    db.prepare(`UPDATE collector_templates SET current_version = ?, mode = ?, provider_id = ?,
      profile_id = ?, status = 'draft', last_idempotency_key = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND current_version = ?`).bind(
      next.version, next.mode, next.providerId, next.profileId, idempotencyKey,
      now, actor.actor, templateId, expectedVersion
    )
  ]);
  return {
    template: mapTemplate(await templateRow(db, templateId)),
    version: mapVersion(await versionRow(db, templateId, next.version)),
    idempotentReplay: false
  };
}

export async function publishCollectorTemplate(db, templateId, {
  expectedVersion,
  actor,
  idempotencyKey,
  now = new Date().toISOString()
}) {
  const replay = await db.prepare(`SELECT * FROM collector_template_versions
    WHERE publish_idempotency_key = ? LIMIT 1`).bind(idempotencyKey).first();
  if (replay) {
    if (replay.template_id !== templateId || Number(replay.version) !== Number(expectedVersion)) {
      throw routeError(409, "COLLECTOR_IDEMPOTENCY_CONFLICT", "幂等键已用于其他采集模板发布。");
    }
    return { ...(await getCollectorTemplate(db, templateId)), idempotentReplay: true };
  }
  const current = await templateRow(db, templateId);
  if (!current) throw routeError(404, "COLLECTOR_TEMPLATE_NOT_FOUND", "采集模板不存在。");
  if (Number(current.current_version) !== Number(expectedVersion)) {
    throw routeError(409, "COLLECTOR_TEMPLATE_VERSION_CONFLICT", "采集模板已更新，请刷新后重试。");
  }
  if (current.status === "published") {
    throw routeError(409, "COLLECTOR_TEMPLATE_STATE_CONFLICT", "采集模板当前版本已经发布。");
  }
  const version = await versionRow(db, templateId, expectedVersion);
  const draft = parseObject(version.payload);
  if (draft.mode !== "formal") {
    throw routeError(
      409,
      "COLLECTOR_TEMPLATE_PROMOTION_REQUIRED",
      "实验模板必须先改版为无自由脚本的正式模板，才能发布。"
    );
  }
  const published = normalizeCollectorTemplate({ ...draft, status: "published" }, {
    allowedOrigins: allowedOrigins(draft.providerId)
  });
  await db.batch([
    db.prepare(`UPDATE collector_template_versions SET status = 'published', payload = ?,
      publish_idempotency_key = ?, published_at = ?
      WHERE template_id = ? AND version = ? AND status = 'draft'`).bind(
      JSON.stringify(published), idempotencyKey, now, templateId, expectedVersion
    ),
    db.prepare(`UPDATE collector_templates SET status = 'published', last_idempotency_key = ?,
      updated_at = ?, updated_by = ? WHERE id = ? AND current_version = ?`).bind(
      idempotencyKey, now, actor.actor, templateId, expectedVersion
    )
  ]);
  return { ...(await getCollectorTemplate(db, templateId)), idempotentReplay: false };
}

export async function createExperimentalRun(db, input, {
  actor,
  target = { environmentId: "production", environmentVersion: 1 },
  idempotencyKey,
  now = new Date()
}) {
  const replay = await db.prepare(`SELECT * FROM collector_experimental_runs
    WHERE idempotency_key = ? LIMIT 1`).bind(idempotencyKey).first();
  const templateId = String(input?.templateId || "");
  const templateVersion = Number(input?.templateVersion);
  const runnerId = String(input?.runnerId || "");
  if (replay) {
    if (
      replay.template_id !== templateId
      || Number(replay.template_version) !== templateVersion
      || replay.runner_id !== runnerId
    ) {
      throw routeError(409, "COLLECTOR_IDEMPOTENCY_CONFLICT", "幂等键对应的实验运行请求内容不同。");
    }
    const replayVersion = await versionRow(db, replay.template_id, replay.template_version);
    const replayRunner = await db.prepare(`SELECT token_hash FROM web_collection_runners
      WHERE id = ? AND status = 'active' LIMIT 1`).bind(replay.runner_id).first();
    if (!replayRunner?.token_hash) {
      throw routeError(409, "WEB_COLLECTION_RUNNER_REQUIRED", "指定的公司采集器未登记或已停用。");
    }
    return {
      run: mapRun(replay),
      executionBundle: await signedExecutionBundle(replay, replayVersion, replayRunner.token_hash),
      idempotentReplay: true
    };
  }
  const version = await versionRow(db, templateId, templateVersion);
  if (!version) throw routeError(404, "COLLECTOR_TEMPLATE_VERSION_NOT_FOUND", "采集模板版本不存在。");
  const runner = await db.prepare(`SELECT id, token_hash FROM web_collection_runners
    WHERE id = ? AND status = 'active' LIMIT 1`).bind(runnerId).first();
  if (!runner) throw routeError(409, "WEB_COLLECTION_RUNNER_REQUIRED", "指定的公司采集器未登记或已停用。");
  const template = parseObject(version.payload);
  if (template.mode !== "experimental") {
    throw routeError(409, "COLLECTOR_RUN_MODE_INVALID", "该接口只创建实验采集运行。");
  }
  const runId = randomId("collector-run");
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.valueOf() + 15 * 60 * 1000).toISOString();
  await db.prepare(`INSERT INTO collector_experimental_runs
    (id, template_id, template_version, content_hash, runner_id, status, trust_level,
      quality, version, target_environment, target_environment_version, idempotency_key,
      expires_at, created_at, created_by, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?, 'queued', 'untrusted', '{}', 1, ?, ?, ?, ?, ?, ?, ?, NULL)`).bind(
    runId, templateId, templateVersion, version.content_hash, runnerId,
    target.environmentId, target.environmentVersion, idempotencyKey,
    expiresAt, createdAt, actor.actor, createdAt
  ).run();
  const savedRun = await runRow(db, runId);
  return {
    run: mapRun(savedRun),
    executionBundle: await signedExecutionBundle(savedRun, version, runner.token_hash),
    idempotentReplay: false
  };
}

export async function getExperimentalRun(db, runId) {
  const row = await runRow(db, runId);
  if (!row) throw routeError(404, "COLLECTOR_RUN_NOT_FOUND", "实验采集运行不存在。");
  return { run: mapRun(row) };
}

export async function listExperimentalRunsForRunner(db, runner, {
  now = new Date()
} = {}) {
  const result = await db.prepare(`SELECT * FROM collector_experimental_runs
    WHERE runner_id = ? AND status IN ('queued', 'running')
    ORDER BY created_at, id`).bind(runner.id).all();
  const active = [];
  for (const row of result?.results || []) {
    if (row.status === "queued" && Date.parse(row.expires_at) <= now.valueOf()) continue;
    const version = await versionRow(db, row.template_id, row.template_version);
    if (!version) continue;
    active.push({
      run: mapRun(row),
      executionBundle: await signedExecutionBundle(row, version, runner.verificationKey)
    });
    if (active.length >= 10) break;
  }
  return { runs: active };
}

export async function applyExperimentalRunAction(db, runId, input, {
  runner,
  idempotencyKey,
  now = new Date().toISOString()
}) {
  const action = String(input?.action || "");
  if (!RUN_ACTIONS.has(action)) throw routeError(400, "COLLECTOR_RUN_ACTION_INVALID", "实验采集运行操作无效。");
  const normalizedInput = {
    action,
    expectedVersion: Number(input?.expectedVersion),
    ...(action === "complete" ? { quality: normalizeCollectorRunQuality(input.quality || {}) } : {}),
    ...(["fail", "wait_human"].includes(action) ? {
      errorCode: String(
        input.errorCode
        || (action === "wait_human" ? "COLLECTOR_HUMAN_ACTION_REQUIRED" : "COLLECTOR_EXPERIMENT_FAILED")
      ).slice(0, 80),
      safeSummary: safeSummary(input.safeSummary)
    } : {})
  };
  const normalizedRequestHash = await requestHash(normalizedInput);
  const replay = await db.prepare(`SELECT * FROM collector_experimental_run_events
    WHERE idempotency_key = ? LIMIT 1`).bind(idempotencyKey).first();
  if (replay) {
    if (
      replay.run_id !== runId
      || replay.action !== action
      || replay.request_hash !== normalizedRequestHash
    ) {
      throw routeError(409, "COLLECTOR_IDEMPOTENCY_CONFLICT", "幂等键已用于其他实验运行操作。");
    }
    return { ...(await getExperimentalRun(db, runId)), idempotentReplay: true };
  }
  const current = await runRow(db, runId);
  if (!current) throw routeError(404, "COLLECTOR_RUN_NOT_FOUND", "实验采集运行不存在。");
  if (current.runner_id !== runner.id) {
    throw routeError(403, "COLLECTOR_RUN_RUNNER_MISMATCH", "实验采集运行不属于当前采集器。");
  }
  if (Number(current.version) !== Number(input?.expectedVersion)) {
    throw routeError(409, "COLLECTOR_RUN_VERSION_CONFLICT", "实验采集运行已更新，请刷新后重试。");
  }
  const nextStatus = RUN_TRANSITIONS[current.status]?.[action];
  if (!nextStatus) throw routeError(409, "COLLECTOR_RUN_STATE_CONFLICT", "实验采集运行当前状态不允许该操作。");
  const quality = normalizedInput.quality || {};
  const template = parseObject((await versionRow(db, current.template_id, current.template_version)).payload);
  const trustLevel = action === "complete"
    ? collectorRunTrustLevel({ template, quality, ingestCompleted: false })
    : "untrusted";
  const nextVersion = Number(current.version) + 1;
  const completedAt = ["completed", "failed", "cancelled"].includes(nextStatus) ? now : null;
  const errorCode = ["fail", "wait_human"].includes(action) ? normalizedInput.errorCode : null;
  const summary = ["fail", "wait_human"].includes(action) ? normalizedInput.safeSummary : null;
  const eventId = randomId("collector-event");
  await db.batch([
    db.prepare(`UPDATE collector_experimental_runs SET status = ?, trust_level = ?, quality = ?,
      version = ?, updated_at = ?, completed_at = ?
      WHERE id = ? AND version = ?`).bind(
      nextStatus, trustLevel, JSON.stringify(quality), nextVersion, now, completedAt,
      runId, current.version
    ),
    db.prepare(`INSERT INTO collector_experimental_run_events
      (id, run_id, action, from_status, to_status, expected_version, result_version,
        idempotency_key, request_hash, error_code, safe_summary, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      eventId, runId, action, current.status, nextStatus, current.version, nextVersion,
      idempotencyKey, normalizedRequestHash, errorCode, summary, now, runner.id
    )
  ]);
  return { ...(await getExperimentalRun(db, runId)), idempotentReplay: false };
}
