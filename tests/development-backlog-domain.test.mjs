import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKLOG_MODULES,
  backlogActor,
  findBacklogConflicts,
  formatBacklogDisplayId,
  normalizeBacklogDraft,
  normalizeScopePath,
  resolveBacklogAction
} from "../src/domain/developmentBacklog.js";

const executive = backlogActor({ userId: "exec-1", name: "周总", department: "总经办", role: "executive" });
const developer = backlogActor({ userId: "dev-1", name: "小李", department: "产品部", role: "employee" });
const otherDeveloper = backlogActor({ userId: "dev-2", name: "小王", department: "产品部", role: "employee" });

test("backlog draft normalization uses registered modules and clarification for incomplete scope", () => {
  assert.equal(BACKLOG_MODULES.some(module => module.id === "data-acquisition"), true);
  const clarification = normalizeBacklogDraft({
    title: "  修复扩展重载  ",
    background: "扩展重载后恢复任务领取",
    moduleId: "data-acquisition",
    priority: "p1",
    acceptanceCriteria: [],
    scopePaths: [],
    sourceType: "manual"
  });
  assert.equal(clarification.title, "修复扩展重载");
  assert.equal(clarification.status, "clarification");

  const ready = normalizeBacklogDraft({
    ...clarification,
    acceptanceCriteria: ["重载后自动领取任务"],
    scopePaths: ["chrome-extension/company-data-collector/"]
  });
  assert.equal(ready.status, "ready");
  assert.throws(
    () => normalizeBacklogDraft({ ...ready, moduleId: "invented-module" }),
    error => error.code === "BACKLOG_MODULE_NOT_REGISTERED"
  );
});

test("scope paths reject unsafe values and normalize repository-relative prefixes", () => {
  assert.equal(normalizeScopePath("./src//features/data-center/"), "src/features/data-center/");
  assert.equal(normalizeScopePath("src/App.jsx"), "src/App.jsx");
  for (const value of [
    "/Users/roger/project/src",
    "../src",
    "src/../secrets",
    "C:\\project\\src",
    "src/**",
    "src/\u0000bad"
  ]) {
    assert.throws(() => normalizeScopePath(value), error => error.code === "BACKLOG_SCOPE_INVALID", value);
  }
});

test("active parent-child paths conflict while completed work does not", () => {
  const candidate = {
    id: "new",
    moduleId: "data-center",
    scopePaths: ["src/features/data-center/"]
  };
  const conflicts = findBacklogConflicts(candidate, [
    {
      id: "old",
      displayId: "DEV-000001",
      title: "数据总览",
      status: "in_progress",
      moduleId: "data-center",
      ownerUserId: "dev-2",
      ownerName: "小王",
      claimedBranch: "codex/data-overview",
      scopePaths: ["src/features/data-center/DataOverview.jsx"]
    },
    {
      id: "done",
      displayId: "DEV-000002",
      title: "旧改动",
      status: "completed",
      moduleId: "data-center",
      scopePaths: ["src/features/data-center/"]
    }
  ]);
  assert.deepEqual(conflicts.map(conflict => conflict.displayId), ["DEV-000001"]);
  assert.equal(conflicts[0].path, "src/features/data-center/");
});

test("same active module conflicts when either scope is missing", () => {
  const conflicts = findBacklogConflicts(
    { id: "new", moduleId: "company-platform", scopePaths: [] },
    [{ id: "old", displayId: "DEV-000003", status: "blocked", moduleId: "company-platform", scopePaths: ["src/App.jsx"] }]
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].reason, "module_scope_unknown");
});

test("claim requires safe branch and returns an in-progress ownership patch", () => {
  const result = resolveBacklogAction(
    { id: "item-1", status: "ready", version: 1, ownerUserId: null },
    "claim",
    developer,
    { branch: "codex/development-backlog" }
  );
  assert.equal(result.toStatus, "in_progress");
  assert.deepEqual(result.patch, {
    status: "in_progress",
    ownerUserId: "dev-1",
    ownerName: "小李",
    claimedBranch: "codex/development-backlog",
    blockedReason: null,
    resumeCondition: null
  });
  assert.throws(
    () => resolveBacklogAction({ status: "ready" }, "claim", developer, { branch: "main" }),
    error => error.code === "BACKLOG_BRANCH_INVALID"
  );
});

test("only the assignee or executive advances development and only executive completes", () => {
  const item = { id: "item-1", status: "in_progress", ownerUserId: "dev-1", version: 2 };
  assert.throws(
    () => resolveBacklogAction(item, "submit_review", otherDeveloper, { acceptanceEvidence: "tests pass" }),
    error => error.code === "BACKLOG_FORBIDDEN"
  );
  assert.throws(
    () => resolveBacklogAction(item, "submit_review", developer, {}),
    error => error.code === "BACKLOG_ACCEPTANCE_EVIDENCE_REQUIRED"
  );
  assert.equal(
    resolveBacklogAction(item, "submit_review", developer, { acceptanceEvidence: "测试与构建通过" }).toStatus,
    "review"
  );
  assert.throws(
    () => resolveBacklogAction({ ...item, status: "review" }, "complete", developer, {}),
    error => error.code === "BACKLOG_FORBIDDEN"
  );
  assert.equal(
    resolveBacklogAction({ ...item, status: "review" }, "complete", executive, {}).toStatus,
    "completed"
  );
});

test("block requires a reason and resume condition and reopen is executive-only", () => {
  const item = { id: "item-1", status: "in_progress", ownerUserId: "dev-1" };
  assert.throws(
    () => resolveBacklogAction(item, "block", developer, { blockedReason: "等待数据" }),
    error => error.code === "BACKLOG_RESUME_CONDITION_REQUIRED"
  );
  const blocked = resolveBacklogAction(item, "block", developer, {
    blockedReason: "等待平台真实样本",
    resumeCondition: "样本文件已上传"
  });
  assert.equal(blocked.toStatus, "blocked");
  assert.equal(resolveBacklogAction({ ...item, status: "blocked" }, "resume", developer, {}).toStatus, "in_progress");
  assert.throws(
    () => resolveBacklogAction({ ...item, status: "completed" }, "reopen", developer, { reason: "继续优化" }),
    error => error.code === "BACKLOG_FORBIDDEN"
  );
  assert.equal(
    resolveBacklogAction({ ...item, status: "completed" }, "reopen", executive, { reason: "验收发现回归" }).toStatus,
    "ready"
  );
});

test("display identifiers are stable and zero padded", () => {
  assert.equal(formatBacklogDisplayId(1), "DEV-000001");
  assert.equal(formatBacklogDisplayId(1234567), "DEV-1234567");
});
