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

test("DingTalk people picker uses cached org unless the cache is missing or expired", () => {
  const openSyncModal = html.match(/async function openSyncModal[\s\S]*?function closeSyncModal/)[0];
  assert.match(html, /async function ensureDingOrgCache\(/);
  assert.match(openSyncModal, /const cachedOrg = await ensureDingOrgCache\(\);/);
  assert.match(openSyncModal, /if \(!cachedOrg \|\| orgCacheExpired\(\)\)/);
  assert.match(openSyncModal, /if \(!ensureDingSyncReady\(\)\) return;/);
  assert.doesNotMatch(openSyncModal, /syncDingOrgCache\(\{ force: true \}\)/);
});

test("DingTalk sync revalidates selected users from cached organization data", () => {
  const confirmSyncModal = html.match(/async function confirmSyncModal[\s\S]*?function completion/)[0];
  assert.match(confirmSyncModal, /const cachedOrg = await ensureDingOrgCache\(\);/);
  assert.match(confirmSyncModal, /const selected = resolveSelectedSyncUsers\(\);/);
  assert.match(confirmSyncModal, /请选择仍在职且可同步的同事/);
  assert.doesNotMatch(confirmSyncModal, /syncDingOrgCache\(\{ force: true \}\)/);
});

test("DingTalk operations show a fullscreen loading state while waiting", () => {
  assert.match(html, /id="globalLoading"/);
  assert.match(html, /function showGlobalLoading\(/);
  assert.match(html, /async function withGlobalLoading\(/);
  const openSyncModal = html.match(/async function openSyncModal[\s\S]*?function closeSyncModal/)[0];
  assert.match(openSyncModal, /await ensureDingOrgCache\(\);/);
  const confirmSyncModal = html.match(/async function confirmSyncModal[\s\S]*?function completion/)[0];
  assert.match(confirmSyncModal, /await withGlobalLoading\(syncMeetingAction === "instant" \? "正在拉起钉钉会议" : "正在同步到钉钉", async \(\) => \{/);
  const minutesSync = html.match(/async function syncMinutesFromDing[\s\S]*?function saveMinutesModal/)[0];
  assert.match(minutesSync, /await withGlobalLoading\("正在读取钉钉会议纪要", async \(\) => \{/);
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

test("DingTalk minutes can select a calendar meeting before syncing", () => {
  assert.match(html, /id="loadCalendarMeetings"/);
  assert.match(html, /id="calendarMeetingList"/);
  assert.match(html, /\/api\/dingtalk\/calendar\/events/);
  assert.match(html, /function loadCalendarMeetingsForMinutes\(\)/);
  assert.match(html, /userUnionId,\s+timeMin,\s+timeMax,\s+maxResults: 60/);
  assert.match(html, /event\.conferenceId/);
  assert.match(html, /function detectCalendarMeetingMinutes\(/);
  const detectMinutes = html.match(/async function detectCalendarMeetingMinutes[\s\S]*?function renderCalendarMeetingOptions/)[0];
  assert.doesNotMatch(detectMinutes, /requestDingDelegatedAuthCode/);
  assert.match(detectMinutes, /const authCode = await requestDingSilentAuthCode\(\);/);
  assert.match(detectMinutes, /events,\s+authCode: authCode \|\| undefined,\s+unionId: currentUser\?\.dingUser\?\.unionid/);
  assert.match(html, /aiMinutesTaskUuid/);
  assert.match(html, /AI 听记链接 \/ taskUuid \/ 云录制 conferenceId/);
  assert.match(html, /manualAiMinutes/);
  assert.match(html, /有听记/);
  assert.match(html, /calendarMinuteState/);
  assert.match(html, /scheduleConferenceId: recordingId/);
  assert.match(html, /payload\.resolvedConferenceId/);
  assert.match(html, /可读取/);
  assert.match(html, /未返回/);
  assert.match(html, /minute-state/);
  assert.match(html, /AI 纪要\/闪记/);
  assert.match(html, /await syncMinutesFromDing\(\);/);
  assert.match(html, /正在读取钉钉日历会议/);
  assert.doesNotMatch(html, /getDingEnvironment/);
  assert.match(html, /detectDingTalkEnvironment\(\)/);
});

test("DingTalk AI minutes prefer silent user auth and degrade gracefully on 500205", () => {
  assert.match(html, /function isUnsupportedDingAiMinutesScope/);
  assert.match(html, /500205\|50205\|委托授权需要填写委托类型的权限点/);
  assert.match(html, /async function requestDingSilentAuthCode\(/);
  assert.match(html, /async function requestDingUserAuthCode\(/);
  const userAuth = html.match(/async function requestDingUserAuthCode[\s\S]*?function persistDingUser/)[0];
  assert.match(userAuth, /const silent = await requestDingSilentAuthCode\(\);/);
  assert.match(userAuth, /requestDingDelegatedAuthCode\(rpcScope\)/);
  assert.match(userAuth, /isUnsupportedDingAiMinutesScope/);
  const detectMinutes = html.match(/async function detectCalendarMeetingMinutes[\s\S]*?function renderCalendarMeetingOptions/)[0];
  assert.doesNotMatch(detectMinutes, /Minutes\.Content\.Read/);
  const minutesSync = html.match(/async function syncMinutesFromDing[\s\S]*?async function syncMeetingToDingCalendar/)[0];
  assert.match(minutesSync, /requestDingUserAuthCode\("Minutes\.Content\.Read"\)/);
  assert.match(minutesSync, /showUnsupportedDingAiMinutesScope/);
  assert.match(minutesSync, /直接粘贴钉钉 AI 听记正文/);
  assert.match(html, /权限管理」里搜索并申请 AI 听记/);
});

test("DingTalk sync errors expose actionable API details in the UI", () => {
  assert.match(html, /function formatDingSyncError\(/);
  assert.match(html, /payload\.detail/);
  assert.match(html, /payload\.detail\?\.code/);
  assert.match(html, /payload\.detail\?\.message/);
});

test("DingTalk minutes permission errors show an application permission action", () => {
  assert.match(html, /function renderMinutesPermissionError\(/);
  assert.match(html, /function dingPayloadText\(/);
  assert.match(html, /VideoConference\.Conference\.Read/);
  assert.match(html, /打开权限申请/);
  assert.match(html, /className = "minutes-status permission"/);
  assert.match(html, /replace\(\/%00\/g, ""\)/);
  assert.doesNotMatch(html, /dingConfig/);
  const minutesSync = html.match(/async function syncMinutesFromDing[\s\S]*?async function syncMeetingToDingCalendar/)[0];
  assert.match(minutesSync, /if \(renderMinutesPermissionError\(payload\)\) return;/);
});

test("DingTalk minutes without cloud recording show a readable recovery message", () => {
  assert.match(html, /function renderMinutesRecordingError\(/);
  assert.match(html, /cloudRecordNotFound\|50513/);
  assert.match(html, /钉钉接口没有返回这个会议的 AI 纪要\/闪记文本/);
  assert.match(html, /直接粘贴会议纪要后生成资料/);
  const minutesSync = html.match(/async function syncMinutesFromDing[\s\S]*?async function syncMeetingToDingCalendar/)[0];
  assert.match(minutesSync, /if \(renderMinutesRecordingError\(payload\)\) return;/);
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

test("instant DingTalk meetings wait for conference JSAPI readiness before calling", () => {
  assert.match(html, /function hasDingConferenceApi\(/);
  assert.match(html, /function waitForDingConferenceApi\(/);
  const videoCall = html.match(/async function callDingVideoConference[\s\S]*?async function startDingVideoMeeting/)[0];
  assert.match(videoCall, /const api = await waitForDingConferenceApi\(\);/);
  assert.match(videoCall, /if \(api\.ready\) api\.ready\(run\);/);
  assert.match(videoCall, /api\.error\(fail\);/);
});
