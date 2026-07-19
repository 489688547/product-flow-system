import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("company home leads with decisions coordination and important changes instead of a metric strip", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  const desk = read("src/features/company/ExecutiveActionDesk.jsx");
  assert.match(home, /ExecutiveActionDesk/);
  assert.match(home, /处理今天需要拍板、协调和升级的经营事项/);
  assert.doesNotMatch(home, /<MetricStrip/);
  assert.match(desk, /今天需要处理/);
  assert.match(desk, /重要变化/);
  assert.match(desk, /待拍板/);
  assert.match(desk, /需要协调/);
  assert.match(desk, /当前没有需要总经办处理的升级事项/);
});

test("executive home loads company-scoped collaboration without changing ordinary platform access", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  assert.match(home, /useCollaboration/);
  assert.match(home, /loadItems\(\{ view: "my_scope", limit: 100 \}\)/);
  assert.match(home, /buildExecutiveActions/);
});

test("app center shows collaboration health per app and drills into the shared workbench", () => {
  const center = read("src/features/platform/AppCenterPage.jsx");
  assert.match(center, /未关闭协同/);
  assert.match(center, /高影响阻塞/);
  assert.match(center, /AppCollaborationHealth/);
  assert.match(center, /onNavigate\("collaboration"\)/);
  assert.match(center, /loadItems\(\{ view: "my_scope", limit: 100 \}\)/);
});
