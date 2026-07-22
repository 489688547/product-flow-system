import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAiD1Mock } from "./helpers/ai-d1-mock.mjs";
import { writeAiAudit } from "../functions/api/platform/v1/ai/_shared/audit.js";

const featureRegistryUrl = new URL("../functions/api/platform/v1/ai/_shared/feature-registry.js", import.meta.url);
const migrationUrl = new URL("../migrations/0009_ai_model_governance.sql", import.meta.url);
const invokeUrl = new URL("../functions/api/platform/v1/ai/_shared/invoke-feature.js", import.meta.url);
const operationsReviewUrl = new URL("../functions/api/ecommerce-operations/ai-review.js", import.meta.url);

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

test("shared feature invocation records Provider tokens and server attribution", async () => {
  const { invokeAiFeature } = await import(invokeUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  const result = await invokeAiFeature({
    env: {
      PRODUCT_FLOW_DB: db,
      AI_ASSISTANT_ENABLED: "1",
      LINGSUAN_API_KEY: "test-key",
      AI_PROVIDER_FETCH: async () => new Response([
        "event: response.output_text.delta\ndata: {\"delta\":\"建议先收敛核心问题\"}\n\n",
        "event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":8,\"output_tokens\":3}}}\n\n"
      ].join(""), { status: 200 })
    },
    session: { userId: "operator-1", name: "运营甲", department: "运营部" },
    appId: "ecommerce-operations",
    featureId: "plan-review",
    systemInstruction: "只提供建议。",
    userInput: "安全方案摘要",
    timeoutMs: 20_000,
    fallback: () => ({ mode: "rule_fallback", summary: "规则结果", suggestions: [] })
  });

  assert.equal(result.mode, "model");
  assert.equal(result.text, "建议先收敛核心问题");
  assert.deepEqual(result.usage, { inputTokens: 8, outputTokens: 3 });
  assert.equal(db.audits.length, 1);
  assert.equal(db.audits[0][10], 8);
  assert.equal(db.audits[0][11], 3);
  assert.deepEqual(db.audits[0].slice(-4), ["ecommerce-operations", "plan-review", "model", 1]);
});

test("shared feature invocation records one zero-token rule fallback when Provider is unavailable", async () => {
  const { invokeAiFeature } = await import(invokeUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  let providerCalled = false;
  const fallback = { mode: "rule_fallback", summary: "规则检查完成", suggestions: ["补全负责人"] };
  const result = await invokeAiFeature({
    env: { PRODUCT_FLOW_DB: db, AI_ASSISTANT_ENABLED: "1", AI_PROVIDER_FETCH: async () => { providerCalled = true; } },
    session: { userId: "operator-1", name: "运营甲", department: "运营部" },
    appId: "ecommerce-operations",
    featureId: "plan-review",
    systemInstruction: "只提供建议。",
    userInput: "安全方案摘要",
    fallback: () => fallback
  });

  assert.equal(providerCalled, false);
  assert.equal(result.mode, "rule_fallback");
  assert.deepEqual(result.fallback, fallback);
  assert.equal(db.audits.length, 1);
  assert.equal(db.audits[0][10], 0);
  assert.equal(db.audits[0][11], 0);
  assert.deepEqual(db.audits[0].slice(-4), ["ecommerce-operations", "plan-review", "rule_fallback", 0]);
});

test("unknown AI features fail before Provider invocation", async () => {
  const { invokeAiFeature } = await import(invokeUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  let providerCalled = false;
  await assert.rejects(() => invokeAiFeature({
    env: { PRODUCT_FLOW_DB: db, AI_ASSISTANT_ENABLED: "1", LINGSUAN_API_KEY: "test-key", AI_PROVIDER_FETCH: async () => { providerCalled = true; } },
    session: { userId: "operator-1", department: "运营部" },
    appId: "browser",
    featureId: "forged",
    systemInstruction: "x",
    userInput: "y"
  }), error => error.code === "AI_FEATURE_NOT_REGISTERED");
  assert.equal(providerCalled, false);
  assert.equal(db.audits.length, 0);
});

test("operations review preserves its response while using the shared AI gateway", async () => {
  const { onRequest } = await import(operationsReviewUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  const request = () => new Request("https://flow.example.com/api/ecommerce-operations/ai-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: { product: "主粮", platform: "抖音", store: "旗舰店", evidence: ["近 7 日下降"], goals: ["恢复增长"], issues: ["素材不足"], countermeasures: ["补充素材"], monitors: ["日 GMV"] } })
  });
  const session = { userId: "operator-1", name: "运营甲", department: "运营部" };
  const ai = await onRequest({
    request: request(),
    env: {
      PRODUCT_FLOW_DB: db,
      AI_ASSISTANT_ENABLED: "1",
      LINGSUAN_API_KEY: "test-key",
      AI_PROVIDER_FETCH: async () => new Response([
        "event: response.output_text.delta\ndata: {\"delta\":\"方案方向可行\"}\n\n",
        "event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":5,\"output_tokens\":2}}}\n\n"
      ].join(""), { status: 200 })
    },
    data: { session }
  });
  assert.deepEqual(await ai.json(), { mode: "ai", summary: "方案方向可行", suggestions: [] });

  const fallbackDb = createAiD1Mock({ providerEnabled: true });
  const fallback = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: fallbackDb, AI_ASSISTANT_ENABLED: "1" }, data: { session } });
  const fallbackBody = await fallback.json();
  assert.equal(fallbackBody.mode, "rule_fallback");
  assert.ok(Array.isArray(fallbackBody.suggestions));
  assert.equal(fallbackDb.audits.length, 1);

  const source = readFileSync(operationsReviewUrl, "utf8");
  assert.doesNotMatch(source, /OPENAI_API_KEY|OPENAI_MODEL|api\.openai\.com/);
  assert.match(source, /invokeAiFeature/);
});
