import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(new URL("../src/features/data-center/data-connections/DouyinConnectionDialog.jsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/features/data-center/data-connections/DataConnectionsWorkspace.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/state/dataConnectionsApi.js", import.meta.url), "utf8");
const governance = readFileSync(new URL("../src/features/data-center/DataGovernanceWorkspaces.jsx", import.meta.url), "utf8");
const catalogWorkspace = readFileSync(new URL("../src/features/data-center/connections/DataConnectionsWorkspace.jsx", import.meta.url), "utf8");
const domain = readFileSync(new URL("../src/domain/dataConnections.js", import.meta.url), "utf8");

test("data access page uses the dedicated connection workspace", () => {
  assert.match(governance, /AutomatedConnectionsWorkspace/);
  assert.match(governance, /ConnectorCatalogWorkspace/);
  assert.match(governance, /excludedConnectorIds=\{\["douyin-ecommerce"\]\}/);
  assert.match(catalogWorkspace, /excludedConnectorIds/);
  assert.match(workspace, /抖音电商/);
  assert.match(workspace, /添加店铺/);
  assert.match(workspace, /shopAvatarUrl/);
  assert.match(workspace, /shopName/);
  assert.match(workspace, /connectionDisplayState/);
  assert.match(domain, /正在等待公司 Mac/);
});

test("douyin dialog contains only email and password business fields", () => {
  assert.match(dialog, /登录邮箱/);
  assert.match(dialog, /密码/);
  assert.match(dialog, /保存并打开登录/);
  assert.match(dialog, /type=\{passwordVisible \? "text" : "password"\}/);
  for (const removed of ["店铺名称", "账户类型", "后台地址", "登录手机号", "接入方式", "同步数据", "负责人", "公司主体", "链接名称"]) {
    assert.doesNotMatch(dialog, new RegExp(removed));
  }
});

test("revealed passwords clear on timeout, window blur, escape and close", () => {
  assert.match(dialog, /60_000/);
  assert.match(dialog, /window\.addEventListener\("blur"/);
  assert.match(dialog, /clearPlaintext/);
  assert.match(dialog, /onClose/);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage|URLSearchParams/);
});

test("client uses authenticated versioned connection and reveal routes", () => {
  assert.match(api, /\/api\/platform\/v1\/data-connections/);
  assert.match(api, /credentials: "include"/);
  assert.match(api, /expectedVersion/);
  assert.match(api, /\/reveal/);
  assert.doesNotMatch(api, /loginUrl|consoleUrl|owner|captureMethod/);
});
