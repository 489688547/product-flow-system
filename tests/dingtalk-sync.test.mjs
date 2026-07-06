import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDingCalendarEventPayload,
  buildDingMeetingMinutesQuery,
  buildDingTodoPayload,
  createDingCalendarEvent,
  listDingCalendarEvents,
  queryDingMeetingMinutesText,
  queryDingMeetingMinutesTextWithFallback,
  queryDingScheduleConferenceHistory,
  createDingTodoTask
} from "../functions/api/dingtalk/_shared/dingtalk.js";

function okJson(body) {
  return {
    ok: true,
    json: async () => body
  };
}

test("buildDingTodoPayload creates a work todo with detailUrl and unionId executors", () => {
  const payload = buildDingTodoPayload({
    sourceId: "task-1",
    subject: "整理 PRD",
    description: "产品：鹦鹉谷物棒",
    creatorUnionId: "creator-union",
    executorUnionIds: ["u-a", "u-b"],
    detailUrl: "https://flow.example.com/?task=task-1",
    dueTime: 1783401600000
  });

  assert.equal(payload.sourceId, "task-1");
  assert.equal(payload.creatorId, "creator-union");
  assert.deepEqual(payload.executorIds, ["u-a", "u-b"]);
  assert.deepEqual(payload.detailUrl, {
    appUrl: "https://flow.example.com/?task=task-1",
    pcUrl: "https://flow.example.com/?task=task-1"
  });
  assert.equal(payload.isOnlyShowExecutor, true);
  assert.equal(payload.priority, 20);
});

test("createDingTodoTask posts to the DingTalk todo endpoint with operatorId", async () => {
  const calls = [];
  const result = await createDingTodoTask("token-1", {
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    sourceId: "task-1",
    subject: "整理 PRD",
    detailUrl: "https://flow.example.com/?task=task-1"
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({ id: "todo-1" });
  });

  assert.equal(result.id, "todo-1");
  assert.match(calls[0].url, /\/v1\.0\/todo\/users\/creator-union\/tasks\?operatorId=creator-union$/);
  assert.equal(calls[0].options.headers["x-acs-dingtalk-access-token"], "token-1");
});

test("buildDingCalendarEventPayload creates a primary-calendar meeting event", () => {
  const payload = buildDingCalendarEventPayload({
    summary: "立项评审会",
    description: "产品：鹦鹉谷物棒",
    startTime: "2026-07-06T09:00:00+08:00",
    endTime: "2026-07-06T10:00:00+08:00",
    attendeeUserIds: ["u-a", "u-b"]
  });

  assert.equal(payload.summary, "立项评审会");
  assert.equal(payload.start.timeZone, "Asia/Shanghai");
  assert.equal(payload.end.dateTime, "2026-07-06T10:00:00+08:00");
  assert.deepEqual(payload.attendees, [{ id: "u-a" }, { id: "u-b" }]);
});

test("createDingCalendarEvent posts to the primary calendar endpoint", async () => {
  const calls = [];
  const result = await createDingCalendarEvent("token-1", {
    organizerUserId: "organizer-user",
    summary: "立项评审会",
    startTime: "2026-07-06T09:00:00+08:00",
    endTime: "2026-07-06T10:00:00+08:00",
    attendeeUserIds: ["u-a"]
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({ id: "event-1" });
  });

  assert.equal(result.id, "event-1");
  assert.match(calls[0].url, /\/v1\.0\/calendar\/users\/organizer-user\/calendars\/primary\/events$/);
  assert.equal(calls[0].options.headers["x-acs-dingtalk-access-token"], "token-1");
});

test("createDingCalendarEvent uses DingTalk unionIds for the OpenAPI calendar path and attendees", async () => {
  const calls = [];
  await createDingCalendarEvent("token-1", {
    organizerUnionId: "organizer-union",
    summary: "标准样终审会",
    startTime: "2026-07-05T14:00:00+08:00",
    endTime: "2026-07-05T15:00:00+08:00",
    attendeeUnionIds: ["attendee-union"]
  }, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return okJson({ id: "event-1" });
  });

  assert.match(calls[0].url, /\/v1\.0\/calendar\/users\/organizer-union\/calendars\/primary\/events$/);
  assert.deepEqual(calls[0].body.attendees, [{ id: "attendee-union" }]);
});

test("createDingCalendarEvent sends DingTalk idempotency client token", async () => {
  const calls = [];
  await createDingCalendarEvent("token-1", {
    organizerUnionId: "organizer-union",
    sourceId: "meeting:p1:standard",
    summary: "标准样终审会",
    startTime: "2026-07-05T14:00:00+08:00",
    endTime: "2026-07-05T15:00:00+08:00",
    attendeeUnionIds: ["attendee-union"]
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({ id: "event-1" });
  });

  assert.equal(calls[0].options.headers["x-client-token"], "meeting-p1-standard");
});

test("listDingCalendarEvents queries primary calendar and extracts conference ids", async () => {
  const calls = [];
  const result = await listDingCalendarEvents("token-1", {
    userUnionId: "user-union",
    timeMin: "2026-07-01T00:00:00.000Z",
    timeMax: "2026-07-31T23:59:59.999Z"
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({
      events: [
        {
          id: "event-1",
          summary: "标准样终审会",
          start: { dateTime: "2026-07-05T14:00:00+08:00" },
          end: { dateTime: "2026-07-05T15:00:00+08:00" },
          onlineMeetingInfo: { conferenceId: "conf-1", type: "dingtalk" }
        }
      ]
    });
  });

  assert.match(calls[0].url, /\/v1\.0\/calendar\/users\/user-union\/calendars\/primary\/events\?/);
  assert.match(calls[0].url, /timeMin=2026-07-01T00%3A00%3A00.000Z/);
  assert.equal(calls[0].options.headers["x-acs-dingtalk-access-token"], "token-1");
  assert.equal(result.events[0].conferenceId, "conf-1");
  assert.equal(result.events[0].scheduleConferenceId, "conf-1");
  assert.equal(result.events[0].summary, "标准样终审会");
});

test("buildDingMeetingMinutesQuery requires a DingTalk cloud recording conference id", () => {
  assert.throws(
    () => buildDingMeetingMinutesQuery({}),
    /需要钉钉会议录制/
  );
  assert.deepEqual(buildDingMeetingMinutesQuery({ recordingId: "conf-1" }), { conferenceId: "conf-1", params: "" });
});

test("queryDingMeetingMinutesText returns text from DingTalk recording transcript response", async () => {
  const calls = [];
  const result = await queryDingMeetingMinutesText("token-1", {
    recordingId: "conf-1"
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({
      paragraphList: [
        {
          sentenceList: [
            { sentence: "确认进入立项。" },
            { sentence: "产品部周三前补齐 PRD。" }
          ]
        }
      ]
    });
  });

  assert.match(calls[0].url, /\/v1\.0\/conference\/videoConferences\/conf-1\/cloudRecords\/getTexts/);
  assert.equal(result.text, "确认进入立项。\n产品部周三前补齐 PRD。");
});

test("queryDingMeetingMinutesText also accepts wrapped transcript payloads", async () => {
  const result = await queryDingMeetingMinutesText("token-1", {
    conferenceId: "conf-2"
  }, async () => {
    return okJson({
      result: {
        paragraphList: [
          { paragraph: "包装方向通过。" },
          { sentenceList: [{ sentence: "供应链下周确认报价。" }] }
        ]
      }
    });
  });

  assert.equal(result.text, "包装方向通过。\n供应链下周确认报价。");
});

test("queryDingMeetingMinutesText accepts AI summary and action item fields", async () => {
  const result = await queryDingMeetingMinutesText("token-1", {
    conferenceId: "conf-ai"
  }, async () => {
    return okJson({
      result: {
        aiSummary: "AI 纪要：确认标准样方向。",
        actionItems: [
          { title: "产品部补齐封样确认书" },
          { text: "运营同步内容素材清单" }
        ]
      }
    });
  });

  assert.equal(result.text, "AI 纪要：确认标准样方向。\n产品部补齐封样确认书\n运营同步内容素材清单");
});

test("queryDingScheduleConferenceHistory resolves appointment meetings to actual conference ids", async () => {
  const calls = [];
  const result = await queryDingScheduleConferenceHistory("token-1", {
    scheduleConferenceId: "schedule-1"
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({
      conferenceList: [
        { conferenceId: "real-conf-1", title: "标准样终审会" }
      ]
    });
  });

  assert.match(calls[0].url, /\/v1\.0\/conference\/videoConferences\/scheduleConferences\/schedule-1\?maxResults=20$/);
  assert.equal(calls[0].options.headers["x-acs-dingtalk-access-token"], "token-1");
  assert.equal(result[0].conferenceId, "real-conf-1");
});

test("queryDingMeetingMinutesTextWithFallback reads minutes from actual conference history", async () => {
  const calls = [];
  const result = await queryDingMeetingMinutesTextWithFallback("token-1", {
    recordingId: "schedule-1",
    scheduleConferenceId: "schedule-1",
    unionId: "union-1"
  }, async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/scheduleConferences/schedule-1")) {
      return okJson({
        conferenceList: [
          { conferenceId: "real-conf-1", title: "标准样终审会" }
        ]
      });
    }
    if (url.includes("/videoConferences/real-conf-1/cloudRecords/getTexts")) {
      return okJson({
        result: {
          aiSummary: "AI 纪要：确认封样标准。"
        }
      });
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({
        code: "cloudRecordNotFound",
        message: "云录制记录未找到/未开启云录制"
      })
    };
  });

  assert.equal(result.text, "AI 纪要：确认封样标准。");
  assert.equal(result.resolvedConferenceId, "real-conf-1");
  assert.equal(result.scheduleConferenceId, "schedule-1");
  assert.match(calls[0].url, /\/videoConferences\/schedule-1\/cloudRecords\/getTexts/);
  assert.match(calls[1].url, /\/scheduleConferences\/schedule-1/);
  assert.match(calls[2].url, /\/videoConferences\/real-conf-1\/cloudRecords\/getTexts/);
});
