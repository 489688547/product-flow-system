import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTaskTodoSyncFailure,
  applyTaskTodoSyncSuccess,
  dashboardTasksForExecutive,
  dashboardTasksForUser,
  buildTaskTodoSnapshot,
  riskMetaForTask,
  normalizeTaskDueDate,
  parseTaskTodoDeepLink,
  taskMatchesDepartment,
  taskMatchesUserDepartments,
  todoSyncStatus
} from "../src/domain/taskTodo.js";
import { buildTaskTodoPayload } from "../src/domain/dingTalk.js";
import * as dingTalkDomain from "../src/domain/dingTalk.js";

test("dashboard tasks only include unfinished work owned by the current user's department", () => {
  const tasks = [
    { id: "product", ownerDept: "产品部", done: false, due: "2026-07-11" },
    { id: "mixed", ownerDept: "总经办 / 运营 / 品牌", done: false, due: "2026-07-12" },
    { id: "supply", ownerDept: "供应链/采购", done: false, due: "" },
    { id: "done", ownerDept: "产品", done: true, due: "2026-07-10" }
  ];
  const user = { department: "产品部", departments: ["产品部"] };

  assert.equal(taskMatchesUserDepartments(tasks[0], user), true);
  assert.equal(taskMatchesUserDepartments(tasks[1], user), false);
  assert.deepEqual(dashboardTasksForUser(tasks, user).map(task => task.id), ["product"]);
});

test("new todo snapshots include the editable draft without invalidating legacy snapshots", () => {
  const task = { title: "整理 PRD", due: "2026-07-22", done: false, deliverable: "PRD", ownerDept: "产品部" };
  const legacy = buildTaskTodoSnapshot(task, ["union-a"]);
  assert.equal("draft" in legacy, false);
  const draft = { subject: "自定义标题", descriptionHtml: "<p>正文</p>", priority: 30, dueDate: "2026-07-22", dueClock: "16:30" };
  assert.deepEqual(buildTaskTodoSnapshot(task, ["union-a"], draft).draft, draft);
  const synced = { ...task, dingTodo: { id: "todo-1", sourceId: "task:p1:t1", source: "todo_personal_user", actionVersion: 2, snapshot: buildTaskTodoSnapshot(task, ["union-a"], draft), executorUnionIds: ["union-a"], draft } };
  assert.equal(todoSyncStatus(synced), "已同步");
  assert.equal(todoSyncStatus({ ...synced, dingTodo: { ...synced.dingTodo, draft: { ...draft, priority: 40 } } }), "待更新");
});

test("display-mode todo sync stays visibly simulated instead of claiming DingTalk delivery", () => {
  const task = {
    id: "t1",
    title: "整理 PRD",
    due: "2026-07-22",
    done: false,
    deliverable: "PRD",
    ownerDept: "产品部"
  };
  const payload = {
    sourceId: "task:p1:t1",
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    draft: {
      subject: "整理 PRD",
      descriptionHtml: "<p>正文</p>",
      priority: 20,
      dueDate: "2026-07-22",
      dueClock: "18:00"
    }
  };
  const synced = applyTaskTodoSyncSuccess(task, {
    payload,
    executors: [{ name: "周荣庆" }],
    todo: {
      id: "display-todo-1",
      sourceId: "task:p1:t1",
      simulated: true
    },
    syncedAt: "2026-07-27T09:00:00.000Z"
  });

  assert.equal(synced.dingTodo.simulated, true);
  assert.equal(todoSyncStatus(synced), "展示模拟");
});

test("company-wide tasks are visible to every department", () => {
  const tasks = [{ id: "company", title: "全员任务", ownerDept: "所有部门", done: false }];
  const user = { department: "产品部" };

  assert.deepEqual(dashboardTasksForUser(tasks, user).map(task => task.id), ["company"]);
});

test("executives see all departments' tasks and can narrow by department", () => {
  const tasks = [
    { id: "product", ownerDept: "产品部", done: false, due: "2026-07-12" },
    { id: "ops", ownerDept: "运营部", done: false, due: "2026-07-11" },
    { id: "company", ownerDept: "全员", done: false, due: "" },
    { id: "done", ownerDept: "产品部", done: true, due: "2026-07-10" }
  ];

  // 不筛选时看到全公司未完成待办（按截止时间排序）
  assert.deepEqual(dashboardTasksForExecutive(tasks, "all").map(task => task.id), ["ops", "product", "company"]);
  // 按部门筛选；全员任务始终可见
  assert.deepEqual(dashboardTasksForExecutive(tasks, "产品部").map(task => task.id), ["product", "company"]);
  assert.equal(taskMatchesDepartment({ ownerDept: "供应链/采购" }, "采购部"), true);
  assert.equal(taskMatchesDepartment({ ownerDept: "产品部" }, "运营部"), false);
});

test("risk only includes unfinished tasks due within two days or overdue", () => {
  const now = new Date("2026-07-10T10:00:00+08:00");

  assert.equal(riskMetaForTask({ due: "2026-07-08", done: false }, now).label, "逾期 2 天");
  assert.equal(riskMetaForTask({ due: "2026-07-10", done: false }, now).label, "今日截止");
  assert.equal(riskMetaForTask({ due: "2026-07-12", done: false }, now).label, "2 天后截止");
  assert.equal(riskMetaForTask({ due: "2026-07-13", done: false }, now), null);
  assert.equal(riskMetaForTask({ due: "2026-07-09", done: true }, now), null);
  assert.equal(riskMetaForTask({ due: "", done: false }, now), null);
});

test("todo sync state detects unsynced, stale, completed and failed tasks", () => {
  const task = { title: "整理 PRD", due: "2026-07-12", done: false, deliverable: "PRD", ownerDept: "产品部" };
  assert.equal(todoSyncStatus(task), "未同步");

  const snapshot = {
    title: task.title,
    due: task.due,
    done: false,
    deliverable: task.deliverable,
    ownerDept: task.ownerDept,
    executorUnionIds: ["union-a"]
  };
  const legacyWork = { ...task, dingTodo: { id: "todo-1", sourceId: "task:p1:t1", source: "todo_open_app", snapshot, executorUnionIds: ["union-a"], actionVersion: 1 } };
  assert.equal(todoSyncStatus(legacyWork), "待更新");
  const synced = { ...task, dingTodo: { ...legacyWork.dingTodo, source: "todo_personal_user", actionVersion: 2 } };
  assert.equal(todoSyncStatus(synced), "已同步");
  assert.equal(todoSyncStatus({ ...synced, dingTodo: { ...synced.dingTodo, actionVersion: 1 } }), "待更新");
  assert.equal(todoSyncStatus({
    ...synced,
    dingTodo: { ...synced.dingTodo, sourceId: "" }
  }), "待确认");
  assert.equal(todoSyncStatus({ ...synced, due: "2026-07-13" }), "待更新");
  assert.equal(todoSyncStatus({ ...synced, done: true }), "待更新");
  assert.equal(todoSyncStatus({
    ...synced,
    done: true,
    dingTodo: { ...synced.dingTodo, snapshot: { ...snapshot, done: true } }
  }), "已完成");
  assert.equal(todoSyncStatus({ ...synced, dingTodo: { ...synced.dingTodo, lastError: "network" } }), "同步失败");
});

test("task todo payload requires a due date and keeps a stable system source id", () => {
  const product = { id: "p1", name: "鹦鹉谷物棒" };
  const task = { id: "t1", title: "整理 PRD", due: "2026-07-12", done: false, deliverable: "PRD", ownerDept: "产品部" };
  const creator = { unionid: "creator-union" };
  const executors = [{ name: "赵雨涵", unionid: "executor-union" }];
  const recoveryUsers = [{ name: "产品负责人", unionid: "owner-union" }];
  const payload = buildTaskTodoPayload({ product, task, creator, executors, recoveryUsers, detailUrl: "https://flow.example.com/#progress" });

  assert.equal(payload.sourceId, "task:p1:t1");
  assert.equal(payload.creatorUnionId, "creator-union");
  assert.deepEqual(payload.executorUnionIds, ["executor-union"]);
  assert.deepEqual(payload.recoveryUnionIds, ["owner-union"]);
  assert.equal(payload.dueTime, new Date("2026-07-12T18:00:00+08:00").getTime());
  assert.equal(payload.done, false);
  assert.equal(payload.actionVersion, 2);
  assert.throws(() => buildTaskTodoPayload({ product, task: { ...task, due: "" }, creator, executors, detailUrl: "https://flow.example.com" }), /截止日期/);
});

test("todo card deep link focuses the exact product task without a custom completion action", () => {
  assert.deepEqual(parseTaskTodoDeepLink(
    "https://flow.example.com/cloudflare-entry?productId=p1&taskId=t1&todoAction=complete#progress"
  ), {
    productId: "p1",
    taskId: "t1",
    action: "view"
  });
  assert.deepEqual(parseTaskTodoDeepLink(
    "https://flow.example.com/cloudflare-entry?productId=p1&taskId=t1&todoAction=unknown#progress"
  ), {
    productId: "p1",
    taskId: "t1",
    action: "view"
  });
  assert.equal(parseTaskTodoDeepLink("https://flow.example.com/?productId=p1&taskId=t1#planning"), null);
});

test("task todo payload only reuses an id verified against the stable product source", () => {
  const product = { id: "p1", name: "鹦鹉谷物棒" };
  const creator = { unionid: "creator-union" };
  const executors = [{ name: "赵雨涵", unionid: "executor-union" }];
  const baseTask = { id: "t1", title: "整理 PRD", due: "2026-07-12", done: false };
  const options = { product, creator, executors, detailUrl: "https://flow.example.com/#progress" };

  assert.equal(buildTaskTodoPayload({
    ...options,
    task: { ...baseTask, dingTodo: { id: "legacy-teambition-id" } }
  }).todoId, "");
  assert.equal(buildTaskTodoPayload({
    ...options,
    task: { ...baseTask, dingTodo: { id: "app-todo-id", sourceId: "task:p1:t1" } }
  }).todoId, "app-todo-id");
  assert.equal(buildTaskTodoPayload({
    ...options,
    task: { ...baseTask, dingTodo: { id: "recovered-app-todo-id", sourceId: "task:p1:t1:r1" } }
  }).todoId, "recovered-app-todo-id");
  assert.equal(buildTaskTodoPayload({
    ...options,
    task: { ...baseTask, dingTodo: { id: "foreign-app-todo-id", sourceId: "task:p1:t10" } }
  }).todoId, "");
});

test("task todo payload keeps a server-bound id from a legacy nested recovery source", () => {
  const payload = buildTaskTodoPayload({
    product: { id: "p1", name: "产品" },
    task: {
      id: "t1",
      productId: "p1",
      title: "整理 PRD",
      due: "2026-07-28",
      dingTodo: {
        id: "todo-nested-recovery",
        sourceId: "task:p1:t1:r1:r1"
      }
    },
    creator: { unionid: "creator-union" },
    executors: [{ unionid: "executor-union" }],
    detailUrl: "https://flow.example.com/#progress",
    now: new Date("2026-07-27T10:00:00+08:00")
  });

  assert.equal(payload.todoId, "todo-nested-recovery");
});

test("legacy month-day deadlines normalize before DingTalk todo sync", () => {
  const now = new Date("2026-07-11T10:00:00+08:00");
  assert.equal(normalizeTaskDueDate("07-14", now), "2026-07-14");
  assert.equal(normalizeTaskDueDate("2026/07/14", now), "2026-07-14");
  assert.equal(normalizeTaskDueDate("02-30", now), "");

  const payload = buildTaskTodoPayload({
    product: { id: "p1", name: "鹦鹉谷物棒" },
    task: { id: "legacy", title: "包装确认", due: "07-14", done: false },
    creator: { unionid: "creator-union" },
    executors: [{ unionid: "executor-union" }],
    detailUrl: "https://flow.example.com/#progress",
    now
  });

  assert.equal(payload.dueTime, new Date("2026-07-14T18:00:00+08:00").getTime());
});

test("todo composer restores a saved draft and otherwise builds editable defaults", () => {
  assert.equal(typeof dingTalkDomain.createTodoComposerDraft, "function");
  const task = {
    title: "整理 PRD",
    due: "2026-07-20",
    ownerDept: "产品部",
    deliverable: "产品 PRD",
    dingTodo: {
      draft: {
        subject: "已保存标题",
        descriptionHtml: "<p>已保存正文</p>",
        priority: 30,
        dueDate: "2026-07-21",
        dueClock: "16:30"
      }
    }
  };

  assert.deepEqual(dingTalkDomain.createTodoComposerDraft({ product: { name: "鹦鹉谷物棒" }, task }), task.dingTodo.draft);
  assert.deepEqual(dingTalkDomain.createTodoComposerDraft({ product: { name: "鹦鹉谷物棒" }, task: { ...task, dingTodo: {} } }), {
    subject: "鹦鹉谷物棒 · 整理 PRD",
    descriptionHtml: "<p><strong>产品：</strong>鹦鹉谷物棒</p><p><strong>任务：</strong>整理 PRD</p><p><strong>责任部门：</strong>产品部</p><p><strong>交付物：</strong>产品 PRD</p>",
    priority: 20,
    dueDate: "2026-07-20",
    dueClock: "18:00"
  });
  assert.deepEqual(dingTalkDomain.createTodoComposerDraft({ product: null, task: null }), {
    subject: "产品 · 产品任务",
    descriptionHtml: "",
    priority: 20,
    dueDate: "",
    dueClock: "18:00"
  });
});

test("task todo payload uses the edited title body priority and exact deadline", () => {
  const payload = buildTaskTodoPayload({
    product: { id: "p1", name: "鹦鹉谷物棒" },
    task: { id: "t1", title: "整理 PRD", due: "", done: false },
    creator: { unionid: "creator-union" },
    executors: [{ unionid: "executor-union" }],
    detailUrl: "https://flow.example.com/#progress",
    draft: {
      subject: "蛋小米 PRD 内容同步",
      descriptionHtml: "<p>完成 <strong>PRD</strong></p><ul><li>确认价格</li><li><a href=\"https://example.com/doc\">参考文档</a></li></ul>",
      priority: 40,
      dueDate: "2026-07-22",
      dueClock: "15:45"
    }
  });

  assert.equal(payload.subject, "蛋小米 PRD 内容同步");
  assert.equal(payload.priority, 40);
  assert.equal(payload.dueTime, new Date("2026-07-22T15:45:00+08:00").getTime());
  assert.match(payload.description, /完成 PRD/);
  assert.match(payload.description, /确认价格/);
  assert.match(payload.description, /参考文档/);
  assert.doesNotMatch(payload.description, /<[^>]+>/);
  assert.equal(payload.descriptionHtml, "<p>完成 <strong>PRD</strong></p><ul><li>确认价格</li><li><a href=\"https://example.com/doc\">参考文档</a></li></ul>");
});

test("todo composer strips executable markup before storing or sending rich text", () => {
  const payload = buildTaskTodoPayload({
    product: { id: "p1", name: "产品" },
    task: { id: "t1", due: "2026-07-22" },
    creator: { unionid: "creator" },
    executors: [{ unionid: "executor" }],
    detailUrl: "https://flow.example.com",
    draft: {
      subject: "安全正文",
      descriptionHtml: '<p onclick="steal()">正常内容</p><script>alert(1)</script><p><a href="javascript:alert(2)">链接</a></p><img src="data:x">',
      priority: 20,
      dueDate: "2026-07-22",
      dueClock: "18:00"
    }
  });
  assert.doesNotMatch(payload.descriptionHtml, /script|onclick|javascript:|<img/i);
  assert.match(payload.description, /正常内容/);
  assert.doesNotMatch(payload.description, /alert/);
});

test("todo composer rejects entity-obfuscated and unsupported link protocols", () => {
  const sanitized = dingTalkDomain.sanitizeTodoDescriptionHtml([
    '<p><a href="&#106;avascript:alert(1)">实体脚本</a></p>',
    '<p><a href="data:text/html,boom">数据链接</a></p>',
    '<p><a href="https://example.com/doc" onclick="boom()">安全链接</a></p>'
  ].join(""));

  assert.doesNotMatch(sanitized, /javascript:|data:|onclick|&#106;/i);
  assert.match(sanitized, /href="https:\/\/example\.com\/doc"/);
});

test("todo sync only persists the edited deadline and draft after DingTalk succeeds", () => {
  const task = {
    id: "t1",
    due: "2026-07-20",
    dingTodo: { id: "todo-1", draft: { subject: "上次成功" } }
  };
  const payload = {
    todoId: "todo-1",
    creatorUnionId: "creator-union",
    executorUnionIds: ["u1"],
    draft: { subject: "本次编辑", dueDate: "2026-07-22" }
  };
  const success = applyTaskTodoSyncSuccess(task, {
    payload,
    executors: [{ unionid: "u1", name: "甲" }],
    todo: { id: "todo-1", sourceId: "task:p1:t1", source: "todo_open_app" },
    syncedAt: "2026-07-18T10:00:00.000Z"
  });
  assert.equal(success.due, "2026-07-22");
  assert.equal(success.dingTodo.draft.subject, "本次编辑");
  assert.equal(success.dingTodo.sourceId, "task:p1:t1");
  assert.equal(success.dingTodo.source, "todo_open_app");
  assert.equal(success.dingTodo.creatorUnionId, "creator-union");

  const partial = applyTaskTodoSyncSuccess(task, {
    payload,
    executors: [{ unionid: "u1", name: "甲" }],
    todo: {
      id: "todo-1",
      sourceId: "task:p1:t1",
      source: "todo_personal_user",
      prioritySynced: false,
      priorityWarning: "待办已创建，优先级稍后重试"
    },
    syncedAt: "2026-07-18T10:00:30.000Z"
  });
  assert.equal(partial.dingTodo.id, "todo-1");
  assert.equal(partial.dingTodo.lastError, "待办已创建，优先级稍后重试");

  const migrating = applyTaskTodoSyncSuccess(task, {
    payload,
    todo: {
      id: "personal-1",
      sourceId: "task:p1:t1",
      source: "todo_personal_user",
      actionVersion: 2,
      legacyTodo: {
        id: "work-1",
        source: "todo_open_app",
        creatorUnionId: "creator-union",
        executorUnionIds: ["u1"]
      }
    },
    syncedAt: "2026-07-18T10:00:45.000Z"
  });
  assert.equal(migrating.dingTodo.id, "personal-1");
  assert.equal(migrating.dingTodo.legacyTodo.id, "work-1");
  const retired = applyTaskTodoSyncSuccess(migrating, {
    payload: { ...payload, todoId: "personal-1" },
    todo: {
      id: "personal-1",
      sourceId: "task:p1:t1",
      source: "todo_personal_user",
      actionVersion: 2,
      legacyTodo: null
    },
    syncedAt: "2026-07-18T10:00:50.000Z"
  });
  assert.equal(retired.dingTodo.legacyTodo, null);

  const failure = applyTaskTodoSyncFailure(task, new Error("网络失败"), "2026-07-18T10:01:00.000Z");
  assert.equal(failure.due, "2026-07-20");
  assert.equal(failure.dingTodo.draft.subject, "上次成功");
  assert.equal(failure.dingTodo.lastError, "网络失败");
});

test("DingTalk remains authoritative when a synced product task is edited remotely", () => {
  assert.equal(typeof dingTalkDomain.reconcileTaskTodosFromDingTalk, "function");
  const tasks = [{
    id: "t1",
    productId: "p1",
    title: "整理 PRD",
    due: "2026-07-20",
    done: false,
    dingTodo: {
      id: "todo-1",
      source: "todo_personal_user",
      actionVersion: 2,
      executorUnionIds: ["old-executor"],
      executorNames: ["旧执行人"],
      draft: { subject: "旧标题", descriptionHtml: "<p>旧正文</p>", priority: 20, dueDate: "2026-07-20", dueClock: "18:00" },
      lastError: "上次查询失败"
    }
  }];
  const dueTime = new Date("2026-07-23T16:30:00+08:00").getTime();
  const reconciled = dingTalkDomain.reconcileTaskTodosFromDingTalk(tasks, [{
    taskId: "todo-1",
    sourceId: "task:p1:t1",
    subject: "钉钉修改后的标题",
    description: "第一段\n第二段",
    priority: 40,
    dueTime,
    executorIds: ["new-executor"],
    isDone: true,
    modifiedTime: 1784781000000
  }]);

  assert.equal(reconciled[0].done, true);
  assert.equal(reconciled[0].due, "2026-07-23");
  assert.equal(reconciled[0].dingTodo.draft.subject, "钉钉修改后的标题");
  assert.equal(reconciled[0].dingTodo.draft.descriptionHtml, "<p>第一段</p><p>第二段</p>");
  assert.equal(reconciled[0].dingTodo.draft.priority, 40);
  assert.equal(reconciled[0].dingTodo.draft.dueClock, "16:30");
  assert.deepEqual(reconciled[0].dingTodo.executorUnionIds, ["new-executor"]);
  assert.equal(reconciled[0].dingTodo.lastError, "");
  assert.equal(reconciled[0].dingTodo.sourceId, "task:p1:t1");
  assert.equal(todoSyncStatus(reconciled[0]), "已完成");
});

test("DingTalk personal completion stage marks the local task complete", () => {
  const tasks = [{
    id: "t1",
    productId: "p1",
    done: false,
    dingTodo: {
      id: "todo-1",
      sourceId: "task:p1:t1",
      source: "todo_personal_user",
      actionVersion: 2,
      syncedAt: "2026-07-18T10:00:00.000Z",
      draft: {
        subject: "PRD 评审",
        descriptionHtml: "<p>评审正文</p>",
        priority: 40,
        dueDate: "2026-07-28",
        dueClock: "18:00"
      }
    }
  }];

  const reconciled = dingTalkDomain.reconcileTaskTodosFromDingTalk(tasks, [{
    taskId: "todo-1",
    finalStatusStage: 2,
    modifiedTime: new Date("2026-07-18T10:01:00.000Z").getTime()
  }]);

  assert.equal(reconciled[0].done, true);
  assert.equal(todoSyncStatus(reconciled[0]), "已完成");
});

test("DingTalk personal completion without a modified timestamp still flows back once", () => {
  const tasks = [{
    id: "t1",
    productId: "p1",
    done: false,
    dingTodo: {
      id: "todo-1",
      sourceId: "task:p1:t1",
      source: "todo_personal_user",
      actionVersion: 2,
      syncedAt: "2026-07-18T10:00:00.000Z",
      draft: {
        subject: "PRD 评审",
        descriptionHtml: "<p>评审正文</p>",
        priority: 40,
        dueDate: "2026-07-28",
        dueClock: "18:00"
      }
    }
  }];
  const card = {
    taskId: "todo-1",
    subject: "PRD 评审",
    dueTime: new Date("2026-07-28T18:00:00+08:00").getTime(),
    priority: 40,
    finalStatusStage: 2,
    isDone: true
  };

  const reconciled = dingTalkDomain.reconcileTaskTodosFromDingTalk(tasks, [card]);
  assert.equal(reconciled[0].done, true);
  assert.match(reconciled[0].dingTodo.remoteSnapshotKey, /todo-1/);
  assert.equal(dingTalkDomain.reconcileTaskTodosFromDingTalk(reconciled, [card]), reconciled);
});

test("DingTalk reconciliation preserves task identity when no remote card matches", () => {
  const tasks = [{ id: "t1", productId: "p1", done: false }];
  assert.equal(dingTalkDomain.reconcileTaskTodosFromDingTalk(tasks, [{ taskId: "other" }]), tasks);
});

test("legacy source-less todo ids cannot adopt an unrelated remote task", () => {
  const tasks = [{
    id: "t1",
    productId: "p1",
    done: false,
    dingTodo: { id: "legacy-id-without-source" }
  }];
  const unrelatedCard = {
    taskId: "legacy-id-without-source",
    subject: "其他系统待办",
    isDone: true
  };

  assert.equal(dingTalkDomain.reconcileTaskTodosFromDingTalk(tasks, [unrelatedCard]), tasks);
});

test("only assigned users need to poll DingTalk product-task statuses", () => {
  const tasks = [
    { id: "unsynced" },
    { id: "assigned", dingTodo: { id: "todo-1", executorUnionIds: ["union-a"] } },
    { id: "other", dingTodo: { id: "todo-2", executorUnionIds: ["union-b"] } }
  ];
  assert.equal(dingTalkDomain.userHasAssignedDingTalkTodo(tasks, "union-a"), true);
  assert.equal(dingTalkDomain.userHasAssignedDingTalkTodo(tasks, "union-c"), false);
  assert.equal(dingTalkDomain.userHasAssignedDingTalkTodo(tasks, ""), false);
});

test("assigned users poll only their unique bound DingTalk task ids", () => {
  const tasks = [
    { id: "assigned", dingTodo: { id: "task-1", executorUnionIds: ["union-a"] } },
    { id: "duplicate", dingTodo: { id: "task-1", executorUnionIds: ["union-a"] } },
    { id: "other", dingTodo: { id: "task-2", executorUnionIds: ["union-b"] } },
    { id: "unsafe", dingTodo: { id: "task/unsafe", executorUnionIds: ["union-a"] } }
  ];

  assert.deepEqual(dingTalkDomain.assignedDingTalkTodoIds(tasks, "union-a"), ["task-1"]);
  assert.deepEqual(dingTalkDomain.assignedDingTalkTodoIds(tasks, "union-b"), ["task-2"]);
});

test("stale DingTalk snapshots cannot overwrite a newer successful composer draft", () => {
  const tasks = [{
    id: "t1",
    productId: "p1",
    due: "2026-07-25",
    done: false,
    dingTodo: {
      id: "todo-1",
      syncedAt: "2026-07-18T10:05:00.000Z",
      draft: {
        subject: "新标题",
        descriptionHtml: '<p><a href="https://example.com">保留富文本</a></p>',
        priority: 30,
        dueDate: "2026-07-25",
        dueClock: "17:00"
      }
    }
  }];
  const stale = [{
    taskId: "todo-1",
    subject: "旧标题",
    description: "旧正文",
    modifiedTime: new Date("2026-07-18T10:04:00.000Z").getTime(),
    isDone: true
  }];
  assert.equal(dingTalkDomain.reconcileTaskTodosFromDingTalk(tasks, stale), tasks);
});

test("remote polling cannot clear a partial DingTalk sync warning", () => {
  const tasks = [{
    id: "t1",
    productId: "p1",
    done: false,
    dingTodo: {
      id: "todo-1",
      sourceId: "task:p1:t1",
      lastError: "待办已创建，但优先级同步失败，请重试。",
      failedAt: "2026-07-18T10:00:00.000Z",
      syncWarningKind: "partial_sync",
      draft: {
        subject: "PRD 评审",
        descriptionHtml: "<p>正文</p>",
        priority: 40,
        dueDate: "2026-07-28",
        dueClock: "18:00"
      }
    }
  }];
  const [reconciled] = dingTalkDomain.reconcileTaskTodosFromDingTalk(tasks, [{
    taskId: "todo-1",
    subject: "PRD 评审",
    priority: 20,
    isDone: false
  }]);

  assert.match(reconciled.dingTodo.lastError, /优先级同步失败/);
  assert.equal(reconciled.dingTodo.draft.priority, 40);
  assert.equal(reconciled.dingTodo.draft.subject, "PRD 评审");
  assert.equal(todoSyncStatus(reconciled), "同步失败");
});

test("a failed retry keeps the pending partial-sync target protected from polling", () => {
  const pending = {
    id: "t1",
    productId: "p1",
    done: false,
    dingTodo: {
      id: "todo-1",
      sourceId: "task:p1:t1",
      executorUnionIds: ["new-executor"],
      draft: {
        subject: "待重试标题",
        descriptionHtml: "<p>待重试正文</p>",
        priority: 40,
        dueDate: "2026-07-28",
        dueClock: "18:00"
      },
      lastError: "优先级同步失败",
      syncWarningKind: "partial_sync"
    }
  };
  const failedRetry = applyTaskTodoSyncFailure(pending, new Error("网络失败"), "2026-07-18T10:02:00.000Z");
  const [reconciled] = dingTalkDomain.reconcileTaskTodosFromDingTalk([failedRetry], [{
    taskId: "todo-1",
    subject: "钉钉旧标题",
    priority: 20,
    executorIds: ["old-executor"],
    isDone: false
  }]);

  assert.equal(failedRetry.dingTodo.syncWarningKind, "partial_sync");
  assert.equal(reconciled.dingTodo.draft.subject, "待重试标题");
  assert.equal(reconciled.dingTodo.draft.priority, 40);
  assert.deepEqual(reconciled.dingTodo.executorUnionIds, ["new-executor"]);
  assert.equal(reconciled.dingTodo.lastError, "网络失败");
});
