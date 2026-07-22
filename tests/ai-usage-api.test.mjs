import test from "node:test";
import assert from "node:assert/strict";

const usageUrl = new URL("../functions/api/platform/v1/ai/usage.js", import.meta.url);
const executive = { userId: "u-1", name: "周总", department: "总经办", role: "executive" };

function usageDb({ featureRows = [], skillRows = [], fail = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async all() {
          calls.push({ sql, values: statement.values });
          if (fail) throw new Error("raw d1 failure with sensitive detail");
          if (/from\s+ai_skill_audit/i.test(sql)) return { results: skillRows };
          if (/from\s+ai_usage_audit/i.test(sql)) return { results: featureRows };
          return { results: [] };
        }
      };
      return statement;
    }
  };
}

function context({ db, session = executive, from = "2026-07-01", to = "2026-07-22", method = "GET" } = {}) {
  const query = new URLSearchParams({ from, to });
  return {
    request: new Request(`https://flow.example.com/api/platform/v1/ai/usage?${query}`, { method }),
    env: db ? { PRODUCT_FLOW_DB: db } : {},
    data: session ? { session } : {}
  };
}

test("AI usage report requires a session data-center permission and D1", async () => {
  const { onRequest } = await import(usageUrl);
  const missingSession = await onRequest(context({ db: usageDb(), session: null }));
  assert.equal(missingSession.status, 401);
  assert.equal((await missingSession.json()).error.code, "AI_SESSION_REQUIRED");

  const denied = await onRequest(context({ db: usageDb(), session: { userId: "u-2", department: "品牌部", role: "employee" } }));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "AI_USAGE_ACCESS_DENIED");

  const missingDb = await onRequest(context({ db: null }));
  assert.equal(missingDb.status, 503);
  assert.equal((await missingDb.json()).error.code, "AI_STORAGE_UNAVAILABLE");
});

test("AI usage report validates complete Shanghai date ranges up to 366 days", async () => {
  const { onRequest } = await import(usageUrl);
  for (const [from, to] of [
    ["", "2026-07-22"],
    ["2026-07-23", "2026-07-22"],
    ["2026-02-30", "2026-03-01"],
    ["2025-01-01", "2026-07-22"]
  ]) {
    const db = usageDb();
    const response = await onRequest(context({ db, from, to }));
    assert.equal(response.status, 400, `${from} 至 ${to}`);
    assert.equal((await response.json()).error.code, "AI_USAGE_RANGE_INVALID");
    assert.equal(db.calls.length, 0);
  }

  const db = usageDb();
  const valid = await onRequest(context({ db, from: "2025-07-22", to: "2026-07-22" }));
  assert.equal(valid.status, 200);
  assert.deepEqual(db.calls[0].values, ["2025-07-21T16:00:00.000Z", "2026-07-22T16:00:00.000Z"]);
});

test("AI usage report aggregates model tokens fallbacks and skills without employee dimensions", async () => {
  const { onRequest } = await import(usageUrl);
  const db = usageDb({
    featureRows: [
      {
        app_id: "company-ai-assistant", feature_id: "assistant-chat",
        provider_id: "lingsuan-responses", model: "gpt-5.6-sol",
        provider_calls: 2, successful_calls: 1, input_tokens: 100,
        output_tokens: 30, fallback_runs: 1, last_used_at: "2026-07-22T02:00:00.000Z"
      },
      {
        app_id: "ecommerce-operations", feature_id: "plan-review",
        provider_id: "lingsuan-responses", model: "gpt-5.6-sol",
        provider_calls: 1, successful_calls: 1, input_tokens: 20,
        output_tokens: 10, fallback_runs: 1, last_used_at: "2026-07-21T02:00:00.000Z"
      }
    ],
    skillRows: [{
      caller_app_id: "company-ai-assistant", caller_feature_id: "assistant-chat",
      source_app_id: "data-center", skill_id: "data_center_query_sales",
      calls: 3, successes: 2, failures: 1, result_count: 24,
      last_used_at: "2026-07-22T02:00:00.000Z"
    }]
  });

  const response = await onRequest(context({ db }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /private/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.deepEqual(payload.range, { from: "2026-07-01", to: "2026-07-22", timezone: "Asia/Shanghai" });
  assert.deepEqual(payload.summary, {
    providerCalls: 3,
    successfulCalls: 2,
    successRate: 2 / 3,
    inputTokens: 120,
    outputTokens: 40,
    totalTokens: 160,
    skillCalls: 3,
    fallbackRuns: 2
  });
  assert.equal(payload.features[0].appName, "公司 AI 总助");
  assert.equal(payload.features[0].featureName, "对话分析");
  assert.equal(payload.features[0].totalTokens, 130);
  assert.equal(payload.skills[0].skillName, "销售经营");
  assert.equal(payload.skills[0].sourceAppId, "data-center");
  assert.doesNotMatch(JSON.stringify(payload), /user_id|department|prompt|answer|raw d1 failure/i);
});

test("AI usage report returns registered zero-use features and safe storage errors", async () => {
  const { onRequest } = await import(usageUrl);
  const empty = await onRequest(context({ db: usageDb() }));
  const emptyPayload = await empty.json();
  assert.equal(empty.status, 200);
  assert.equal(emptyPayload.features.length, 2);
  assert.ok(emptyPayload.features.every(row => row.providerCalls === 0 && row.successRate === null));
  assert.equal(emptyPayload.features.find(row => row.featureId === "plan-review").historyNote, "统一接入前暂无统计");
  assert.deepEqual(emptyPayload.skills, []);

  const failed = await onRequest(context({ db: usageDb({ fail: true }) }));
  const failedPayload = await failed.json();
  assert.equal(failed.status, 500);
  assert.equal(failedPayload.error.code, "AI_USAGE_QUERY_FAILED");
  assert.equal(failedPayload.error.retryable, true);
  assert.doesNotMatch(JSON.stringify(failedPayload), /raw d1 failure|sensitive detail/i);
});
