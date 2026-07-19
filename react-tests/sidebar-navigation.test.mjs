import test from "node:test";
import assert from "node:assert/strict";
import { canViewNavigation, DEFAULT_PERMISSIONS } from "../src/domain/permissions.js";
import { expandedGroupForScreen, groupSidebarNavigation } from "../src/domain/sidebarNavigation.js";

const navigation = [
  ["home", "公司首页", null, "公司经营", "home"],
  ["dashboard", "产品总览", null, "产品全周期", "dashboard"],
  ["progress", "产品进度", null, "产品全周期", "progress"],
  ["supply-overview", "供应链总览", null, "供应链管理", "supply-chain"],
  ["supply-quality", "质量管理", null, "供应链管理", "supply-chain"],
  ["performance-overview", "绩效总览", null, "人事管理", "performance-management"],
  ["performance-mine", "我的绩效", null, "人事管理", "performance-management"],
  ["content-overview", "内容总览", null, "品牌内容协同", "content-overview"],
  ["content-settings", "设置", null, "品牌内容协同", "content-settings"],
  ["handbook", "说明书", null, "平台", "handbook"]
];

const visibleFor = user => navigation.filter(([, , , , permissionKey]) =>
  canViewNavigation(DEFAULT_PERMISSIONS, user, permissionKey)
);

test("groups authorized navigation without creating empty or unauthorized app groups", () => {
  const groups = groupSidebarNavigation(visibleFor({ department: "客服部", title: "客服" }));
  assert.deepEqual(groups.map(group => group.label), ["公司经营", "产品全周期", "人事管理", "品牌内容协同", "平台"]);
  assert.equal(groups.find(group => group.label === "产品全周期").collapsible, true);
  assert.equal(groups.find(group => group.label === "品牌内容协同").items.length, 1);
  assert.equal(groups.find(group => group.label === "品牌内容协同").collapsible, false);
  assert.equal(groups.some(group => group.label === "供应链管理"), false);
});

test("keeps only multi-route business apps collapsible for executive accounts", () => {
  const groups = groupSidebarNavigation(visibleFor({ department: "总经办", title: "总经理" }));
  assert.equal(groups.find(group => group.label === "公司经营").collapsible, false);
  assert.equal(groups.find(group => group.label === "产品全周期").collapsible, true);
  assert.equal(groups.find(group => group.label === "供应链管理").collapsible, true);
  assert.equal(groups.find(group => group.label === "人事管理").collapsible, true);
  assert.equal(groups.find(group => group.label === "平台").collapsible, false);
});

test("auto expands an active child but not the first visible overview", () => {
  const visible = visibleFor({ department: "运营部", title: "运营负责人" });
  assert.equal(expandedGroupForScreen(visible, "supply-quality"), "供应链管理");
  assert.equal(expandedGroupForScreen(visible, "supply-overview"), "");
  assert.equal(expandedGroupForScreen(visible, "home"), "");
});
