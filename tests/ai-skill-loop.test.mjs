import test from "node:test";
import assert from "node:assert/strict";
import { createAiD1Mock } from "./helpers/ai-d1-mock.mjs";

const loopUrl = new URL("../functions/api/platform/v1/ai/_shared/skill-loop.js", import.meta.url);
const auditUrl = new URL("../functions/api/platform/v1/ai/_shared/audit.js", import.meta.url);
const config = {
  endpoint: "https://lingsuan.top/responses",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  apiKey: "test-secret",
  secretConfigured: true
};
const tools = [{
  type: "function",
  name: "strategy_query_projects",
  description: "查询重点项目",
  parameters: { type: "object", properties: { status: { type: "string" } }, additionalProperties: false },
  strict: true
}];

function providerStream(items = [], text = "", usage = {}) {
  return new Response([
    ...items.map(item => `event: response.output_item.done\ndata: ${JSON.stringify({ item })}\n\n`),
    ...(text ? [`event: response.output_text.delta\ndata: ${JSON.stringify({ delta: text })}\n\n`] : []),
    `event: response.completed\ndata: ${JSON.stringify({ response: { output: items, usage } })}\n\n`
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("bounded Skill loop executes a read tool and returns only the final answer", async () => {
  const { runSkillLoop } = await import(loopUrl);
  let providerCalls = 0;
  let executeCalls = 0;
  const activity = [];
  const output = [];
  for await (const event of runSkillLoop({
    config,
    input: [{ role: "user", content: "哪些项目有风险？" }],
    tools,
    fetchImpl: async (_url, init) => {
      providerCalls += 1;
      if (providerCalls === 1) {
        return providerStream([{
          type: "function_call",
          id: "fc-1",
          call_id: "call-1",
          name: "strategy_query_projects",
          arguments: '{"status":"at_risk"}'
        }], "不应显示的中间文本", { input_tokens: 10, output_tokens: 2 });
      }
      const request = JSON.parse(init.body);
      assert.ok(request.input.some(item => item.type === "function_call_output" && item.call_id === "call-1"));
      return providerStream([], "关注重点项目", { input_tokens: 20, output_tokens: 3 });
    },
    execute: async call => {
      executeCalls += 1;
      assert.equal(call.skillId, "strategy_query_projects");
      assert.equal(call.argumentsText, '{"status":"at_risk"}');
      return {
        skillId: call.skillId,
        appId: "strategy",
        displayName: "重点项目",
        records: [{ id: "project-1", status: "at_risk" }],
        recordCount: 1,
        updatedAt: "2026-07-19T00:00:00Z",
        source: { appId: "strategy", domainIds: ["projects"] }
      };
    },
    onEvent: event => activity.push(event)
  })) output.push(event);
  assert.equal(providerCalls, 2);
  assert.equal(executeCalls, 1);
  assert.deepEqual(output, [
    { type: "text_delta", delta: "关注重点项目" },
    { type: "usage", inputTokens: 30, outputTokens: 5 }
  ]);
  assert.deepEqual(activity.map(item => item.type), ["skill_started", "skill_completed"]);
  assert.equal(activity[1].result.recordCount, 1);
});

test("Skill loop deduplicates repeated calls and stops after two tool rounds", async () => {
  const { runSkillLoop } = await import(loopUrl);
  let providerCalls = 0;
  let executeCalls = 0;
  const activity = [];
  await assert.rejects(async () => {
    for await (const _event of runSkillLoop({
      config,
      input: [{ role: "user", content: "继续查询" }],
      tools,
      fetchImpl: async () => {
        providerCalls += 1;
        return providerStream([{
          type: "function_call",
          id: `fc-${providerCalls}`,
          call_id: `call-${providerCalls}`,
          name: "strategy_query_projects",
          arguments: '{"status":"at_risk"}'
        }]);
      },
      execute: async () => {
        executeCalls += 1;
        return { skillId: "strategy_query_projects", appId: "strategy", displayName: "重点项目", records: [], recordCount: 0, source: { appId: "strategy", domainIds: ["projects"] } };
      },
      onEvent: event => activity.push(event)
    })) {
      // Drain the loop to surface the limit error.
    }
  }, error => error.code === "AI_SKILL_LOOP_LIMIT");
  assert.equal(providerCalls, 3);
  assert.equal(executeCalls, 1);
  assert.ok(activity.some(item => item.type === "skill_failed" && item.code === "AI_SKILL_DUPLICATE"));
});

test("Skill loop caps a response at six calls and preserves partial failures", async () => {
  const { runSkillLoop } = await import(loopUrl);
  let executeCalls = 0;
  const activity = [];
  const sevenCalls = Array.from({ length: 7 }, (_, index) => ({
    type: "function_call",
    id: `fc-${index}`,
    call_id: `call-${index}`,
    name: "strategy_query_projects",
    arguments: JSON.stringify({ status: `status-${index}` })
  }));
  await assert.rejects(async () => {
    for await (const _event of runSkillLoop({
      config,
      input: [{ role: "user", content: "查询" }],
      tools,
      fetchImpl: async () => providerStream(sevenCalls),
      execute: async () => {
        executeCalls += 1;
        if (executeCalls === 2) throw Object.assign(new Error("查询失败"), { code: "AI_SKILL_TIMEOUT", retryable: true });
        return { skillId: "strategy_query_projects", appId: "strategy", displayName: "重点项目", records: [], recordCount: 0, source: { appId: "strategy", domainIds: ["projects"] } };
      },
      onEvent: event => activity.push(event)
    })) {
      // Drain the loop to surface the call cap.
    }
  }, error => error.code === "AI_SKILL_CALL_LIMIT");
  assert.equal(executeCalls, 6);
  assert.ok(activity.some(item => item.type === "skill_failed" && item.code === "AI_SKILL_TIMEOUT"));
  assert.ok(activity.some(item => item.type === "skill_completed"));
});

test("Skill audit stores metadata without argument values or returned business content", async () => {
  const { writeAiSkillAudit } = await import(auditUrl);
  const db = createAiD1Mock();
  await writeAiSkillAudit(db, {
    requestId: "req-1",
    callId: "call-1",
    skillId: "strategy_query_projects",
    appId: "strategy",
    argumentSummary: ["query", "status"],
    resultCount: 1,
    latencyMs: 12,
    resultCode: "AI_SKILL_COMPLETED",
    forbiddenArgumentValue: "秘密项目",
    forbiddenResult: "具体业务内容"
  });
  assert.equal(db.skillAudits.length, 1);
  assert.doesNotMatch(JSON.stringify(db.skillAudits), /秘密项目|具体业务内容/);
  assert.match(JSON.stringify(db.skillAudits), /strategy_query_projects|query|status/);
});
