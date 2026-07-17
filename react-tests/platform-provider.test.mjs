import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("company platform mounts a dedicated shared provider", () => {
  assert.match(read("src/main.jsx"), /PlatformProvider/);
  assert.match(read("src/main.jsx"), /<PlatformProvider enabled=\{hasCompanyAccess\}>/);
  assert.match(read("src/state/PlatformProvider.jsx"), /reducePlatformState/);
  assert.match(read("src/state/PlatformProvider.jsx"), /platformExecutionState/);
});

test("platform provider uses its own authenticated persistence boundary", async () => {
  const { platformApiUrl } = await import("../src/state/platformApi.js");
  assert.equal(platformApiUrl("flow.example.com"), "/api/platform");
  assert.match(platformApiUrl("localhost"), /\/api\/platform$/);
  assert.match(read("src/state/PlatformProvider.jsx"), /fetch\(apiUrl/);
});

test("platform provider reconciles personal todos and safely writes back allowed sources", () => {
  const provider = read("src/state/PlatformProvider.jsx");
  assert.match(provider, /reconcilePersonalTodos/);
  assert.match(provider, /syncPersonalTodo/);
  assert.match(provider, /refreshPersonalTodoStatuses/);
  assert.match(provider, /setPersonalTodoDone/);
  assert.match(provider, /\/api\/dingtalk\/todo\/list/);
  assert.match(provider, /window\.location\.pathname\}#home/);
  assert.doesNotMatch(provider, /window\.location\.pathname\}#company/);
  assert.match(provider, /complete_milestone/);
  assert.match(provider, /complete_product_task/);
  assert.match(provider, /updateTask/);
});

test("platform provider exposes governed execution commands", () => {
  const provider = read("src/state/PlatformProvider.jsx");
  [
    "saveRequiredResult",
    "saveDepartmentCommitment",
    "transitionCommitment",
    "saveCommitmentMilestone",
    "saveIncentiveProject",
    "settleIncentive",
    "saveMonthlyReport",
    "transitionReport",
    "appendReportCorrection",
    "ensureReports",
    "archiveStrategy",
    "archiveRequiredResult",
    "archiveDepartmentCommitment",
    "archiveProject",
    "archiveProjectChild",
    "archiveIncentiveProject",
    "archiveMonthlyReport",
    "archiveStatusUpdate"
  ].forEach(command => assert.match(provider, new RegExp(command)));
  assert.match(provider, /state\.departmentCommitments/);
  assert.match(provider, /state\.commitmentMilestones/);
  assert.match(provider, /state\.incentiveProjects/);
  assert.match(provider, /state\.monthlyReports/);
});

test("product task assignment survives a DingTalk sync failure", () => {
  const provider = read("src/state/ProductFlowProvider.jsx");
  assert.match(provider, /executorUnionIds: payload\.executorUnionIds/);
  assert.match(provider, /executorNames: executors\.map/);
  const catchBlock = provider.slice(provider.indexOf("} catch (error)"), provider.indexOf("const scheduleTaskMeeting"));
  assert.match(catchBlock, /executorUnionIds/);
  assert.match(catchBlock, /executorNames/);
});

test("local executive preview has a stable demo union id", () => {
  const auth = read("src/state/AuthProvider.jsx");
  assert.match(auth, /userId: "u-zhou"/);
  assert.match(auth, /unionId: "union-zhou"/);
  assert.match(auth, /name: "周荣庆"/);
});
