import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskAcceptancePatch,
  effectiveTaskExecutorIds,
  taskAcceptanceBlockReason,
  taskCompletionProgress
} from "../src/domain/taskCompletion.js";

const product = {
  id: "p1",
  productManager: "赵雨涵",
  productManagerUnionId: "union-manager"
};

function syncedTask(overrides = {}) {
  return {
    id: "t1",
    productId: "p1",
    category: "待办任务",
    done: false,
    required: false,
    dingTodo: {
      id: "todo-1",
      executorUnionIds: [
        "union-a",
        "union-b",
        "union-c",
        "union-d",
        "union-e",
        "union-manager",
        "union-a"
      ],
      executorStatuses: [],
      executorStatusCoverage: { complete: true }
    },
    ...overrides
  };
}

test("product manager is excluded from ordinary executor identities", () => {
  assert.deepEqual(effectiveTaskExecutorIds(syncedTask(), product), [
    "union-a",
    "union-b",
    "union-c",
    "union-d",
    "union-e"
  ]);
});

test("five ordinary executors plus product-manager acceptance start at zero of six", () => {
  const progress = taskCompletionProgress(syncedTask(), product);
  assert.deepEqual(progress, {
    completed: 0,
    total: 6,
    executorsDone: 0,
    executorsTotal: 5,
    allExecutorsDone: false,
    coverageComplete: false,
    managerAccepted: false
  });
});

test("executor completion increments progress without completing the product task", () => {
  const task = syncedTask({
    dingTodo: {
      ...syncedTask().dingTodo,
      executorStatuses: [
        { unionId: "union-a", isDone: true },
        { unionId: "union-b", isDone: true },
        { unionId: "union-c", isDone: false },
        { unionId: "union-d", isDone: false },
        { unionId: "union-e", isDone: false }
      ]
    }
  });

  assert.equal(taskCompletionProgress(task, product).completed, 2);
  assert.equal(taskCompletionProgress(task, product).allExecutorsDone, false);
  assert.equal(task.done, false);
});

test("only the product manager can accept after complete executor coverage", () => {
  const task = syncedTask({
    dingTodo: {
      ...syncedTask().dingTodo,
      executorStatuses: ["a", "b", "c", "d", "e"].map(letter => ({
        unionId: `union-${letter}`,
        isDone: true
      }))
    }
  });

  assert.equal(taskAcceptanceBlockReason({
    task,
    product,
    deliverables: [],
    actorUnionId: "union-other"
  }), "仅产品负责人可以确认完成");
  assert.equal(taskAcceptanceBlockReason({
    task,
    product,
    deliverables: [],
    actorUnionId: "union-manager"
  }), "");
});

test("missing coverage and unfinished executors block final acceptance", () => {
  const incompleteCoverage = syncedTask({
    dingTodo: {
      ...syncedTask().dingTodo,
      executorStatuses: [{ unionId: "union-a", isDone: true }],
      executorStatusCoverage: { complete: false }
    }
  });
  assert.equal(taskAcceptanceBlockReason({
    task: incompleteCoverage,
    product,
    deliverables: [],
    actorUnionId: "union-manager"
  }), "完成状态尚未读取完整");

  const unfinished = syncedTask({
    dingTodo: {
      ...syncedTask().dingTodo,
      executorStatuses: [
        { unionId: "union-a", isDone: true },
        { unionId: "union-b", isDone: true },
        { unionId: "union-c", isDone: false },
        { unionId: "union-d", isDone: false },
        { unionId: "union-e", isDone: false }
      ]
    }
  });
  assert.equal(taskAcceptanceBlockReason({
    task: unfinished,
    product,
    deliverables: [],
    actorUnionId: "union-manager"
  }), "还有 3 位执行人未完成");
});

test("required tasks need a linked deliverable before final acceptance", () => {
  const task = {
    ...syncedTask(),
    required: true,
    dingTodo: {
      ...syncedTask().dingTodo,
      executorStatuses: ["a", "b", "c", "d", "e"].map(letter => ({
        unionId: `union-${letter}`,
        isDone: true
      }))
    }
  };

  assert.equal(taskAcceptanceBlockReason({
    task,
    product,
    deliverables: [],
    actorUnionId: "union-manager"
  }), "必需任务需要先添加交付物");
  assert.equal(taskAcceptanceBlockReason({
    task,
    product,
    deliverables: [{ id: "file-1", taskId: "t1" }],
    actorUnionId: "union-manager"
  }), "");
});

test("acceptance patch records and clears the product-manager decision", () => {
  assert.deepEqual(buildTaskAcceptancePatch({
    task: syncedTask(),
    actorUnionId: "union-manager",
    accepted: true,
    now: "2026-07-28T10:00:00.000Z"
  }), {
    done: true,
    acceptance: {
      accepted: true,
      acceptedByUnionId: "union-manager",
      acceptedAt: "2026-07-28T10:00:00.000Z"
    }
  });
  assert.deepEqual(buildTaskAcceptancePatch({
    task: syncedTask({ done: true }),
    actorUnionId: "union-manager",
    accepted: false,
    now: "2026-07-28T10:10:00.000Z"
  }), {
    done: false,
    acceptance: {
      accepted: false,
      acceptedByUnionId: "",
      acceptedAt: ""
    }
  });
});
