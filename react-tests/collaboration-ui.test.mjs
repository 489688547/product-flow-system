import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("collaboration workbench exposes six responsibility views and a dense shared table", () => {
  const page = read("src/features/collaboration/CollaborationPage.jsx");
  const table = read("src/features/collaboration/CollaborationTable.jsx");
  assert.match(page, /待我部门接收/);
  assert.match(page, /执行中/);
  assert.match(page, /等待其他部门/);
  assert.match(page, /待我验收/);
  assert.match(page, /我参与的/);
  assert.match(page, /已完成/);
  assert.match(page, /role="tablist"/);
  assert.match(table, /DataTable/);
  assert.match(table, /minWidth=\{1120\}/);
  assert.match(table, /事项/);
  assert.match(table, /发起 \/ 主责/);
  assert.match(table, /下一步/);
});

test("detail and editor cover responsibility transitions creation editing and archive", () => {
  const detail = read("src/features/collaboration/CollaborationDetailPanel.jsx");
  const editor = read("src/features/collaboration/CollaborationEditor.jsx");
  assert.match(detail, /collaborationTransitionsFor/);
  assert.match(detail, /确认接收/);
  assert.match(detail, /标记阻塞并请求协调/);
  assert.match(detail, /提交发起方验收/);
  assert.match(detail, /活动记录/);
  assert.match(detail, /同步到钉钉待办/);
  assert.match(detail, /dingTodo\.lastError/);
  assert.match(detail, /user\?\.userId \|\| user\?\.userid/);
  assert.match(detail, /user\?\.unionId \|\| user\?\.unionid/);
  assert.match(editor, /OrgSelect/);
  assert.match(editor, /user\?\.userId \|\| user\?\.userid/);
  assert.match(editor, /user\?\.unionId \|\| user\?\.unionid/);
  assert.match(editor, /DatePickerField/);
  assert.match(editor, /businessImpact/);
  assert.match(editor, /form\.kind !== "decision" \|\| form\.ownerUser/);
  assert.match(editor, /决策人（必填）/);
  assert.match(editor, /updateItem/);
  assert.match(editor, /archived: true/);
});

test("all authenticated employees get a feature-flagged collaboration route", () => {
  const app = read("src/App.jsx");
  const permissions = read("src/domain/permissions.js");
  const companyNavigation = app.match(/const COMPANY_NAV = \[([\s\S]*?)\n\];/)?.[1] || "";
  const productNavigation = app.match(/const PRODUCT_NAV = \[([\s\S]*?)\n\];/)?.[1] || "";
  assert.match(app, /CollaborationPage/);
  assert.equal((companyNavigation.match(/\["collaboration", "部门协同"/g) || []).length, 1);
  assert.equal((productNavigation.match(/\["collaboration", "部门协同"/g) || []).length, 1);
  assert.match(app, /featureFlagEnabled\("executiveCollaborationHub"\)/);
  assert.match(app, /collaboration: <CollaborationPage/);
  assert.match(permissions, /collaboration: \{ departments: \["\*"\] \}/);
});

test("collaboration UI defines responsive desktop panel and DingTalk mobile behavior", () => {
  const styles = read("src/features/collaboration/collaboration.css");
  assert.match(styles, /@media \(min-width: 1180px\)/);
  assert.match(styles, /@media \(max-width: 759px\)/);
  assert.match(styles, /100dvh/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});
