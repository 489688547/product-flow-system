import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const governance = readFileSync(new URL("../src/features/data-center/DataGovernanceWorkspaces.jsx", import.meta.url), "utf8");
const catalogWorkspace = readFileSync(new URL("../src/features/data-center/connections/DataConnectionsWorkspace.jsx", import.meta.url), "utf8");
const domain = readFileSync(new URL("../src/domain/dataConnections.js", import.meta.url), "utf8");

test("data access page uses the dedicated connection workspace", () => {
  assert.match(governance, /DataConnectionsWorkspace/);
  assert.doesNotMatch(catalogWorkspace, /AutomatedConnectionsWorkspace/);
  assert.doesNotMatch(catalogWorkspace, /item\.id !== "douyin-ecommerce"/);
  assert.match(catalogWorkspace, /category === "ecommerce"/);
  assert.match(catalogWorkspace, /等待文件样例/);
  assert.doesNotMatch(domain, /正在等待公司 Mac/);
});

test("store cards honestly wait for samples without opening a configuration dialog", () => {
  assert.match(catalogWorkspace, /storeFileImportPending/);
  assert.match(catalogWorkspace, /请先提供平台后台原始 XLSX \/ CSV/);
  assert.doesNotMatch(catalogWorkspace, /<ConnectorConfigDialog[\s\S]*category === "ecommerce"/);
});
