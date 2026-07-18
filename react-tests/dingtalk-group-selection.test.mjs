import test from "node:test";
import assert from "node:assert/strict";
import {
  addGroupExecutors,
  excludeExecutor,
  initialExecutorSelection,
  removeGroupExecutors,
  selectedExecutorUsers,
  toggleManualExecutor
} from "../src/domain/dingTalkGroupSelection.js";

test("group members merge with manually selected executors", () => {
  let state = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);
  state = addGroupExecutors(state, { id: "g1", name: "产品群" }, [
    { unionId: "u1", name: "甲" }, { unionId: "u2", name: "乙" }
  ]);
  assert.deepEqual(selectedExecutorUsers(state).map(user => user.unionid), ["u1", "u2"]);
  assert.equal(state.people.u1.manual, true);
});

test("removing a group preserves manual and overlapping sources", () => {
  let state = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);
  state = addGroupExecutors(state, { id: "g1", name: "一群" }, [{ unionId: "u1", name: "甲" }, { unionId: "u2", name: "乙" }]);
  state = addGroupExecutors(state, { id: "g2", name: "二群" }, [{ unionId: "u2", name: "乙" }]);
  state = removeGroupExecutors(state, "g1");
  assert.deepEqual(selectedExecutorUsers(state).map(user => user.unionid), ["u1", "u2"]);
});

test("excluded members stay excluded and manual toggles remain available", () => {
  let state = addGroupExecutors(initialExecutorSelection([], []), { id: "g1", name: "产品群" }, [{ unionId: "u2", name: "乙" }]);
  state = excludeExecutor(state, "u2");
  state = addGroupExecutors(state, { id: "g1", name: "产品群" }, [{ unionId: "u2", name: "乙" }]);
  assert.deepEqual(selectedExecutorUsers(state), []);
  state = toggleManualExecutor(state, { unionid: "u2", name: "乙" });
  assert.deepEqual(selectedExecutorUsers(state).map(user => user.unionid), ["u2"]);
});
