import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const moduleUrl = new URL("../src/domain/aiAssistant.js", import.meta.url);

test("AI assistant domain module defines governed cross-App data domains", async () => {
  assert.equal(existsSync(moduleUrl), true, "AI assistant domain module must exist");
  const { AI_DATA_DOMAINS } = await import(moduleUrl);
  assert.deepEqual(AI_DATA_DOMAINS.map(item => item.id), [
    "strategy",
    "projects",
    "commitments",
    "product_lifecycle",
    "supply_chain",
    "operating_reviews",
    "sales_operations",
    "data_quality",
    "ecommerce_operations",
    "brand_content",
    "performance_management",
    "finance"
  ]);
  assert.equal(AI_DATA_DOMAINS.find(item => item.id === "finance")?.classification, "restricted");
});

test("LingSuan Provider defaults are fixed disabled and non-retaining", async () => {
  assert.equal(existsSync(moduleUrl), true, "AI assistant domain module must exist");
  const { DEFAULT_AI_PROVIDER, normalizeAiProvider } = await import(moduleUrl);
  assert.deepEqual(DEFAULT_AI_PROVIDER, {
    id: "lingsuan-responses",
    providerId: "lingsuan-responses",
    displayName: "灵算",
    wireApi: "responses",
    baseUrl: "https://lingsuan.top",
    responsesPath: "/responses",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    enabled: false,
    storeResponses: false,
    lastCheckedAt: "",
    lastLatencyMs: 0,
    lastStatusCode: 0
  });
  const normalized = normalizeAiProvider({
    providerId: "untrusted-provider",
    baseUrl: "https://example.invalid",
    responsesPath: "/capture",
    model: "untrusted-model",
    reasoningEffort: "low",
    enabled: true,
    storeResponses: true,
    apiToken: "must-not-survive",
    headers: { authorization: "must-not-survive" }
  });
  assert.equal(normalized.providerId, "lingsuan-responses");
  assert.equal(normalized.baseUrl, "https://lingsuan.top");
  assert.equal(normalized.responsesPath, "/responses");
  assert.equal(normalized.storeResponses, false);
  assert.doesNotMatch(JSON.stringify(normalized), /must-not-survive|apiToken|authorization/);
});

test("finance transfer stays blocked for the current Provider", async () => {
  assert.equal(existsSync(moduleUrl), true, "AI assistant domain module must exist");
  const { createDefaultAiDataPolicies, normalizeAiDataPolicies } = await import(moduleUrl);
  const defaults = createDefaultAiDataPolicies();
  const finance = defaults.find(item => item.domainId === "finance");
  assert.equal(finance.providerTransfer["lingsuan-responses"], "blocked");
  const attemptedOverride = normalizeAiDataPolicies([{ ...finance, providerTransfer: { "lingsuan-responses": "allowed" } }]);
  assert.equal(attemptedOverride.find(item => item.domainId === "finance").providerTransfer["lingsuan-responses"], "blocked");
});

test("feature documents use the governed platform API namespace", () => {
  const files = ["prd.md", "design.md", "plan.md", "tasks.md"].map(name => readFileSync(new URL(`../docs/features/company-ai-assistant/${name}`, import.meta.url), "utf8")).join("\n");
  assert.match(files, /\/api\/platform\/v1\/ai\/chat/);
  assert.doesNotMatch(files, /\/api\/ai\//);
});
