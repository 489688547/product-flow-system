import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAiFeatureDefinition } from "../functions/api/platform/v1/ai/_shared/feature-registry.js";
import {
  onRequest,
  parseBacklogDraftText,
  runBacklogDraft
} from "../functions/api/platform/v1/development-backlog/ai-draft.js";

const employee = { userId: "dev-1", name: "产品同事", department: "产品部", role: "employee" };
const modelDraft = {
  title: "修复扩展重载",
  background: "扩展重载后恢复任务领取。",
  moduleId: "data-acquisition",
  priority: "p1",
  acceptanceCriteria: ["重载后自动领取任务"],
  scopePaths: ["chrome-extension/company-data-collector/"],
  dependencyIds: []
};

test("development backlog draft is a registered non-fallback AI feature", () => {
  const feature = getAiFeatureDefinition("company-platform", "development-backlog-draft");
  assert.equal(feature.appName, "公司平台");
  assert.equal(feature.featureName, "研发待办草稿");
  assert.equal(feature.supportsSkills, false);
  assert.equal(feature.fallbackMode, "none");
});

test("AI draft parser accepts one JSON object and normalizes approved fields", () => {
  const draft = parseBacklogDraftText(`\`\`\`json\n${JSON.stringify(modelDraft)}\n\`\`\``);
  assert.deepEqual(draft, { ...modelDraft, status: "ready", sourceType: "ai_assistant" });
  assert.throws(
    () => parseBacklogDraftText("这里没有结构化数据"),
    error => error.code === "BACKLOG_AI_DRAFT_INVALID"
  );
});

test("AI draft invokes the governed feature without writing backlog storage", async () => {
  const calls = [];
  const result = await runBacklogDraft({
    env: {},
    data: {},
    session: employee,
    description: "把 Chrome 扩展重载后自动接任务做成研发待办",
    invoke: async input => {
      calls.push(input);
      return { mode: "model", text: JSON.stringify(modelDraft) };
    }
  });
  assert.equal(result.draft.sourceType, "ai_assistant");
  assert.equal(calls[0].appId, "company-platform");
  assert.equal(calls[0].featureId, "development-backlog-draft");
  assert.equal(calls[0].fallback, undefined);
  assert.doesNotMatch(JSON.stringify(calls[0]), /PRODUCT_FLOW_DB|credential|cookie/i);
});

test("AI draft route requires a session and preserves configuration versus retryable errors", async () => {
  const anonymous = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/development-backlog/ai-draft", {
      method: "POST",
      body: JSON.stringify({ description: "生成研发待办" })
    }),
    env: {},
    data: {}
  });
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "AUTH_SESSION_REQUIRED");

  const source = readFileSync(new URL("../functions/api/platform/v1/development-backlog/ai-draft.js", import.meta.url), "utf8");
  assert.match(source, /invokeAiFeature/);
  assert.match(source, /AI_PROVIDER_NOT_READY/);
  assert.match(source, /AI_PROVIDER_TIMEOUT/);
  assert.doesNotMatch(source, /responses-adapter|provider-config|LINGSUAN_API_KEY|fetch\s*\(/);
});
