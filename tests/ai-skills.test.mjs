import test from "node:test";
import assert from "node:assert/strict";
import { createAiD1Mock } from "./helpers/ai-d1-mock.mjs";

const registryUrl = new URL("../functions/api/platform/v1/ai/_shared/skill-registry.js", import.meta.url);
const executive = { userId: "u-1", name: "周总", department: "总经办", title: "总经理", role: "executive" };

test("Skill registry exposes only tools backed by allowed data domains", async () => {
  const { listAvailableSkills } = await import(registryUrl);
  const db = createAiD1Mock();
  const executiveSkills = listAvailableSkills({ db, session: executive, access: { allowed: ["projects", "sales_operations"] } });
  assert.deepEqual(executiveSkills.map(item => item.name), ["strategy_query_projects", "data_center_query_sales"]);
  assert.ok(executiveSkills.every(item => item.type === "function" && item.strict === true));
  assert.ok(executiveSkills.every(item => item.parameters.additionalProperties === false));

  const employeeSkills = listAvailableSkills({ db, session: { department: "产品部", title: "产品经理" }, access: { allowed: ["product_lifecycle"] } });
  assert.deepEqual(employeeSkills.map(item => item.name), ["product_flow_query_lifecycle"]);
});

test("Skill execution rejects unknown, denied and malformed calls before reading data", async () => {
  const { executeSkill } = await import(registryUrl);
  const db = createAiD1Mock();
  const base = { db, session: executive, access: { allowed: ["projects"] } };
  await assert.rejects(executeSkill({ ...base, skillId: "unknown", argumentsText: "{}" }), error => error.code === "AI_SKILL_UNKNOWN");
  await assert.rejects(executeSkill({ ...base, skillId: "supply_chain_query_status", argumentsText: "{}" }), error => error.code === "AI_SKILL_DENIED");
  await assert.rejects(executeSkill({ ...base, skillId: "strategy_query_projects", argumentsText: "{\"arbitrary\":true}" }), error => error.code === "AI_SKILL_ARGUMENTS_INVALID");
  await assert.rejects(executeSkill({ ...base, skillId: "strategy_query_projects", argumentsText: "{bad json}" }), error => error.code === "AI_SKILL_ARGUMENTS_INVALID");
});

test("Skill execution returns bounded source metadata and records", async () => {
  const { executeSkill } = await import(registryUrl);
  const result = await executeSkill({
    db: createAiD1Mock(),
    session: executive,
    access: { allowed: ["projects"], scope: { executive: true, departments: ["总经办"] } },
    skillId: "strategy_query_projects",
    argumentsText: JSON.stringify({ query: "重点", limit: 5 })
  });
  assert.equal(result.skillId, "strategy_query_projects");
  assert.equal(result.appId, "strategy");
  assert.equal(result.recordCount, 1);
  assert.equal(result.records[0].title, "重点项目");
  assert.deepEqual(result.safeArguments, { query: "重点", limit: 5 });
  assert.doesNotMatch(JSON.stringify(result), /password|token|secret|authorization/i);
});
