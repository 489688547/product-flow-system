import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("AI usage dates use complete inclusive ranges and reject incomplete drafts", async () => {
  assert.equal(existsSync(new URL("../src/domain/aiModelGovernance.js", import.meta.url)), true);
  const { aiUsagePresetRange, defaultAiUsageRange, validateAiUsageRange } = await import("../src/domain/aiModelGovernance.js");
  assert.deepEqual(aiUsagePresetRange(7, "2026-07-22"), { from: "2026-07-16", to: "2026-07-22" });
  assert.deepEqual(defaultAiUsageRange("2026-07-22"), { from: "2026-06-23", to: "2026-07-22" });
  assert.deepEqual(validateAiUsageRange({ from: "", to: "2026-07-22" }), { valid: false, message: "请完整选择开始和截止日期。" });
  assert.equal(validateAiUsageRange({ from: "2026-07-23", to: "2026-07-22" }).valid, false);
  assert.equal(validateAiUsageRange({ from: "2025-07-21", to: "2026-07-22" }).valid, false);
  assert.deepEqual(validateAiUsageRange({ from: "2026-07-16", to: "2026-07-22" }), { valid: true, message: "" });
});

test("AI usage client sends only the applied range and preserves safe API errors", async () => {
  assert.equal(existsSync(new URL("../src/state/aiModelGovernanceApi.js", import.meta.url)), true);
  const { loadAiUsage } = await import("../src/state/aiModelGovernanceApi.js");
  let requestUrl = "";
  const payload = await loadAiUsage({ from: "2026-07-16", to: "2026-07-22" }, async (url, options) => {
    requestUrl = String(url);
    assert.equal(options.credentials, "include");
    assert.equal(options.headers.accept, "application/json");
    return new Response(JSON.stringify({ range: {}, summary: {}, features: [], skills: [] }), { status: 200 });
  });
  assert.match(requestUrl, /^\/api\/platform\/v1\/ai\/usage\?/);
  assert.match(requestUrl, /from=2026-07-16/);
  assert.match(requestUrl, /to=2026-07-22/);
  assert.deepEqual(payload.features, []);

  await assert.rejects(
    loadAiUsage({ from: "2026-07-16", to: "2026-07-22" }, async () => new Response(JSON.stringify({
      message: "AI 使用统计加载失败。",
      error: { code: "AI_USAGE_QUERY_FAILED", requestId: "req_safe", retryable: true }
    }), { status: 500 })),
    error => error.message === "AI 使用统计加载失败。" && error.code === "AI_USAGE_QUERY_FAILED" && error.requestId === "req_safe" && error.retryable === true
  );

  await assert.rejects(
    loadAiUsage({ from: "2026-07-16", to: "2026-07-22" }, async () => new Response(JSON.stringify({
      message: "D1_ERROR: Network connection lost at internal worker path",
      error: { code: "LOCAL_ONLINE_AUTH_FAILED", retryable: true }
    }), { status: 500 })),
    error => error.message === "AI 使用统计加载失败，请稍后重试。" && !error.message.includes("D1_ERROR")
  );
});

test("AI model workspace confirms custom dates and renders aggregate-only governance", () => {
  assert.equal(existsSync(new URL("../src/features/data-center/AiModelWorkspace.jsx", import.meta.url)), true);
  const workspace = read("src/features/data-center/AiModelWorkspace.jsx");
  assert.match(workspace, /draftRange/);
  assert.match(workspace, /appliedRange/);
  assert.match(workspace, /DateRangeControls/);
  assert.match(workspace, /onSubmit/);
  assert.match(workspace, /最近 7 天/);
  assert.match(workspace, /最近 30 天/);
  assert.match(workspace, /最近 90 天/);
  assert.match(workspace, /aria-pressed/);
  assert.match(workspace, /模型调用/);
  assert.match(workspace, /总 Token/);
  assert.match(workspace, /成功率/);
  assert.match(workspace, /Skill 调用/);
  assert.match(workspace, /规则降级/);
  assert.match(workspace, /App 与功能用量/);
  assert.match(workspace, /Skill 用量/);
  assert.match(workspace, /DataTable/);
  assert.match(workspace, /<details/);
  assert.match(workspace, /模型与安全设置/);
  assert.match(workspace, /页面只展示汇总，不展示员工排行、提示词或回答内容/);
  assert.match(workspace, /AI 使用统计加载失败/);
  assert.match(workspace, /所选时间内没有 Skill 调用记录/);
  assert.doesNotMatch(workspace, /employee|员工明细|员工排行.*DataTable/);
});

test("AI model workspace has restrained responsive and focus-complete styles", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /\.ai-model-workspace/);
  assert.match(styles, /\.ai-usage-toolbar/);
  assert.match(styles, /\.ai-usage-summary/);
  assert.match(styles, /\.ai-model-settings/);
  assert.match(styles, /\.ai-model-workspace[\s\S]*:focus-visible/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.ai-usage-summary/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.ai-usage-toolbar/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*\.ai-usage-summary/);
  assert.doesNotMatch(styles, /\.ai-model-workspace[^\n]*gradient/);
  assert.doesNotMatch(styles, /\.ai-model-workspace[^\n]*backdrop-filter/);
});
