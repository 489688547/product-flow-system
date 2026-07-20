import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  DATA_ACCESS_CATEGORIES,
  dataAccessCategoryFor,
  dataAccessSourceIds
} from "../src/domain/dataAccessCatalog.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("data access has the approved categories and stable membership", () => {
  assert.deepEqual(DATA_ACCESS_CATEGORIES.map(item => item.label), ["电商平台", "ERP", "公司数据"]);
  assert.equal(dataAccessCategoryFor("connector", "douyin-ecommerce"), "ecommerce");
  assert.equal(dataAccessCategoryFor("connector", "kuaimai-erp"), "erp");
  assert.equal(dataAccessCategoryFor("platform", "kuaimai"), "erp");
  assert.equal(dataAccessCategoryFor("platform", "dingtalk"), "company");
  assert.equal(dataAccessCategoryFor("platform", "aliyun"), "company");
  assert.equal(dataAccessCategoryFor("vault", "nas"), "company");
  assert.deepEqual(dataAccessSourceIds("ecommerce", "connector"), [
    "douyin-ecommerce",
    "oceanengine",
    "kuaishou",
    "taobao",
    "pinduoduo",
    "xiaohongshu",
    "jd-jingmai"
  ]);
});

test("the visible navigation has one data access entry and no platform connection entry", () => {
  const app = read("src/App.jsx");
  assert.match(app, /\["data-sources", "数据接入"/);
  assert.doesNotMatch(app, /\["data-connections", "平台连接"/);
  assert.match(app, /route\.screen === "data-connections"[\s\S]*screen: "data-sources"[\s\S]*detail: "company"/);
});

test("the workspace exposes the three approved categories and no old tabs", () => {
  const workspace = read("src/features/data-center/connections/DataConnectionsWorkspace.jsx");
  assert.match(workspace, /DataAccessTabs/);
  assert.match(workspace, /ErpAccessWorkspace/);
  assert.match(workspace, /CompanyDataWorkspace/);
  assert.doesNotMatch(workspace, /经营数据连接器|内部系统保险箱/);
});

test("legacy and readiness links open company data inside data access", () => {
  const app = read("src/App.jsx");
  const readiness = read("src/features/handbook/EnvironmentReadinessPanel.jsx");
  assert.match(app, /route\.screen === "data-connections"/);
  assert.match(app, /screen: "data-sources"/);
  assert.match(app, /detail: "company"/);
  assert.match(readiness, /#\/data-sources\/company/);
  assert.match(readiness, /前往数据接入/);
  assert.doesNotMatch(readiness, /前往平台连接/);
});

test("platform orchestration lives in state and the catalog primitives are accessible", () => {
  const hook = read("src/state/usePlatformConnections.js");
  const tabs = read("src/features/data-center/connections/DataAccessTabs.jsx");
  const card = read("src/features/data-center/connections/DataAccessCard.jsx");
  assert.match(hook, /loadPlatformConnections/);
  assert.match(hook, /savePlatformConnection/);
  assert.match(hook, /disablePlatformConnection/);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-selected/);
  assert.match(tabs, /ArrowRight/);
  assert.match(tabs, /ArrowLeft/);
  assert.match(card, /<article/);
  assert.match(card, /disabledReason/);
  assert.match(card, /aria-label/);
});

test("Kuaimai is one ERP card and company data owns DingTalk Aliyun and NAS", () => {
  const connectorCatalog = read("src/features/data-center/connections/ConnectorCatalog.jsx");
  const erp = read("src/features/data-center/connections/ErpAccessWorkspace.jsx");
  const company = read("src/features/data-center/connections/CompanyDataWorkspace.jsx");
  assert.match(connectorCatalog, /definitions = DATA_CONNECTOR_DEFINITIONS/);
  assert.match(erp, /kuaimai-erp/);
  assert.match(erp, /platformIds=\{\["kuaimai"\]\}/);
  assert.match(erp, /数据同步/);
  assert.match(company, /dingtalk/);
  assert.match(company, /aliyun/);
  assert.match(company, /nas/);
  assert.doesNotMatch(company, /KUAIMAI_APP_KEY|DINGTALK_APP_SECRET/);
});

test("data access catalog uses the approved responsive grid and visible focus", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.data-access-grid[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.data-access-tabs button:focus-visible/);
  assert.match(css, /@media \(max-width: 1179px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.data-access-grid[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.connection-loading span/);
});

test("durable product design and integration rules define the unified catalog", () => {
  const product = read("PRODUCT.md");
  const design = read("DESIGN.md");
  const integrations = read("docs/platform/integrations.md");
  assert.match(product, /数据接入[\s\S]*电商平台[\s\S]*ERP[\s\S]*公司数据/);
  assert.match(design, /数据接入目录[\s\S]*同一平台只显示一个入口/);
  assert.match(integrations, /同一平台只显示一个目录入口/);
  assert.match(integrations, /连接凭据[\s\S]*同步实例[\s\S]*不可[\s\S]*混存/);
});
