import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const featureFiles = ["AiAssistantTrigger.jsx", "AiAssistantPanel.jsx", "AiConversation.jsx", "AiComposer.jsx", "AiAssistantWorkspace.jsx", "AiSkillActivity.jsx"];

test("assistant composer sends Enter but preserves newline and IME composition", async () => {
  const { shouldSendAiComposerKey } = await import("../src/features/ai-assistant/aiComposerBehavior.js");
  assert.equal(shouldSendAiComposerKey({ key: "Enter", shiftKey: false, isComposing: false }), true);
  assert.equal(shouldSendAiComposerKey({ key: "Enter", shiftKey: true, isComposing: false }), false);
  assert.equal(shouldSendAiComposerKey({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(shouldSendAiComposerKey({ key: "Process", shiftKey: false, isComposing: false }), false);
});

test("assistant conversation follows only while the reader stays near the latest message", async () => {
  const { isAiConversationNearBottom } = await import("../src/features/ai-assistant/aiComposerBehavior.js");
  assert.equal(isAiConversationNearBottom({ scrollHeight: 1000, scrollTop: 620, clientHeight: 320 }), true);
  assert.equal(isAiConversationNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 320 }), false);
});

test("App mounts a global assistant trigger panel and hidden workspace route", () => {
  for (const name of featureFiles) assert.equal(existsSync(new URL(`../src/features/ai-assistant/${name}`, import.meta.url)), true, `${name} must exist`);
  const app = read("src/App.jsx");
  assert.match(app, /AiAssistantTrigger/);
  assert.match(app, /AiAssistantPanel/);
  assert.match(app, /AiAssistantWorkspace/);
  assert.match(app, /activeScreen !== "ai-assistant"/);
  assert.match(app, /HIDDEN_SCREENS = new Set\(\["packages", "ai-assistant"\]\)/);
  assert.doesNotMatch(app, /\["ai-assistant",\s*"AI 总助"/);
});

test("assistant UI explains read-only finance exclusion and recoverable states", () => {
  const files = featureFiles.map(name => read(`src/features/ai-assistant/${name}`)).join("\n");
  assert.match(files, /公司 AI 总助/);
  assert.match(files, /只提供分析和建议，不会修改数据或执行外部动作/);
  assert.match(files, /未纳入成本、利润、预算、结算和奖金数据/);
  assert.match(files, /回答未完整生成/);
  assert.match(files, /aria-live="polite"/);
  assert.match(files, /aria-controls="company-ai-assistant-panel"/);
  assert.match(files, /onKeyDown/);
  assert.match(files, /已查询.*公司能力/);
  assert.match(files, /正在查询/);
  assert.match(files, /查询失败/);
  assert.doesNotMatch(files, /result\.records|rawResult/);
});

test("assistant styles cover panel workspace mobile focus and reduced motion", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /\.ai-assistant-panel\s*\{[^}]*width:\s*min\(460px,\s*42vw\)/s);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.ai-assistant-panel[\s\S]*100dvh/);
  assert.match(styles, /\.ai-assistant-trigger:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ai-assistant-panel/);
  assert.match(styles, /\.ai-assistant-panel > \.ai-assistant-conversation\s*\{[^}]*grid-row:\s*3/s);
  assert.match(styles, /\.ai-assistant-panel > \.ai-assistant-composer\s*\{[^}]*grid-row:\s*4/s);
  assert.doesNotMatch(styles, /\.ai-assistant[^\n{]*\{[^}]*border-radius:\s*(?:3[2-9]|[4-9]\d)px/s);
});
