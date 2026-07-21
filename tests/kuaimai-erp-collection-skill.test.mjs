import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const skillPath = new URL("../.agents/skills/kuaimai-erp-data-collection/SKILL.md", import.meta.url);
const mapPath = new URL("../.agents/skills/kuaimai-erp-data-collection/references/export-map.md", import.meta.url);

test("Kuaimai ERP collection skill defines a safe repeatable backfill workflow", () => {
  assert.equal(existsSync(skillPath), true);
  assert.equal(existsSync(mapPath), true);
  const skill = readFileSync(skillPath, "utf8");
  assert.match(skill, /^---\nname: kuaimai-erp-data-collection\ndescription:/);
  assert.match(skill, /订单创建时间/);
  assert.match(skill, /三个月内订单/);
  assert.match(skill, /归档订单/);
  assert.match(skill, /npm run collect:kuaimai -- preflight/);
  assert.match(skill, /npm run collect:kuaimai -- upload/);
  assert.match(skill, /erp_collection_batches/);
  assert.match(skill, /erp_source_records/);
  assert.match(skill, /erp_collection_issues/);
  assert.match(skill, /不得.*密码|不得.*Cookie/);
  assert.match(skill, /不得把待验证描述为已接通/);
});
