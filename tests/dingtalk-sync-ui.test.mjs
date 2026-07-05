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

test("DingTalk people picker force-refreshes org before showing colleagues", () => {
  const openSyncModal = html.match(/async function openSyncModal[\s\S]*?function closeSyncModal/)[0];
  assert.match(openSyncModal, /const refreshedOrg = await syncDingOrgCache\(\{ force: true \}\);/);
  assert.match(openSyncModal, /if \(!refreshedOrg \|\| orgCacheExpired\(\)\)/);
  assert.match(openSyncModal, /if \(!ensureDingSyncReady\(\)\) return;/);
});

test("DingTalk sync revalidates selected users after org refresh", () => {
  const confirmSyncModal = html.match(/async function confirmSyncModal[\s\S]*?function completion/)[0];
  assert.match(confirmSyncModal, /const refreshedOrg = await syncDingOrgCache\(\{ force: true \}\);/);
  assert.match(confirmSyncModal, /const selected = resolveSelectedSyncUsers\(\);/);
  assert.match(confirmSyncModal, /请选择仍在职且可同步的同事/);
});

test("review meetings can be created as DingTalk calendar events", () => {
  assert.match(html, /data-create-meeting/);
  assert.match(html, /预约日程/);
  assert.match(html, /const canCreateMeeting = reviewEditable && state\.text === "待开会"/);
  assert.match(html, /id="syncMeetingFields"/);
  assert.match(html, /\/api\/dingtalk\/calendar\/create/);
  assert.match(html, /dingMeetings/);
});

test("review meetings expose separate schedule and instant meeting actions", () => {
  assert.match(html, /data-schedule-meeting/);
  assert.match(html, /data-start-meeting/);
  assert.match(html, /立即开会/);
  assert.match(html, /syncMeetingAction/);
  assert.match(html, /data-sync-action="schedule"/);
  assert.match(html, /data-sync-action="instant"/);
});

test("review meetings can import DingTalk minutes into the product package", () => {
  assert.match(html, /id="minutesModal"/);
  assert.match(html, /data-import-minutes/);
  assert.match(html, /function createMeetingMinutesFromText\(/);
  assert.match(html, /generateMeetingMinutesPoster\(/);
  assert.match(html, /重点纪要图/);
});

test("DingTalk minutes sync fails with a recording id guidance instead of fake success", () => {
  assert.match(html, /\/api\/dingtalk\/meeting\/minutes/);
  assert.match(html, /minutesRecordingId/);
  assert.match(html, /需要钉钉会议录制/);
});

test("DingTalk sync errors expose actionable API details in the UI", () => {
  assert.match(html, /function formatDingSyncError\(/);
  assert.match(html, /payload\.detail/);
  assert.match(html, /payload\.detail\?\.code/);
  assert.match(html, /payload\.detail\?\.message/);
});

test("review meeting sync sends DingTalk unionIds instead of userIds", () => {
  const calendarSync = html.match(/async function syncMeetingToDingCalendar[\s\S]*?function formatDingJsError/)[0];
  assert.match(calendarSync, /const attendeeUnionIds = users\.map\(dingUnionId\)\.filter\(Boolean\);/);
  assert.match(calendarSync, /organizerUnionId: currentUser\?\.dingUser\?\.unionid/);
  assert.match(calendarSync, /attendeeUnionIds/);
  assert.doesNotMatch(calendarSync, /const attendeeUserIds = users\.map\(dingUserId\)\.filter\(Boolean\);/);
});

test("instant DingTalk meetings use staff userIds for the video conference JSAPI", () => {
  assert.match(html, /function startDingVideoMeeting\(/);
  assert.match(html, /const attendeeUserIds = users\.map\(dingUserId\)\.filter\(Boolean\);/);
  assert.match(html, /calleeStaffIds/);
  assert.match(html, /videoConfCall|makeVideoConfCall/);
});
