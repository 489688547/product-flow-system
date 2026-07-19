import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const apiUrl = new URL("../src/state/aiAssistantApi.js", import.meta.url);
const providerUrl = new URL("../src/state/AiAssistantProvider.jsx", import.meta.url);

test("browser SSE parser emits known events and ignores malformed or unknown events", async () => {
  assert.equal(existsSync(apiUrl), true, "AI browser API module must exist");
  const { parseAiSse } = await import(apiUrl);
  const stream = new Response([
    "event: meta\r\ndata: {\"requestId\":\"r1\"}\r\n\r\n",
    "event: unknown\ndata: {\"x\":1}\n\n",
    "event: text_delta\ndata: {malformed}\n\n",
    "event: text_delta\ndata: {\"delta\":\"你好\"}\n\n",
    "event: done\ndata: {\"complete\":true}\n\n"
  ].join("")).body;
  const events = [];
  for await (const event of parseAiSse(stream)) events.push(event);
  assert.deepEqual(events.map(item => item.type), ["meta", "text_delta", "done"]);
});

test("chat request sends only messages and route hint", async () => {
  assert.equal(existsSync(apiUrl), true, "AI browser API module must exist");
  const { sendAiChat } = await import(apiUrl);
  let sent;
  await sendAiChat({
    messages: [{ role: "user", content: "分析风险" }],
    appHint: { screen: "projects", detail: "" },
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response("event: done\ndata: {\"complete\":true}\n\n", { status: 200 });
    },
    onEvent() {}
  });
  assert.deepEqual(Object.keys(sent).sort(), ["appHint", "messages"]);
  assert.doesNotMatch(JSON.stringify(sent), /companyState|permissions|department|finance/);
});

test("assistant Provider keeps only current-session text and supports abort", () => {
  assert.equal(existsSync(providerUrl), true, "AI assistant Provider must exist");
  const source = readFileSync(providerUrl, "utf8");
  assert.match(source, /sessionStorage/);
  assert.match(source, /AbortController/);
  assert.match(source, /slice\(-12\)/);
  assert.doesNotMatch(source, /localStorage|useProductFlow|usePlatform|useDataCenter/);
});
