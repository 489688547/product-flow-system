import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGIN_STATE_LABELS,
  PLATFORM_LOGIN_TARGETS,
  buildPlatformLoginStates
} from "../src/domain/platformLoginState.js";

const 快麦登录失败 = { providerId: "kuaimai", resourceType: "inventory", status: "waiting_human", errorCode: "KUAIMAI_LOGIN_REQUIRED", updatedAt: "2026-08-03T02:32:00Z" };
const 快麦成功 = { providerId: "kuaimai", resourceType: "order_items", status: "success", updatedAt: "2026-08-03T07:03:00Z" };

test("按平台汇总：登录失败能被认出来", () => {
  const [快麦] = buildPlatformLoginStates([快麦登录失败], { platforms: { kuaimai: PLATFORM_LOGIN_TARGETS.kuaimai } });
  assert.equal(快麦.state, "login_required");
  assert.match(快麦.reason, /KUAIMAI_LOGIN_REQUIRED/);
  assert.equal(快麦.since, "2026-08-03T02:32:00Z");
});

test("以最近一次有结论的采集为准：之后采成功了就算登录着", () => {
  // 登录掉了又登回来，最近的成功才是当前判据。
  const [快麦] = buildPlatformLoginStates([快麦登录失败, 快麦成功], { platforms: { kuaimai: PLATFORM_LOGIN_TARGETS.kuaimai } });
  assert.equal(快麦.state, "signed_in");
  assert.equal(快麦.since, "2026-08-03T07:03:00Z");
});

test("非登录类失败不改变登录判断", () => {
  // 超时、页面结构变化说明的是别的问题，把它们算成「登录掉了」会让人去做无用的重新登录。
  const 超时 = { providerId: "kuaimai", resourceType: "sales_items", status: "failed", errorCode: "KUAIMAI_DOWNLOAD_CENTER_TIMEOUT", updatedAt: "2026-08-03T07:12:00Z" };
  const [快麦] = buildPlatformLoginStates([快麦成功, 超时], { platforms: { kuaimai: PLATFORM_LOGIN_TARGETS.kuaimai } });
  assert.equal(快麦.state, "signed_in");
});

test("没有采集记录时明说无法判断，不猜成已登录", () => {
  const [抖音] = buildPlatformLoginStates([], { platforms: { "douyin-ecommerce": PLATFORM_LOGIN_TARGETS["douyin-ecommerce"] } });
  assert.equal(抖音.state, "unknown");
  assert.match(抖音.reason, /还没有采集记录/);
});

test("每一项都带判据时间：这是上次采集时的状态，不是此刻的真相", () => {
  // 采集是定时的，登录可能刚掉也可能刚恢复，记录都还没跟上。
  // 页面必须把时间显示出来，否则会让人在「显示已登录」时反复排查别的原因。
  const [快麦] = buildPlatformLoginStates([快麦成功], { platforms: { kuaimai: PLATFORM_LOGIN_TARGETS.kuaimai } });
  assert.ok(快麦.since, "必须给出判据时间");
  assert.equal(LOGIN_STATE_LABELS.signed_in, "上次采集时已登录");
});

test("两个平台的登录入口不同，不能都当成链接", () => {
  // 快麦跑在当前浏览器的扩展里，链接正好落在对的地方；
  // 抖音跑在独立的专用浏览器里，网页链接打不开它。
  assert.equal(PLATFORM_LOGIN_TARGETS.kuaimai.openIn, "current_browser");
  assert.equal(PLATFORM_LOGIN_TARGETS["douyin-ecommerce"].openIn, "dedicated_browser");
});
