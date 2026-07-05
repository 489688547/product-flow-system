import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("workflow tasks can be synced to DingTalk todos through the org people picker", () => {
  assert.match(html, /id="syncModal"/);
  assert.match(html, /function openSyncModal\(/);
  assert.match(html, /function confirmSyncModal\(/);
  assert.match(html, /data-sync-task/);
  assert.match(html, /\/api\/dingtalk\/todo\/create/);
  assert.match(html, /dingTodo/);
});

test("review meetings can be created as DingTalk calendar events", () => {
  assert.match(html, /data-create-meeting/);
  assert.match(html, /同步钉钉日程/);
  assert.match(html, /const canCreateMeeting = reviewEditable && state\.text === "待开会"/);
  assert.match(html, /id="syncMeetingFields"/);
  assert.match(html, /\/api\/dingtalk\/calendar\/create/);
  assert.match(html, /dingMeetings/);
});

test("DingTalk sync errors expose actionable API details in the UI", () => {
  assert.match(html, /function formatDingSyncError\(/);
  assert.match(html, /payload\.detail/);
  assert.match(html, /payload\.detail\?\.code/);
  assert.match(html, /payload\.detail\?\.message/);
});

test("review meeting sync sends DingTalk unionIds instead of userIds", () => {
  assert.match(html, /const attendeeUnionIds = users\.map\(dingUnionId\)\.filter\(Boolean\);/);
  assert.match(html, /organizerUnionId: currentUser\?\.dingUser\?\.unionid/);
  assert.match(html, /attendeeUnionIds/);
  assert.doesNotMatch(html, /const attendeeUserIds = users\.map\(dingUserId\)\.filter\(Boolean\);/);
});
