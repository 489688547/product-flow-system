import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("task completion uses a dialog trigger and shows only the completion fraction", async t => {
  const vite = await createServer({
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true }
  });
  t.after(() => vite.close());
  const { TaskCompletionProgress } = await vite.ssrLoadModule(
    "/src/features/progress/TaskCompletionProgress.jsx"
  );

  const markup = renderToStaticMarkup(React.createElement(TaskCompletionProgress, {
    task: {
      id: "task-1",
      done: false,
      dingTodo: {
        id: "todo-1",
        executorUnionIds: ["executor-1"],
        executorStatuses: [{ unionId: "executor-1", isDone: false }],
        executorStatusCoverage: { complete: true }
      }
    },
    product: {
      productManager: "产品负责人",
      productManagerUnionId: "manager-1"
    },
    deliverables: [],
    currentUser: { unionId: "manager-1" },
    users: [{ unionId: "executor-1", name: "执行人" }],
    onChange: () => {}
  }));

  assert.match(markup, /<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  assert.match(markup, />0\/2</);
  assert.doesNotMatch(markup, /钉钉 ·/);
  assert.doesNotMatch(markup, /<details/);
});
