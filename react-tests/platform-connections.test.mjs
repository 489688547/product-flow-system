import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = path => readFileSync(resolve(path), "utf8");
const workspacePath = "src/features/data-center/PlatformConnectionsWorkspace.jsx";
const cssPath = "src/features/data-center/platform-connections.css";
const apiPath = "src/state/platformConnectionsApi.js";

test("data center embeds platform connections inside the unified data access workspace", () => {
  assert.equal(existsSync(workspacePath), true);
  const app = read("src/App.jsx");
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const governance = read("src/features/data-center/DataGovernanceWorkspaces.jsx");
  assert.match(app, /route\.screen === "data-connections"/);
  assert.doesNotMatch(app, /\["data-connections", "平台连接"/);
  assert.doesNotMatch(page, /connections: <PlatformConnectionsWorkspace/);
  assert.match(page, /canManagePlatformConnections/);
  assert.match(governance, /canManagePlatform/);
  assert.match(read("src/domain/permissions.js"), /canManagePlatformConnections[\s\S]*role === "executive"[\s\S]*canManagePermissions/);
});

test("platform catalog uses specific fields and keeps unavailable platforms honest", () => {
  const domain = read("src/domain/platformConnections.js");
  assert.match(domain, /id: "dingtalk"[\s\S]*应用凭证[\s\S]*应用密钥/);
  assert.match(domain, /id: "kuaimai"[\s\S]*应用凭证[\s\S]*应用密钥[\s\S]*访问令牌[\s\S]*刷新令牌/);
  assert.match(domain, /id: "lingsuan-ai-gateway"[\s\S]*灵算 AI 网关[\s\S]*API Key[\s\S]*Actor Authorization/);
  assert.match(domain, /id: "aliyun"[\s\S]*available: false[\s\S]*当前尚无可用的系统适配器/);
});

test("boss flow saves and validates without exposing infrastructure language", () => {
  const workspace = read(workspacePath);
  assert.match(workspace, /保存并验证/);
  assert.match(workspace, /已配置 · 留空保持原值/);
  assert.match(workspace, /连接已验证并启用/);
  assert.match(workspace, /原连接未受影响/);
  assert.match(workspace, /showValue \? "text" : "password"/);
  assert.match(workspace, /仅最高权限管理员可以修改平台连接/);
  assert.doesNotMatch(workspace, /DINGTALK_APP_KEY|KUAIMAI_APP_KEY|PLATFORM_CREDENTIAL_MASTER_KEY|AES|D1/);
  assert.doesNotMatch(workspace, /localStorage|sessionStorage/);
});

test("connection UI covers loading errors permissions disabled actions and inline confirmation", () => {
  const workspace = read(workspacePath);
  assert.match(workspace, /aria-busy="true"/);
  assert.match(workspace, /role="alert"/);
  assert.match(workspace, /role="status"/);
  assert.match(workspace, /disabledReason/);
  assert.match(workspace, /确认停用/);
  assert.match(workspace, /PLATFORM_CONNECTION_VERSION_CONFLICT/);
  assert.match(workspace, /本次填写仍保留/);
  assert.match(workspace, /放弃本次填写/);
  assert.match(workspace, /className="platform-connection-back"[\s\S]*disabled=\{busy\}/);
  assert.match(workspace, /platformButtonRefs[\s\S]*\.focus\(\)/);
  assert.match(workspace, /重新加载/);
  assert.match(workspace, /available/);
});

test("platform connection API client never caches credential fields", () => {
  assert.equal(existsSync(apiPath), true);
  const api = read(apiPath);
  assert.match(api, /\/api\/platform\/v1\/platform-connections/);
  assert.match(api, /method: "PUT"/);
  assert.match(api, /method: "DELETE"/);
  assert.match(api, /encodeURIComponent\(platformId\)/);
  assert.match(api, /method: "POST"/);
  assert.match(api, /purpose, confirmation/);
  assert.match(api, /credentials: "include"/);
  assert.doesNotMatch(api, /localStorage|sessionStorage/);
});

test("platform connection UI accepts controlled state and a filtered embedded detail", () => {
  const workspace = read(workspacePath);
  assert.match(workspace, /platformIds/);
  assert.match(workspace, /initialPlatformId/);
  assert.match(workspace, /embedded/);
  assert.match(workspace, /controller/);
  assert.match(workspace, /controller\?\.save/);
  assert.match(workspace, /controller\?\.disable/);
  assert.match(workspace, /controller\?\.reveal/);
  assert.match(workspace, /showBackButton/);
  assert.match(workspace, /platformIdKey/);
  assert.doesNotMatch(workspace, /import \{[\s\S]*loadPlatformConnections[\s\S]*\} from "\.\.\/\.\.\/state\/platformConnectionsApi\.js"/);
});

test("saved Lingsuan values require explicit confirmation and remain transient", () => {
  const workspace = read(workspacePath);
  const controller = read("src/state/usePlatformConnections.js");
  assert.match(workspace, /显示已保存内容/);
  assert.match(workspace, /查看灵算凭据/);
  assert.match(workspace, /本次查看用途/);
  assert.match(workspace, /readOnly/);
  assert.match(workspace, /revealed\.fields/);
  assert.match(workspace, /setTimeout/);
  assert.match(workspace, /visibilitychange/);
  assert.match(workspace, /document\.hidden/);
  assert.match(workspace, /revealActive/);
  assert.match(workspace, /clearRevealed/);
  assert.doesNotMatch(workspace, /className="platform-connection-revealed" role="status"/);
  assert.match(workspace, /role="status">仅当前页面暂时可见/);
  assert.doesNotMatch(workspace, /localStorage|sessionStorage/);
  assert.match(controller, /canManage/);
  assert.match(controller, /reveal/);
});

test("connection layout is restrained responsive and keyboard visible", () => {
  assert.equal(existsSync(cssPath), true);
  const css = read(cssPath);
  assert.match(css, /\.platform-connection-row:focus-visible/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.3fr\) minmax\(280px, \.7fr\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /border-(?:left|right):\s*[2-9]/);
  assert.doesNotMatch(css, /border-radius:\s*(?:2[4-9]|[3-9]\d)px/);
});

test("environment blockers link to the matching data access category", () => {
  const panel = read("src/features/handbook/EnvironmentReadinessPanel.jsx");
  assert.match(panel, /前往数据接入/);
  assert.match(panel, /#\/data-sources\/company/);
  assert.match(panel, /#\/data-sources\/erp/);
  assert.match(panel, /钉钉应用凭证/);
  assert.match(panel, /公司数据库连接/);
});

test("durable platform sources register the shared API and provider boundaries", () => {
  const registry = JSON.parse(read("docs/platform/integration-registry.json"));
  for (const platformId of ["dingtalk", "kuaimai", "cloudflare-pages", "cloudflare-d1"]) {
    const platform = registry.platforms.find(item => item.id === platformId);
    assert.ok(platform, `${platformId} must stay registered`);
    assert.equal(platform.apiRoutes.includes("/api/platform/v1/platform-connections"), true);
  }
  assert.match(read("docs/platform/api-catalog.md"), /\/api\/platform\/v1\/platform-connections/);
  assert.match(read("docs/platform/integrations.md"), /平台连接保险箱/);
  assert.match(read("PRODUCT.md"), /平台连接/);
  assert.match(read("DESIGN.md"), /平台专属配置/);
});
