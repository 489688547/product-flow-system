import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("AI model workspace mounts the governed AI Provider settings in a disclosure", () => {
  assert.equal(existsSync(new URL("../src/features/data-center/AiProviderSettings.jsx", import.meta.url)), true);
  const workspace = read("src/features/data-center/AiModelWorkspace.jsx");
  assert.match(workspace, /AiProviderSettings/);
  assert.match(workspace, /<details/);
  assert.match(workspace, /<AiProviderSettings\b[^>]*\/>/);
});

test("Provider settings expose safe metadata without credential inputs", () => {
  const settings = read("src/features/data-center/AiProviderSettings.jsx");
  assert.match(settings, /loadAiProvider/);
  assert.match(settings, /saveAiProvider/);
  assert.match(settings, /testAiProvider/);
  assert.match(settings, /服务端 Secret/);
  assert.match(settings, /合成数据/);
  assert.match(settings, /原生 Skills/);
  assert.match(settings, /服务端 Skills/);
  assert.match(settings, /store=false/);
  assert.match(settings, /财务/);
  assert.match(settings, /阻止外发/);
  assert.match(settings, /canManage/);
  assert.match(settings, /统一公司 AI/);
  assert.match(settings, /前往数据接入配置连接/);
  assert.match(settings, /#\/data-sources\/company/);
  assert.doesNotMatch(settings, /type=["']password["']/);
  assert.doesNotMatch(settings, /apiKey|API_KEY|LINGSUAN_API_KEY/);
});

test("Provider API hides infrastructure errors while preserving safe guidance", async () => {
  const { loadAiProvider, saveAiProvider } = await import("../src/state/aiAssistantApi.js");

  await assert.rejects(
    loadAiProvider(async () => new Response(JSON.stringify({
      message: "D1_ERROR: Network connection lost at internal worker path",
      error: { code: "LOCAL_ONLINE_AUTH_FAILED", retryable: true }
    }), { status: 500 })),
    error => error.message === "模型服务状态加载失败。" && !error.message.includes("D1_ERROR")
  );

  await assert.rejects(
    saveAiProvider({ providerId: "lingsuan-responses", model: "gpt-5.6-sol", reasoningEffort: "xhigh", enabled: true }, async () => new Response(JSON.stringify({
      message: "server internals",
      error: { code: "AI_PROVIDER_SECRET_MISSING" }
    }), { status: 409 })),
    error => error.message === "请先在数据接入中配置模型服务凭据。" && error.code === "AI_PROVIDER_SECRET_MISSING"
  );
});

test("Provider settings cover loading errors readonly and responsive layout", () => {
  const settings = read("src/features/data-center/AiProviderSettings.jsx");
  const styles = read("src/styles.css");
  assert.match(settings, /正在读取模型服务状态/);
  assert.match(settings, /重新加载/);
  assert.match(settings, /只读/);
  assert.match(settings, /role="status"/);
  assert.match(styles, /\.ai-provider-settings/);
  assert.match(styles, /\.ai-provider-config-grid/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.ai-provider-config-grid/);
  assert.match(styles, /\.ai-provider-settings[\s\S]*:focus-visible/);
});
