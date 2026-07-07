import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as syncOrgRequest } from "../functions/api/dingtalk/org/sync.js";
import { onRequest as createTodoRequest } from "../functions/api/dingtalk/todo/create.js";
import { onRequest as createCalendarRequest } from "../functions/api/dingtalk/calendar/create.js";
import { onRequest as readDocRequest } from "../functions/api/dingtalk/doc/read.js";
import { onRequest as listCalendarRequest } from "../functions/api/dingtalk/calendar/events.js";
import { onRequest as meetingMinutesRequest } from "../functions/api/dingtalk/meeting/minutes.js";

test("org sync route reports missing DingTalk credentials", async () => {
  const response = await syncOrgRequest({
    request: new Request("https://flow.example.com/api/dingtalk/org/sync", { method: "POST" }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("todo create route validates DingTalk credentials", async () => {
  const response = await createTodoRequest({
    request: new Request("https://flow.example.com/api/dingtalk/todo/create", {
      method: "POST",
      body: JSON.stringify({ subject: "整理 PRD" })
    }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("calendar create route validates DingTalk credentials", async () => {
  const response = await createCalendarRequest({
    request: new Request("https://flow.example.com/api/dingtalk/calendar/create", {
      method: "POST",
      body: JSON.stringify({ summary: "立项评审会" })
    }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("calendar events route validates DingTalk credentials", async () => {
  const response = await listCalendarRequest({
    request: new Request("https://flow.example.com/api/dingtalk/calendar/events", {
      method: "POST",
      body: JSON.stringify({ userUnionId: "user-union" })
    }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("document read route validates DingTalk credentials", async () => {
  const response = await readDocRequest({
    request: new Request("https://flow.example.com/api/dingtalk/doc/read", {
      method: "POST",
      body: JSON.stringify({ docUrl: "https://alidocs.dingtalk.com/i/nodes/R4GpnMqJzG0yOgN5fkEmq24w8Ke0xjE3" })
    }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("meeting minutes route uses conference id cloud recording before AI minutes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/gettoken")) {
      return new Response(JSON.stringify({ errcode: 0, access_token: "app-token-1" }), { status: 200 });
    }
    if (String(url).includes("/cloudRecords/getTexts")) {
      return new Response(JSON.stringify({
        result: {
          paragraphList: [
            { paragraph: "确认封样标准。" }
          ]
        }
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await meetingMinutesRequest({
      request: new Request("https://flow.example.com/api/dingtalk/meeting/minutes", {
        method: "POST",
        body: JSON.stringify({
          authCode: "auth-code-1",
          events: [
            {
              conferenceId: "conf-1",
              summary: "鹦鹉谷物棒 · 标准样终审会",
              startTime: "2026-07-05T14:00:00+08:00",
              endTime: "2026-07-05T15:00:00+08:00"
            }
          ]
        })
      }),
      env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.source, "cloudRecording");
    assert.equal(body.events[0].minuteState, "ready");
    assert.equal(body.events[0].minuteText, "确认封样标准。");
    assert.match(calls[1].url, /\/v1\.0\/conference\/videoConferences\/conf-1\/cloudRecords\/getTexts/);
    assert.equal(calls.some(call => call.url.includes("mcp-gw.dingtalk.com")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("meeting minutes route falls back to AI minutes only when conference id has no recording", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/gettoken")) {
      return new Response(JSON.stringify({ errcode: 0, access_token: "app-token-1" }), { status: 200 });
    }
    if (String(url).includes("/cloudRecords/getTexts")) {
      return new Response(JSON.stringify({
        code: "cloudRecordNotFound",
        message: "cloud record not found"
      }), { status: 404 });
    }
    if (String(url).includes("/scheduleConferences/")) {
      return new Response(JSON.stringify({ conferenceList: [] }), { status: 200 });
    }
    if (String(url).includes("/v1.0/oauth2/userAccessToken")) {
      return new Response(JSON.stringify({ accessToken: "user-token-1" }), { status: 200 });
    }
    if (String(url).includes("mcp-gw.dingtalk.com")) {
      const body = JSON.parse(options.body);
      if (body.params.name === "list_by_keyword_and_time_range") {
        return new Response(JSON.stringify({
          result: {
            structuredContent: {
              result: {
                minutesDetails: [
                  {
                    taskUuid: "task-ai-1",
                    title: "鹦鹉谷物棒 标准样终审会",
                    startTime: "2026-07-05T14:05:00+08:00"
                  }
                ]
              }
            }
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        result: {
          content: [
            { type: "text", text: JSON.stringify({ aiSummary: "确认封样标准。" }) }
          ]
        }
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await meetingMinutesRequest({
      request: new Request("https://flow.example.com/api/dingtalk/meeting/minutes", {
        method: "POST",
        body: JSON.stringify({
          authCode: "auth-code-1",
          events: [
            {
              conferenceId: "conf-1",
              summary: "鹦鹉谷物棒 · 标准样终审会",
              startTime: "2026-07-05T14:00:00+08:00",
              endTime: "2026-07-05T15:00:00+08:00"
            }
          ]
        })
      }),
      env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.source, "cloudRecording");
    assert.equal(body.fallbackSource, "aiMinutes");
    assert.equal(body.events[0].minuteState, "ready");
    assert.equal(body.events[0].aiMinutesTaskUuid, "task-ai-1");
    assert.equal(body.events[0].minuteText, "确认封样标准。");
    assert.equal(calls.some(call => call.url.includes("mcp-gw.dingtalk.com")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("meeting minutes route returns DingTalk AI minutes poster url", async () => {
  const originalFetch = globalThis.fetch;
  const posterUrl = "https://ai-tingji-summary-visualization.oss-cn-hangzhou.aliyuncs.com/data/poster.png?Expires=1783000000";
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/v1.0/oauth2/userAccessToken")) {
      return new Response(JSON.stringify({ accessToken: "user-token-1" }), { status: 200 });
    }
    if (String(url).includes("mcp-gw.dingtalk.com")) {
      return new Response(JSON.stringify({
        result: {
          content: [
            { type: "text", text: JSON.stringify({ fullSummary: `![纪要图](${posterUrl})\n确认方向。` }) }
          ]
        }
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await meetingMinutesRequest({
      request: new Request("https://flow.example.com/api/dingtalk/meeting/minutes", {
        method: "POST",
        body: JSON.stringify({
          authCode: "auth-code-1",
          sourceType: "aiMinutes",
          aiMinutesTaskUuid: "task-poster-1"
        })
      }),
      env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.source, "aiMinutes");
    assert.equal(body.posterUrl, posterUrl);
    assert.deepEqual(body.posterUrls, [posterUrl]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("meeting minutes route lists selectable DingTalk AI minutes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/v1.0/oauth2/userAccessToken")) {
      return new Response(JSON.stringify({ accessToken: "user-token-1" }), { status: 200 });
    }
    if (String(url).includes("mcp-gw.dingtalk.com")) {
      const body = JSON.parse(options.body);
      assert.equal(body.params.name, "list_by_keyword_and_time_range");
      return new Response(JSON.stringify({
        result: {
          structuredContent: {
            result: {
              minutesDetails: [
                {
                  taskUuid: "task-ai-1",
                  title: "产品全周期流程初版同步会",
                  startTime: "2026-07-03T14:00:00+08:00"
                }
              ]
            }
          }
        }
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await meetingMinutesRequest({
      request: new Request("https://flow.example.com/api/dingtalk/meeting/minutes", {
        method: "POST",
        body: JSON.stringify({
          authCode: "auth-code-1",
          sourceType: "aiMinutesList",
          maxResults: 20
        })
      }),
      env: { DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.source, "aiMinutesList");
    assert.equal(body.minutes[0].taskUuid, "task-ai-1");
    assert.equal(body.minutes[0].title, "产品全周期流程初版同步会");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
