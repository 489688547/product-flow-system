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
