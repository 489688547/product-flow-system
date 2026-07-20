import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("data center registers user insights as a first-level tab", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  assert.match(app, /data-overview[\s\S]*data-insights[\s\S]*data-products/);
  assert.doesNotMatch(app, /"data-analysis", "数据分析"/);
  assert.match(app, /"data-insights", "用户洞察"/);
  assert.match(page, /insights: <UserInsightsProvider>[\s\S]*<UserInsightsWorkspace/);
  assert.match(page, /用户洞察/);
});

test("workspace follows the approved store-product and tab hierarchy", () => {
  const workspace = read("src/features/data-center/UserInsightsWorkspace.jsx");
  assert.match(workspace, /店铺视角/);
  assert.match(workspace, /产品\/SKU 视角/);
  assert.match(workspace, /用户分析/);
  assert.match(workspace, /竞品分析/);
  assert.match(workspace, /规则与建议/);
  assert.match(workspace, /用户/);
  assert.match(workspace, /商品/);
  assert.match(workspace, /视频/);
  assert.match(workspace, /直播/);
  assert.match(workspace, /系统推荐/);
  assert.match(workspace, /确认类目/);
  assert.match(workspace, /核心竞品/);
  assert.match(workspace, /候选竞品/);
  assert.match(workspace, /新增人工竞品/);
  assert.match(workspace, /停用竞品/);
  assert.match(workspace, /复制为本 App 规则/);
  assert.match(workspace, /编辑规则/);
  assert.match(workspace, /发布规则/);
  assert.match(workspace, /停用规则/);
  assert.match(workspace, /规则版本记录/);
  assert.match(workspace, /仅供参考/);
});

test("workspace exposes safe collection and degraded states", () => {
  const workspace = read("src/features/data-center/UserInsightsWorkspace.jsx");
  assert.match(workspace, /需要登录/);
  assert.match(workspace, /页面结构变化/);
  assert.match(workspace, /部分数据/);
  assert.match(workspace, /数据已过期/);
  assert.match(workspace, /不支持/);
  assert.match(workspace, /最后成功/);
  assert.match(workspace, /latestSnapshot/);
  assert.doesNotMatch(workspace, /最后成功 \{latestRun\.updatedAt/);
  assert.doesNotMatch(workspace, /type="password"/);
});

test("user insights has responsive focus-safe styles", () => {
  const css = read("src/features/data-center/user-insights.css");
  assert.match(css, /\.insight-scope-bar/);
  assert.match(css, /\.insight-view-switch/);
  assert.match(css, /\.insight-tabs/);
  assert.match(css, /\.insight-workspace[\s\S]*:focus-visible/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
