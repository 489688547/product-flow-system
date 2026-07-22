import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAiD1Mock } from "./helpers/ai-d1-mock.mjs";
import { writeAiAudit } from "../functions/api/platform/v1/ai/_shared/audit.js";

const featureRegistryUrl = new URL("../functions/api/platform/v1/ai/_shared/feature-registry.js", import.meta.url);
const migrationUrl = new URL("../migrations/0009_ai_model_governance.sql", import.meta.url);

test("AI model governance migration adds attribution without rewriting audit content", () => {
  const migration = readFileSync(migrationUrl, "utf8");
  assert.match(migration, /add column app_id text not null default 'company-ai-assistant'/i);
  assert.match(migration, /add column feature_id text not null default 'assistant-chat'/i);
  assert.match(migration, /add column execution_mode text not null default 'model'/i);
  assert.match(migration, /add column provider_called integer not null default 1/i);
  assert.match(migration, /create index if not exists ai_usage_audit_feature_range/i);
  assert.doesNotMatch(migration, /\bupdate\s+ai_usage_audit\b|\bdelete\s+from\s+ai_usage_audit\b/i);
});

test("AI feature registry accepts only registered server identities", async () => {
  const { getAiFeatureDefinition, listAiFeatureDefinitions } = await import(featureRegistryUrl);
  const companyAssistant = getAiFeatureDefinition("company-ai-assistant", "assistant-chat");
  const operationsReview = getAiFeatureDefinition("ecommerce-operations", "plan-review");

  assert.equal(companyAssistant.featureName, "对话分析");
  assert.equal(companyAssistant.supportsSkills, true);
  assert.equal(operationsReview.featureName, "方案点评");
  assert.equal(operationsReview.fallbackMode, "rule_fallback");
  assert.equal(listAiFeatureDefinitions().length, 2);
  assert.throws(
    () => getAiFeatureDefinition("browser", "forged"),
    error => error.code === "AI_FEATURE_NOT_REGISTERED" && error.status === 500
  );
});

test("AI usage audit stores app feature and execution attribution without content", async () => {
  const db = createAiD1Mock();
  await writeAiAudit(db, {
    requestId: "req-operations-review",
    createdAt: "2026-07-22T02:00:00.000Z",
    userId: "user-1",
    department: "运营部",
    providerId: "lingsuan-responses",
    model: "gpt-5.6-sol",
    inputTokens: 0,
    outputTokens: 0,
    resultCode: "AI_RULE_FALLBACK",
    completed: true,
    appId: "ecommerce-operations",
    featureId: "plan-review",
    executionMode: "rule_fallback",
    providerCalled: false,
    prompt: "不得进入审计",
    answer: "不得进入审计"
  });

  assert.equal(db.audits.length, 1);
  assert.deepEqual(db.audits[0].slice(-4), [
    "ecommerce-operations",
    "plan-review",
    "rule_fallback",
    0
  ]);
  assert.doesNotMatch(JSON.stringify(db.audits), /不得进入审计/);
});
