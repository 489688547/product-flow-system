import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("connector catalog uses eight local logo assets and one Ocean Engine entry", () => {
  const officialProducts = {
    douyin: "抖店-抖音电商商家版",
    oceanengine: "巨量引擎",
    kuaishou: "快手小店商家版",
    taobao: "千牛",
    pinduoduo: "拼多多商家版",
    xiaohongshu: "小红书千帆",
    jd: "京麦-京东商家版",
    kuaimai: "快麦ERP",
  };
  for (const [name, product] of Object.entries(officialProducts)) {
    assert.equal(existsSync(resolve(root, `src/assets/connectors/${name}.svg`)), true, `${name}.svg must exist`);
    const logo = read(`src/assets/connectors/${name}.svg`);
    assert.match(logo, /data:image\/jpeg;base64,/, `${name}.svg must embed the official product artwork`);
    assert.match(logo, new RegExp(product), `${name}.svg must identify its official product source`);
  }
  const catalog = read("src/features/data-center/connections/ConnectorCatalog.jsx");
  assert.match(catalog, /DATA_CONNECTOR_DEFINITIONS/);
  assert.match(catalog, /douyin\.svg/);
  assert.match(catalog, /oceanengine\.svg/);
  assert.match(catalog, /kuaimai\.svg/);
  assert.match(catalog, /添加连接/);
  assert.match(catalog, /管理连接/);
  assert.doesNotMatch(catalog, /巨量千川[\s\S]*巨量千川/);
});

test("connector dialog is schema driven and treats OTP as instructions", () => {
  const dialog = read("src/features/data-center/connections/ConnectorConfigDialog.jsx");
  assert.match(dialog, /definition\.fields/);
  assert.match(dialog, /definition\.identityLabel/);
  assert.match(dialog, /definition\.accountTypes/);
  assert.match(dialog, /definition\.datasets/);
  assert.match(dialog, /inferConnectorCaptureMethod/);
  assert.match(dialog, /自动识别接入方式/);
  assert.match(dialog, /网页登录信息/);
  assert.match(dialog, /API 接口信息/);
  assert.match(dialog, /ACCOUNT_TYPE_LABELS/);
  assert.match(dialog, /DATASET_LABELS/);
  assert.match(dialog, /type=\{field\.type === "password"/);
  assert.match(dialog, /已加密保存/);
  assert.match(dialog, /验证码不会被保存/);
  assert.match(dialog, /等待人工验证/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /保存并验证/);
  assert.doesNotMatch(dialog, /<label>连接名称/);
  assert.doesNotMatch(dialog, /<label>公司主体/);
  assert.doesNotMatch(dialog, /<label>接入方式/);
  assert.doesNotMatch(dialog, /<label>负责人/);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage|indexedDB/);
});

test("data connections workspace organizes ecommerce ERP and company data", () => {
  const workspace = read("src/features/data-center/connections/DataConnectionsWorkspace.jsx");
  const tabs = read("src/features/data-center/connections/DataAccessTabs.jsx");
  const erp = read("src/features/data-center/connections/ErpAccessWorkspace.jsx");
  const company = read("src/features/data-center/connections/CompanyDataWorkspace.jsx");
  const vault = read("src/features/data-center/connections/InternalVaultWorkspace.jsx");
  assert.match(workspace, /DataAccessTabs/);
  assert.match(workspace, /ErpAccessWorkspace/);
  assert.match(workspace, /CompanyDataWorkspace/);
  assert.match(tabs, /DATA_ACCESS_CATEGORIES/);
  assert.match(workspace, /ConnectorCatalog/);
  assert.match(workspace, /ConnectorConfigDialog/);
  assert.match(workspace, /saveConnection/);
  assert.match(workspace, /saveVaultItem/);
  assert.match(erp, /kuaimai-erp/);
  assert.match(company, /InternalVaultWorkspace/);
  assert.match(company, /PlatformConnectionsWorkspace/);
  assert.match(vault, /INTERNAL_VAULT_TYPES/);
  for (const text of ["NAS", "邮箱", "财务系统", "政务 / SaaS", "自定义内部系统"]) assert.match(vault, new RegExp(text));
  assert.match(vault, /查看与复制全程留痕/);
  assert.match(vault, /查看加密凭证/);
  assert.match(vault, /setTimeout[\s\S]*60000/);
});

test("legacy generic source form is removed and security copy is updated", () => {
  const workspaces = read("src/features/data-center/DataGovernanceWorkspaces.jsx");
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  assert.match(workspaces, /DataConnectionsWorkspace/);
  assert.doesNotMatch(workspaces, /function SourceForm/);
  assert.doesNotMatch(workspaces, /新增数据源/);
  assert.match(workspaces, /敏感信息加密保存/);
  assert.match(page, /canManage/);
  assert.match(page, /analysis: <DataAnalysis/);
});

test("connector UI has responsive dialog and visible focus rules", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /\.connector-catalog-grid/);
  assert.match(styles, /\.connector-card/);
  assert.match(styles, /\.connection-tabs/);
  assert.match(styles, /\.connector-dialog/);
  assert.match(styles, /\.connector-method-indicator/);
  assert.match(styles, /\.connector-credential-group/);
  assert.match(styles, /\.internal-vault/);
  assert.match(styles, /\.connector-card:focus-visible/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*connector-catalog-grid/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*connector-catalog-grid/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*connector-dialog/);
});
