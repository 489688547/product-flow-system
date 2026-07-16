import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDecisionTodoPayload, buildPersonalTodoPayload } from "../src/domain/platformNotifications.js";

test("decision todo targets the decision owner with a stable project link", () => {
  const payload = buildDecisionTodoPayload(
    { id: "d1", title: "是否追加预算", recommendation: "追加两周预算", dueDate: "2026-07-20" },
    { id: "p1", name: "重点项目" },
    { unionid: "creator-union", name: "项目负责人" },
    { unionid: "owner-union", name: "周总" },
    "https://flow.example.com/#projects"
  );
  assert.match(payload.subject, /待决策/);
  assert.equal(payload.creatorUnionId, "creator-union");
  assert.deepEqual(payload.executorUnionIds, ["owner-union"]);
  assert.match(payload.detailUrl, /#projects/);
  assert.ok(payload.dueTime > 0);
});

test("decision todo rejects missing real DingTalk identities", () => {
  assert.throws(() => buildDecisionTodoPayload({ id: "d1", title: "决策" }, {}, {}, {}, "https://flow.example.com/#projects"), /钉钉身份/);
});

test("personal todo payload keeps a stable platform source id and completion state", () => {
  const payload = buildPersonalTodoPayload({
    id: "todo-1",
    sourceType: "milestone",
    sourceId: "m1",
    sourceKey: "strategy-platform:milestone:m1",
    title: "完成首发",
    description: "通过上市验收",
    dueDate: "2026-07-18",
    assigneeUnionId: "union-owner",
    status: "done",
    dingTodo: { id: "ding-1" }
  }, { unionid: "union-creator" }, "https://flow.example.com/#company");

  assert.equal(payload.sourceId, "strategy-platform:milestone:m1");
  assert.equal(payload.todoId, "ding-1");
  assert.deepEqual(payload.executorUnionIds, ["union-owner"]);
  assert.equal(payload.done, true);
  assert.ok(payload.dueTime > 0);
});

test("personal todo payload rejects missing DingTalk identities and due dates", () => {
  assert.throws(() => buildPersonalTodoPayload({ sourceType: "risk", sourceId: "r1", title: "风险" }, {}, "https://flow.example.com/#company"), /钉钉身份/);
  assert.throws(() => buildPersonalTodoPayload({ sourceType: "risk", sourceId: "r1", title: "风险", assigneeUnionId: "owner" }, { unionid: "creator" }, "https://flow.example.com/#company"), /截止日期/);
});

test("platform provider saves DingTalk decision sync success and failure", () => {
  const provider = readFileSync(new URL("../src/state/PlatformProvider.jsx", import.meta.url), "utf8");
  assert.match(provider, /syncDecisionTodo/);
  assert.match(provider, /\/api\/dingtalk\/todo\/sync/);
  assert.match(provider, /update_decision_notification/);
  assert.match(provider, /lastError/);
});
