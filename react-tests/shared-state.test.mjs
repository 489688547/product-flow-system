import test from "node:test";
import assert from "node:assert/strict";
import { applyProductGrading, advanceProductToNextStage, calculateProductGrade, createDefaultState, convertDemandToProject, DEFAULT_TASK_TEMPLATES, deliverablesForTask, generateProductCover, hasFormalProductGrading, moveProductToStage, nextTaskSortOrder, productStagePolicy, reorderProductStageTasks, STAGES, syncDefaultTasksForProduct, taskTemplatesForProductStage, tasksForProductStage, updateDemandRecord, updateProductRecord, updateWorkflowTaskTemplates } from "../src/domain/productFlow.js";
import { deliverableKind, isBrokenDeliverable } from "../src/domain/deliverables.js";
import { normalizeClientState } from "../src/state/stateModel.js";
import { ensureCurrentUserInOrgCache, resolveCurrentUser } from "../src/domain/sessionUser.js";
import { canEditFeature, canEditProductPlanning, canViewFeature, canViewNavigation, DEFAULT_PERMISSIONS } from "../src/domain/permissions.js";
import { createDemandRecord, formatDemandCreatedAt } from "../src/domain/demandDate.js";

async function loadStateRequest() {
  try {
    return (await import("../functions/api/state.js")).onRequest;
  } catch {
    return null;
  }
}

function createD1Mock() {
  const store = new Map();
  const parts = new Map();
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ type: "run", sql, values: statement.values });
          if (/insert into product_flow_state\s*\(/i.test(sql)) {
            const [id, version, payload, updatedAt, updatedBy] = statement.values;
            store.set(id, { id, version, payload, updated_at: updatedAt, updated_by: updatedBy });
          }
          if (/delete from product_flow_state_parts/i.test(sql)) {
            const prefix = `${statement.values[0]}:`;
            [...parts.keys()].filter(key => key.startsWith(prefix)).forEach(key => parts.delete(key));
          }
          if (/insert into product_flow_state_parts/i.test(sql)) {
            const [stateId, partKey, partIndex, payload, updatedAt, updatedBy] = statement.values;
            parts.set(`${stateId}:${partKey}:${partIndex}`, {
              state_id: stateId,
              part_key: partKey,
              part_index: partIndex,
              payload,
              updated_at: updatedAt,
              updated_by: updatedBy
            });
          }
          if (/delete from product_flow_state where/i.test(sql)) store.delete(statement.values[0]);
          return { success: true };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });
          return store.get(statement.values[0] || "company") || null;
        },
        async all() {
          calls.push({ type: "all", sql, values: statement.values });
          const prefix = `${statement.values[0] || "company"}:`;
          return {
            results: [...parts.entries()]
              .filter(([key]) => key.startsWith(prefix))
              .map(([, value]) => value)
              .sort((a, b) => a.part_key.localeCompare(b.part_key) || a.part_index - b.part_index)
          };
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
  return db;
}

test("React app ships a Cloudflare Pages state API backed by sharded company D1 rows", async () => {
  const stateRequest = await loadStateRequest();
  assert.ok(stateRequest, "functions/api/state.js should export onRequest");

  const noDb = await stateRequest({
    request: new Request("https://flow.example.com/api/state"),
    env: {}
  });
  const noDbBody = await noDb.json();
  assert.equal(noDb.status, 501);
  assert.match(noDbBody.message, /PRODUCT_FLOW_DB/);

  const db = createD1Mock();
  const payload = {
    version: "react-test",
    currentId: "p1",
    demands: [{ id: "d1", name: "新机会", status: "待讨论" }],
    products: [{ id: "p1", name: "产品一" }],
    tasks: [{ id: "t1", productId: "p1", title: "会前准备" }],
    deliverables: [{ id: "doc1", productId: "p1", name: "纪要" }],
    reviews: [{ id: "r1", productId: "p1", title: "评审会" }],
    decisions: [{ id: "decision1", productId: "p1", title: "立项结论" }],
    dingMeetings: [{ id: "meeting1", productId: "p1", title: "钉钉会议" }],
    feedbackIssues: [{ id: "bug1", desc: "按钮点不动", screenshot: "data:image/png;base64,aaa" }],
    productPlans: [{ id: "plan1", demandId: "d1", developmentStart: "2026-08-01", developmentEnd: "2026-09-01", launchStart: "2026-09-01", launchEnd: "2026-09-15" }],
    config: { productLevels: ["P0 战略级"] },
    orgCache: { departments: [{ id: "dept1", name: "总经办" }], users: [{ userid: "u1", name: "周总" }], syncedAt: "2026-07-09T00:00:00.000Z" },
    settings: { settingsDepts: ["总经办"] }
  };

  const post = await stateRequest({
    request: new Request("https://flow.example.com/api/state", {
      method: "POST",
      body: JSON.stringify({ state: payload, updatedBy: "周总" })
    }),
    env: { PRODUCT_FLOW_DB: db }
  });
  assert.equal(post.status, 200);

  const get = await stateRequest({
    request: new Request("https://flow.example.com/api/state"),
    env: { PRODUCT_FLOW_DB: db }
  });
  const body = await get.json();

  assert.equal(get.status, 200);
  assert.equal(body.synced, true);
  assert.equal(body.state.demands[0].name, "新机会");
  assert.equal(body.state.decisions[0].title, "立项结论");
  assert.equal(body.state.dingMeetings[0].title, "钉钉会议");
  assert.equal(body.state.orgCache.users[0].name, "周总");
  assert.equal(body.state.productPlans[0].id, "plan1");
  assert.equal(body.updatedBy, "周总");
});

test("company state model keeps shared operational fields through normalization", () => {
  const defaults = createDefaultState();
  assert.ok(Array.isArray(defaults.decisions));
  assert.ok(Array.isArray(defaults.dingMeetings));
  assert.ok(defaults.config && typeof defaults.config === "object");
  assert.ok(defaults.orgCache && typeof defaults.orgCache === "object");
  assert.ok(Array.isArray(defaults.productPlans));

  const normalized = normalizeClientState({
    decisions: [{ id: "decision1", title: "保留决策" }],
    dingMeetings: [{ id: "meeting1", title: "保留会议" }],
    config: { stages: ["立项"] },
    orgCache: { departments: [], users: [{ userid: "u1", name: "周总" }], syncedAt: "2026-07-09T00:00:00.000Z" }
  });

  assert.equal(normalized.decisions[0].title, "保留决策");
  assert.equal(normalized.dingMeetings[0].title, "保留会议");
  assert.deepEqual(normalized.config.stages, ["立项"]);
  assert.equal(normalized.orgCache.users[0].name, "周总");
  assert.deepEqual(normalized.productPlans, []);
});

test("planning is visible to everyone and editable only by product or executive departments", () => {
  const executive = { department: "总经办", departments: ["总经办"], title: "总经理" };
  const productLegacy = { department: "产品团队", departments: ["产品团队"], title: "产品经理" };
  const operator = { department: "运营部", departments: ["运营部"], title: "运营" };

  assert.equal(canViewNavigation(DEFAULT_PERMISSIONS, operator, "planning"), true);
  assert.equal(canEditProductPlanning(executive), true);
  assert.equal(canEditProductPlanning(productLegacy), true);
  assert.equal(canEditProductPlanning(operator), false);
});

test("permission defaults separate navigation visibility from feature editing", () => {
  const executive = { department: "总经办", departments: ["总经办"], title: "总经理" };
  const productManager = { department: "其他", departments: ["其他"], title: "产品经理" };
  const operator = { department: "运营部", departments: ["运营部"], title: "运营" };

  assert.equal(canViewNavigation(DEFAULT_PERMISSIONS, executive, "issues"), true);
  assert.equal(canViewNavigation(DEFAULT_PERMISSIONS, operator, "issues"), false);
  assert.equal(canViewNavigation(DEFAULT_PERMISSIONS, productManager, "settings"), true);
  assert.equal(canViewFeature(DEFAULT_PERMISSIONS, productManager, "taskTemplates"), true);
  assert.equal(canEditFeature(DEFAULT_PERMISSIONS, productManager, "taskTemplates"), true);
  assert.equal(canEditFeature(DEFAULT_PERMISSIONS, operator, "taskTemplates"), false);
});

test("legacy settings receive a complete permission configuration", () => {
  const normalized = normalizeClientState({ settings: { settingsDepts: ["总经办"] } });
  assert.deepEqual(normalized.settings.permissions.navigation.issues.departments, ["总经办"]);
  assert.ok(normalized.settings.permissions.features.taskTemplates.editTitles.includes("产品经理"));
});

test("legacy owner fields migrate into distinct requester and product manager roles", () => {
  const normalized = normalizeClientState({
    demands: [{ id: "d-legacy", name: "历史需求", owner: "陈菲", productId: "p-legacy", status: "已转开发" }],
    products: [{ id: "p-legacy", name: "历史产品", owner: "赵雨涵", stage: 1 }]
  });

  assert.equal(normalized.demands[0].requester, "陈菲");
  assert.equal(normalized.demands[0].owner, "陈菲");
  assert.equal(normalized.products[0].requester, "陈菲");
  assert.equal(normalized.products[0].productManager, "赵雨涵");
  assert.equal(normalized.products[0].owner, "赵雨涵");
});

test("new demands persist a real ISO creation timestamp", () => {
  const now = new Date("2026-07-13T03:55:49.000Z");
  const demand = createDemandRecord({ name: "新需求", requester: "周荣庆" }, now);

  assert.equal(demand.id, `d-${now.getTime()}`);
  assert.equal(demand.createdAt, "2026-07-13T03:55:49.000Z");
  assert.equal(demand.created, undefined);
});

test("legacy demand creation labels migrate to stable timestamps", () => {
  const normalized = normalizeClientState({
    demands: [
      { id: "d1", name: "种子需求", created: "今天" },
      { id: "d3", name: "旧日期需求", created: "06-30" },
      { id: "d-1783914949000", name: "时间戳需求", created: "今天" }
    ]
  });

  assert.equal(normalized.demands[0].createdAt, "2026-07-02T16:00:00.000Z");
  assert.equal(normalized.demands[1].createdAt, "2026-06-29T16:00:00.000Z");
  assert.equal(normalized.demands[2].createdAt, new Date(1783914949000).toISOString());
});

test("demand creation timestamps render as relative or calendar dates", () => {
  const now = new Date("2026-07-13T04:00:00.000Z");

  assert.equal(formatDemandCreatedAt("2026-07-13T01:00:00.000Z", now), "今天");
  assert.equal(formatDemandCreatedAt("2026-07-12T01:00:00.000Z", now), "昨天");
  assert.equal(formatDemandCreatedAt("2026-07-03T01:00:00.000Z", now), "07-03");
  assert.equal(formatDemandCreatedAt("2025-07-03T01:00:00.000Z", now), "2025-07-03");
  assert.equal(formatDemandCreatedAt("", now), "历史数据");
});

test("legacy product level labels migrate to the formal grading vocabulary", () => {
  const normalized = normalizeClientState({
    demands: [],
    products: [{ id: "p-old-level", name: "历史产品", level: "P1 常规新品", stage: 2 }]
  });

  assert.equal(normalized.products[0].level, "P1 增长级");
  assert.equal("referenceLevel" in normalized.products[0], false);
  assert.equal(normalized.products[0].levelConfirmed, false);
});

test("only products with complete grading answers count as formally graded", () => {
  const normalized = normalizeClientState({
    demands: [],
    products: [{
      id: "p-graded",
      name: "正式定级产品",
      level: "P2 验证级",
      levelConfirmed: true,
      monthlyGmvTarget: 100000,
      stage: 2,
      grading: { answers: { strategy: 3, salesScale: 3, commercialValue: 3, resourceDemand: 3, risks: {} } }
    }]
  });

  assert.equal(normalized.products[0].levelConfirmed, true);
  assert.equal("referenceLevel" in normalized.products[0], false);
});

test("formal grading remains separate from the average monthly GMV target", () => {
  const state = createDefaultState();
  const product = { ...state.products[0], monthlyGmvTarget: null };
  assert.equal(product.levelConfirmed, true);
  assert.equal(hasFormalProductGrading(product), true);
});

test("legacy task deadlines migrate to full ISO dates from production state", () => {
  const normalized = normalizeClientState({
    tasks: [{ id: "legacy-due", productId: "p1", stage: 2, title: "包装确认", due: "07-14" }]
  });

  assert.equal(normalized.tasks[0].due, `${new Date().getFullYear()}-07-14`);
});

test("legacy executive department labels migrate to the DingTalk organization name", () => {
  const normalized = normalizeClientState({
    tasks: [{ id: "legacy-owner", productId: "p1", stage: 2, title: `立项评审由${["高", "层"].join("")}拍板`, ownerDept: `产品 / ${["高", "层"].join("")} / 运营` }]
  });

  assert.equal(normalized.tasks[0].ownerDept, "产品部 / 总经办 / 运营");
  assert.equal(normalized.tasks[0].title, "立项评审由总经办拍板");
});

test("legacy product team labels migrate to the single DingTalk product department", () => {
  const normalized = normalizeClientState({
    orgCache: {
      departments: [{ id: "legacy-product", name: "产品团队" }],
      users: [{ userid: "u-product", name: "产品经理", department: "产品团队", departments: ["产品团队"] }]
    },
    tasks: [{ id: "legacy-product-task", productId: "p1", stage: 1, title: "整理需求", ownerDept: "产品团队" }]
  });

  assert.equal(normalized.orgCache.departments[0].name, "产品部");
  assert.equal(normalized.orgCache.users[0].department, "产品部");
  assert.deepEqual(normalized.orgCache.users[0].departments, ["产品部"]);
  assert.equal(normalized.tasks[0].ownerDept, "产品部");
});

test("legacy task and template categories normalize without losing execution state", () => {
  const state = createDefaultState();
  const normalized = normalizeClientState({
    ...state,
    tasks: [
      { id: "legacy-meeting", productId: "p1", stage: 1, category: "会议/决策", title: "旧会议", ownerDept: "产品部", due: "2026-07-20", done: true, dingMeeting: { eventId: "event-1" }, systemDefault: false },
      { id: "legacy-delivery", productId: "p1", stage: 1, category: "会后交付", title: "旧交付", ownerDept: "运营", due: "2026-07-21", done: false, dingTodo: { id: "todo-1" }, systemDefault: false }
    ],
    settings: {
      ...state.settings,
      taskTemplates: [{ id: "legacy-template", level: "P1 增长级", stage: 1, category: "准入条件", title: "旧准入", ownerDept: "产品部", deliverable: "记录" }]
    }
  });

  const meeting = normalized.tasks.find(task => task.id === "legacy-meeting");
  const delivery = normalized.tasks.find(task => task.id === "legacy-delivery");
  assert.equal(meeting.category, "会议");
  assert.equal(meeting.done, true);
  assert.equal(meeting.dingMeeting.eventId, "event-1");
  assert.equal(delivery.category, "待办任务");
  assert.equal(delivery.dingTodo.id, "todo-1");
  assert.equal(normalized.settings.taskTemplates[0].category, "待办任务");
});

test("task responsibility departments align with current organization names", () => {
  const state = createDefaultState();
  const normalized = normalizeClientState({
    ...state,
    orgCache: {
      ...state.orgCache,
      departments: [{ id: "ops", name: "运营部" }, { id: "product", name: "产品部" }, { id: "supply", name: "供应链团队" }]
    },
    tasks: [{ id: "legacy-departments", productId: "p1", stage: 1, category: "待办任务", title: "跨部门任务", ownerDept: "运营 / 产品部 / 供应链", systemDefault: false }]
  });

  assert.equal(normalized.tasks[0].ownerDept, "运营部 / 产品部 / 供应链团队");
});

test("product progress uses five numbered stages and folds legacy stage seven into review", () => {
  assert.deepEqual(STAGES.filter(stage => stage.index > 0).map(stage => stage.short), ["立项", "研发", "测试", "上市", "复盘"]);

  const normalized = normalizeClientState({
    products: [{ id: "legacy-stage", name: "历史产品", stage: 6 }],
    tasks: [{ id: "legacy-task", productId: "legacy-stage", stage: 6, title: "季度复盘" }],
    reviews: [{ id: "legacy-review", productId: "legacy-stage", stage: 6, title: "产品复盘会" }]
  });

  assert.equal(normalized.products[0].stage, 5);
  assert.equal(normalized.tasks[0].stage, 5);
  assert.equal(normalized.reviews[0].stage, 5);
});

test("workflow task templates are isolated by product level and stage", () => {
  const state = createDefaultState();
  const p0 = { id: "p0-product", level: "P0 战略级" };
  const p3 = { id: "p3-product", level: "P3 常规级" };

  const p0Development = taskTemplatesForProductStage(state, p0, 2);
  const p3Development = taskTemplatesForProductStage(state, p3, 2);

  assert.ok(DEFAULT_TASK_TEMPLATES.length > 0);
  assert.ok(p0Development.length > 0);
  assert.equal(p3Development.length, 0);
  assert.ok(p0Development.every(template => template.level === "P0 战略级" && template.stage === 2));
  const departmentNames = new Set(state.orgCache.departments.map(department => department.name));
  assert.ok(DEFAULT_TASK_TEMPLATES.every(template => departmentNames.has(template.ownerDept)));
});

test("product stages without configured defaults are skippable unless they contain manual work", () => {
  const state = createDefaultState();
  const product = state.products.find(item => item.level === "P1 增长级");
  const withoutDevelopmentDefaults = updateWorkflowTaskTemplates(
    state,
    state.settings.taskTemplates.filter(template => !(template.level === product.level && template.stage === 2))
  );

  assert.deepEqual(productStagePolicy(withoutDevelopmentDefaults, product, 2), {
    mode: "跳过",
    applies: false,
    usage: "该阶段未配置默认任务，可直接跳过。",
    reason: "no-default-tasks"
  });

  const withManualTask = {
    ...withoutDevelopmentDefaults,
    tasks: [...withoutDevelopmentDefaults.tasks, {
      id: "manual-development-task",
      productId: product.id,
      stage: 2,
      title: "临时研发任务",
      systemDefault: false
    }]
  };

  assert.equal(productStagePolicy(withManualTask, product, 2).applies, true);
  assert.equal(productStagePolicy(withManualTask, product, 2).reason, "manual-tasks");
});

test("updating workflow templates preserves product execution state and manual tasks", () => {
  const state = createDefaultState();
  const product = state.products.find(item => item.level === "P1 增长级");
  const original = state.tasks.find(task => task.productId === product.id && task.stage === 2 && task.systemDefault);
  const manual = { id: "manual-task", productId: product.id, stage: 2, category: "会后交付", title: "人工补充", ownerDept: "品牌", deliverable: "人工资料", due: "2026-08-01", done: false, systemDefault: false };
  const withExecution = {
    ...state,
    tasks: state.tasks.map(task => task.id === original.id ? { ...task, due: "2026-07-20", done: true, dingTodo: { id: "todo-1" } } : task).concat(manual)
  };
  const templates = state.settings.taskTemplates.map(template => template.id === original.templateId ? {
    ...template,
    title: "更新后的打样任务",
    ownerDept: "产品部 / 供应链",
    deliverable: "新版打样模板",
    required: true,
    deliverableTemplates: [{ id: "doc-1", name: "打样文档模板", url: "https://alidocs.dingtalk.com/i/nodes/test" }]
  } : template);

  const updated = updateWorkflowTaskTemplates(withExecution, templates);
  const synced = updated.tasks.find(task => task.productId === product.id && task.templateId === original.templateId);

  assert.equal(synced.title, "更新后的打样任务");
  assert.equal(synced.ownerDept, "产品部 / 供应链");
  assert.equal(synced.due, "2026-07-20");
  assert.equal(synced.done, true);
  assert.equal(synced.dingTodo.id, "todo-1");
  assert.equal(synced.deliverableTemplates[0].name, "打样文档模板");
  assert.equal(synced.required, true);
  assert.ok(updated.tasks.some(task => task.id === manual.id));
});

test("normal state hydration preserves product-specific responsibility departments", () => {
  const state = createDefaultState();
  const product = state.products[0];
  const task = state.tasks.find(item => item.productId === product.id && item.systemDefault);
  const customized = {
    ...state,
    tasks: state.tasks.map(item => item.id === task.id ? { ...item, ownerDept: "产品部 / 运营部" } : item)
  };

  const hydrated = syncDefaultTasksForProduct(customized, product);
  const preserved = hydrated.tasks.find(item => item.id === task.id);

  assert.equal(preserved.ownerDept, "产品部 / 运营部");
});

test("required task templates propagate the completion requirement to product tasks", () => {
  const state = createDefaultState();
  const product = state.products[0];
  const template = state.settings.taskTemplates.find(item => item.level === product.level && item.stage === product.stage);
  const updated = updateWorkflowTaskTemplates(state, state.settings.taskTemplates.map(item => item.id === template.id ? { ...item, required: true } : item));
  const task = updated.tasks.find(item => item.productId === product.id && item.templateId === template.id);
  assert.equal(task.required, true);
});

test("removing a workflow template removes only generated product tasks", () => {
  const state = createDefaultState();
  const product = state.products.find(item => item.level === "P1 增长级");
  const generated = state.tasks.find(task => task.productId === product.id && task.systemDefault);
  const manual = { id: "manual-keep", productId: product.id, stage: generated.stage, title: "保留人工任务", systemDefault: false };
  const updated = updateWorkflowTaskTemplates({ ...state, tasks: [...state.tasks, manual] }, state.settings.taskTemplates.filter(template => template.id !== generated.templateId));

  assert.equal(updated.tasks.some(task => task.productId === product.id && task.templateId === generated.templateId), false);
  assert.ok(updated.tasks.some(task => task.id === manual.id));
});

test("legacy shared state receives default workflow templates and stable template ids", () => {
  const defaults = createDefaultState();
  const product = defaults.products.find(item => item.level === "P1 增长级");
  const legacyTask = defaults.tasks.find(task => task.productId === product.id && task.stage === 2);
  const normalized = normalizeClientState({
    ...defaults,
    settings: { settingsDepts: ["总经办"] },
    tasks: [{ ...legacyTask, templateId: undefined, due: "2026-07-30", done: true }]
  });

  assert.ok(normalized.settings.taskTemplates.length > 0);
  const migrated = normalized.tasks.find(task => task.productId === product.id && task.stage === 2 && task.systemDefault);
  assert.ok(migrated.templateId);
  assert.equal(migrated.due, "2026-07-30");
  assert.equal(migrated.done, true);
});

test("legacy generated tasks become settings templates without losing execution state", () => {
  const defaults = createDefaultState();
  const product = defaults.products.find(item => item.level === "P1 增长级");
  const normalized = normalizeClientState({
    ...defaults,
    settings: { settingsDepts: ["总经办"] },
    tasks: [
      { id: "idff2c9b1cb2d56819f4101da47", productId: product.id, stage: 2, title: "旧系统默认任务", ownerDept: "产品 / 运营", due: "2026-07-30", done: true, dingTodo: { id: "legacy-todo" } },
      { id: "task-manual-keep", productId: product.id, stage: 2, title: "人工补充任务", systemDefault: false }
    ]
  });

  const migrated = normalized.tasks.find(task => task.id === "idff2c9b1cb2d56819f4101da47");
  assert.ok(migrated.templateId);
  assert.equal(migrated.due, "2026-07-30");
  assert.equal(migrated.done, true);
  assert.equal(migrated.dingTodo.id, "legacy-todo");
  assert.equal(migrated.ownerDept, "产品部 / 运营");
  assert.ok(normalized.tasks.some(task => task.id === "task-manual-keep"));
  assert.ok(normalized.settings.taskTemplates.some(template => template.id === migrated.templateId && template.title === "旧系统默认任务"));
});

test("built-in legacy products recover their known requester when local cache lacks the field", () => {
  const normalized = normalizeClientState({
    demands: [],
    products: [{ id: "p1", name: "鹦鹉谷物棒", owner: "赵雨涵", stage: 2 }]
  });

  assert.equal(normalized.products[0].requester, "周荣庆");
  assert.equal(normalized.products[0].productManager, "赵雨涵");
});

test("server session identity resolves to an organization member and remains selectable", () => {
  const account = {
    source: "embedded",
    role: "executive",
    dingUser: { userid: "u-zhou", name: "周荣庆", title: "总经理", departmentNames: ["总经办"] }
  };
  const currentUser = resolveCurrentUser(account, createDefaultState().orgCache);
  const selectableOrg = ensureCurrentUserInOrgCache({ departments: [], users: [] }, currentUser);

  assert.equal(currentUser.name, "周荣庆");
  assert.equal(currentUser.department, "总经办");
  assert.equal(selectableOrg.users[0].name, "周荣庆");
});

test("DingTalk session account matches org cache aliases from OpenAPI", () => {
  const account = {
    source: "dingtalk",
    dingUser: { userid: "userid-1", unionid: "union-1", name: "周荣庆" }
  };
  const currentUser = resolveCurrentUser(account, {
    departments: [],
    users: [
      { userId: "userid-1", unionId: "union-1", name: "周荣庆", departmentNames: ["总经办"], title: "总经理" }
    ]
  });

  assert.equal(currentUser.name, "周荣庆");
  assert.equal(currentUser.title, "总经理");
  assert.equal(currentUser.department, "总经办");
  assert.deepEqual(currentUser.departments, ["总经办"]);
});

test("converting a discussed demand into project writes a shared decision record", () => {
  const state = createDefaultState();
  const demand = state.demands.find(item => item.status !== "已讨论" && !item.productId);
  const discussedState = {
    ...state,
    demands: state.demands.map(item => item.id === demand.id ? { ...item, status: "已讨论" } : item)
  };

  const converted = convertDemandToProject(discussedState, demand.id);
  const product = converted.products[0];
  const decision = converted.decisions.find(item => item.productId === product.id);

  assert.equal(product.name, demand.name);
  assert.equal(product.stage, 1);
  assert.equal(product.requester, demand.requester);
  assert.equal(product.productManager, "");
  assert.equal(product.expectedLaunchMonth, demand.expectedLaunchMonth);
  assert.equal("referenceLevel" in product, false);
  assert.equal(product.levelConfirmed, false);
  assert.equal(product.grading, undefined);
  assert.match(decision.title, /进入立项/);
  assert.equal(converted.tasks.some(task => task.productId === product.id && task.stage === 0), false);
});

test("demand covers are generated from the product name and reused after initiation", () => {
  const rabbitCover = generateProductCover("兔用草架升级版");
  const hamsterCover = generateProductCover("仓鼠夏季降温窝");
  assert.match(rabbitCover, /^https:\/\/images\.unsplash\.com\//);
  assert.notEqual(rabbitCover, hamsterCover);

  const state = createDefaultState();
  const demand = { ...state.demands[0], status: "已讨论", image: "data:image/png;base64,custom-cover" };
  const converted = convertDemandToProject({
    ...state,
    demands: state.demands.map(item => item.id === demand.id ? demand : item)
  }, demand.id);

  assert.equal(converted.products[0].image, demand.image);
  assert.equal(converted.deliverables.find(item => item.productId === converted.products[0].id && item.type === "image").url, demand.image);

  const normalized = normalizeClientState({
    demands: [{ id: "legacy-demand", name: "兔用草架", status: "待讨论" }],
    products: [{ id: "legacy-product", name: "仓鼠用品", stage: 1 }]
  });
  assert.equal(normalized.demands[0].image, rabbitCover);
  assert.equal(normalized.products[0].image, hamsterCover);
});

test("advancing a product always moves one stage forward", () => {
  const state = createDefaultState();
  const product = { ...state.products[0], stage: 2, productManager: "赵雨涵" };
  const withProduct = { ...state, products: state.products.map(item => item.id === product.id ? product : item) };

  const advanced = advanceProductToNextStage(withProduct, product.id);

  assert.equal(advanced.products.find(item => item.id === product.id).stage, 3);
});

test("legacy opportunity-stage products and tasks migrate into initiation", () => {
  const state = createDefaultState();
  const normalized = normalizeClientState({
    ...state,
    products: [{ ...state.products[0], stage: 0 }],
    tasks: [{ id: "old-opportunity-task", productId: state.products[0].id, stage: 0, title: "旧机会任务" }]
  });

  assert.equal(normalized.products[0].stage, 1);
  assert.equal(normalized.tasks.some(task => task.stage === 0), false);
});

test("task deliverables reuse records from the product package", () => {
  const state = createDefaultState();
  const linked = { id: "linked-doc", productId: "p1", taskId: "task-1", name: "立项纪要", type: "dingtalk-doc", url: "https://alidocs.dingtalk.com/i/nodes/demo" };
  const unrelated = { id: "other-doc", productId: "p1", taskId: "task-2", name: "其他资料", type: "richtext", content: "<p>其他</p>" };

  const rows = deliverablesForTask({ ...state, deliverables: [linked, unrelated] }, "task-1");

  assert.deepEqual(rows, [linked]);
});

test("deliverable previews distinguish supported files and broken records", () => {
  assert.equal(deliverableKind({ type: "image/png", url: "data:image/png;base64,abc" }), "image");
  assert.equal(deliverableKind({ type: "application/pdf", url: "data:application/pdf;base64,abc" }), "pdf");
  assert.equal(deliverableKind({ type: "video/mp4", url: "data:video/mp4;base64,abc" }), "video");
  assert.equal(deliverableKind({ type: "dingtalk-doc", url: "https://alidocs.dingtalk.com/i/nodes/demo" }), "link");
  assert.equal(deliverableKind({ type: "richtext", content: "<p>会议结论</p>" }), "richtext");
  assert.equal(isBrokenDeliverable({ type: "richtext", content: "" }), true);
  assert.equal(isBrokenDeliverable({ type: "doc", url: "#" }), true);
  assert.equal(isBrokenDeliverable({ type: "image", url: "data:image/png;base64,abc" }), false);
});

test("grading follows the Excel one-vote rule for O-level reserve", () => {
  const result = calculateProductGrade({
    strategy: 1,
    salesScale: 2,
    commercialValue: 2,
    resourceDemand: 1,
    risks: {}
  });

  assert.equal(result.valueScore, 5);
  assert.equal(result.level, "O级储备");
  assert.match(result.rule, /A=1/);
});

test("grading separates product level, risk and delivery route", () => {
  const result = calculateProductGrade({
    strategy: 2,
    salesScale: 2,
    commercialValue: 3,
    resourceDemand: 3,
    risks: { firstSupplier: true, formulaChange: true }
  });

  assert.equal(result.valueScore, 7);
  assert.equal(result.resourceScore, 3);
  assert.equal(result.resourceBand, "中投入");
  assert.equal(result.riskScore, 3);
  assert.equal(result.riskBand, "中风险");
  assert.equal(result.level, "P2 验证级");
  assert.equal(result.route, "小成本验证");
});

test("high risk raises management intensity without lowering product level", () => {
  const result = calculateProductGrade({
    strategy: 2,
    salesScale: 2,
    commercialValue: 3,
    resourceDemand: 2,
    risks: { firstSupplier: true, inventory: true, formulaChange: true, newRegulation: true }
  });

  assert.equal(result.level, "P2 验证级");
  assert.equal(result.riskBand, "高风险");
  assert.equal(result.route, "缩小验证");
  assert.match(result.management, /高风险管理/);
  assert.doesNotMatch(result.rule, /降低一级/);
});

test("air-feel paper bedding is P2 with medium risk under the optimized rubric", () => {
  const result = calculateProductGrade({
    strategy: 2,
    salesScale: 2,
    commercialValue: 3,
    resourceDemand: 3,
    risks: { firstSupplier: true, formulaChange: true }
  });

  assert.equal(result.valueScore, 7);
  assert.equal(result.level, "P2 验证级");
  assert.equal(result.riskBand, "中风险");
  assert.equal(result.route, "小成本验证");
});

test("O-level grading returns the opportunity and clears all product progress", () => {
  const state = createDefaultState();
  const product = state.products[0];
  const linkedDemand = { ...state.demands[0], id: "linked-demand", productId: product.id, status: "已转开发" };
  const grading = calculateProductGrade({ strategy: 1, salesScale: 2, commercialValue: 2, resourceDemand: 1, risks: {} });
  const graded = applyProductGrading({ ...state, demands: [linkedDemand, ...state.demands.slice(1)] }, product.id, grading, { gradedBy: "赵雨涵", decidedAt: "2026-07-10" });
  const returned = graded.demands.find(item => item.id === linkedDemand.id);

  assert.equal(graded.products.some(item => item.id === product.id), false);
  assert.equal(graded.tasks.some(item => item.productId === product.id), false);
  assert.equal(graded.deliverables.some(item => item.productId === product.id), false);
  assert.equal(graded.reviews.some(item => item.productId === product.id), false);
  assert.equal(graded.decisions.some(item => item.productId === product.id), false);
  assert.equal(graded.dingMeetings.some(item => item.productId === product.id), false);
  assert.equal(returned.productId, "");
  assert.equal(returned.status, "暂缓");
  assert.equal("level" in returned, false);
  assert.equal(returned.expectedLaunchMonth, linkedDemand.expectedLaunchMonth);
  assert.equal(returned.createdAt, linkedDemand.createdAt);
  assert.equal(returned.grading.gradedBy, "赵雨涵");
  assert.match(returned.discussion, /O级储备/);
});

test("formal P-level grading stays in initiation without writing a reference demand level", () => {
  const state = createDefaultState();
  const product = state.products[0];
  const linkedDemand = { ...state.demands[0], id: "linked-demand", productId: product.id, status: "已转开发" };
  const grading = calculateProductGrade({ strategy: 4, salesScale: 3, commercialValue: 3, resourceDemand: 4, risks: { firstSupplier: true } });
  const graded = applyProductGrading({ ...state, demands: [linkedDemand, ...state.demands.slice(1)] }, product.id, grading, { gradedBy: "赵雨涵", decidedAt: "2026-07-10" });
  const updatedProduct = graded.products.find(item => item.id === product.id);
  const updatedDemand = graded.demands.find(item => item.id === linkedDemand.id);

  assert.equal(updatedProduct.level, "P1 增长级");
  assert.equal(updatedProduct.levelConfirmed, true);
  assert.equal(updatedProduct.grading.gradedBy, "赵雨涵");
  assert.equal("level" in updatedDemand, false);
  assert.equal(updatedDemand.productId, product.id);
  assert.match(graded.decisions[0].summary, /P1 增长级 \+ 中风险 \+ 标准推进/);
});

test("formal grading stores one normalized average monthly GMV target", () => {
  const state = createDefaultState();
  const product = state.products[0];
  const grading = calculateProductGrade({ strategy: 4, salesScale: 3, commercialValue: 3, resourceDemand: 4, risks: {} });
  const graded = applyProductGrading(state, product.id, grading, {
    gradedBy: "赵雨涵",
    monthlyGmvTarget: "100,000.126"
  });

  assert.equal(graded.products.find(item => item.id === product.id).monthlyGmvTarget, 100000.13);
});

test("regrading without a GMV value preserves the existing average monthly target", () => {
  const state = createDefaultState();
  const product = { ...state.products[0], monthlyGmvTarget: 180000 };
  const grading = calculateProductGrade({ strategy: 4, salesScale: 3, commercialValue: 3, resourceDemand: 4, risks: {} });
  const graded = applyProductGrading({ ...state, products: [product, ...state.products.slice(1)] }, product.id, grading, {
    gradedBy: "赵雨涵"
  });

  assert.equal(graded.products.find(item => item.id === product.id).monthlyGmvTarget, 180000);
});

test("client state normalization preserves a positive monthly GMV target", () => {
  const normalized = normalizeClientState({
    products: [{ id: "p-gmv", name: "GMV 产品", monthlyGmvTarget: "250000", stage: 1 }]
  });

  assert.equal(normalized.products[0].monthlyGmvTarget, 250000);
});

test("a new project cannot leave initiation before manager and formal grading are confirmed", () => {
  const state = createDefaultState();
  const demand = { ...state.demands[0], status: "已讨论" };
  const converted = convertDemandToProject({
    ...state,
    demands: state.demands.map(item => item.id === demand.id ? demand : item)
  }, demand.id);
  const product = converted.products[0];

  const blocked = moveProductToStage(converted, product.id, 2);
  assert.equal(blocked.products.find(item => item.id === product.id).stage, 1);

  const assigned = updateProductRecord(converted, product.id, { productManager: "赵雨涵" });
  const stillBlocked = moveProductToStage(assigned, product.id, 2);
  assert.equal(stillBlocked.products.find(item => item.id === product.id).stage, 1);

  const grading = calculateProductGrade({ strategy: 4, salesScale: 3, commercialValue: 3, resourceDemand: 4, risks: {} });
  const graded = applyProductGrading(assigned, product.id, grading, { gradedBy: "赵雨涵" });
  const advanced = moveProductToStage(graded, product.id, 2);
  assert.equal(advanced.products.find(item => item.id === product.id).stage, 2);
});

test("changing demand status fills a discussion summary when it is empty", () => {
  const state = createDefaultState();
  const demand = state.demands.find(item => !item.productId);
  const blankState = {
    ...state,
    demands: state.demands.map(item => item.id === demand.id ? { ...item, discussion: "" } : item)
  };

  const updated = updateDemandRecord(blankState, demand.id, { status: "已讨论" });
  const updatedDemand = updated.demands.find(item => item.id === demand.id);

  assert.equal(updatedDemand.status, "已讨论");
  assert.match(updatedDemand.discussion, /已讨论/);
  assert.match(updatedDemand.discussion, /可以进入立项/);
});

test("changing demand status keeps an existing discussion summary", () => {
  const state = createDefaultState();
  const demand = state.demands.find(item => !item.productId);
  const customSummary = "老板会后结论：先验证供应链周期。";

  const updated = updateDemandRecord({
    ...state,
    demands: state.demands.map(item => item.id === demand.id ? { ...item, discussion: customSummary } : item)
  }, demand.id, { status: "暂缓" });
  const updatedDemand = updated.demands.find(item => item.id === demand.id);

  assert.equal(updatedDemand.status, "暂缓");
  assert.equal(updatedDemand.discussion, customSummary);
});


test("changing a product level regenerates system default tasks but keeps manual tasks", () => {
  const state = createDefaultState();
  const product = state.products.find(item => item.id === "p1");
  const manualTask = {
    id: "manual-keep",
    productId: product.id,
    stage: 2,
    title: "人工补充任务",
    ownerDept: "产品部",
    deliverable: "人工交付物",
    done: false,
    systemDefault: false
  };
  const withManualTask = { ...state, tasks: [manualTask, ...state.tasks] };

  const updated = updateProductRecord(withManualTask, product.id, { level: "P3 常规级" });
  const changedProduct = updated.products.find(item => item.id === product.id);

  assert.equal(changedProduct.level, "P3 常规级");
  assert.equal(tasksForProductStage(updated, changedProduct, 2).filter(task => task.systemDefault).length, 0);
  assert.ok(updated.tasks.find(task => task.id === "manual-keep"));
  assert.ok(tasksForProductStage(updated, changedProduct, 1).some(task => /一页纸/.test(task.title)));
});

test("product stage tasks can be reordered without changing another stage", () => {
  const state = createDefaultState();
  const product = state.products.find(item => item.id === "p1");
  const stageOne = tasksForProductStage(state, product, 1);
  const stageTwo = tasksForProductStage(state, product, 2);
  assert.ok(stageOne.length > 1);
  assert.ok(stageTwo.length > 0);

  const reversedIds = stageOne.map(task => task.id).reverse();
  const reordered = reorderProductStageTasks(state, product.id, 1, reversedIds);

  assert.deepEqual(tasksForProductStage(reordered, product, 1).map(task => task.id), reversedIds);
  assert.deepEqual(tasksForProductStage(reordered, product, 2).map(task => task.id), stageTwo.map(task => task.id));
  assert.equal(nextTaskSortOrder(reordered, product.id, 1), reversedIds.length);

  const reloaded = normalizeClientState(reordered);
  const reloadedProduct = reloaded.products.find(item => item.id === product.id);
  assert.deepEqual(tasksForProductStage(reloaded, reloadedProduct, 1).map(task => task.id), reversedIds);
});

test("moving a product backward clears future task completion and review minutes", () => {
  const state = createDefaultState();
  const product = state.products.find(item => item.id === "p1");
  const stageTwoTask = tasksForProductStage(state, product, 2)[0];
  const advanced = {
    ...state,
    products: state.products.map(item => item.id === product.id ? { ...item, stage: 4 } : item),
    tasks: state.tasks.map(task => task.id === stageTwoTask.id ? { ...task, done: true, todoSyncedAt: "2026-07-09T00:00:00.000Z" } : task),
    reviews: state.reviews.map(review => review.productId === product.id && review.stage === 2 ? { ...review, minutes: "样品评审已通过。" } : review)
  };

  const moved = moveProductToStage(advanced, product.id, 1);
  const movedProduct = moved.products.find(item => item.id === product.id);
  const clearedTask = moved.tasks.find(task => task.id === stageTwoTask.id);
  const projectReview = moved.reviews.find(review => review.productId === product.id && review.stage === 1);
  const sampleReview = moved.reviews.find(review => review.productId === product.id && review.stage === 2);

  assert.equal(movedProduct.stage, 1);
  assert.equal(clearedTask.done, false);
  assert.equal(clearedTask.todoSyncedAt, undefined);
  assert.notEqual(projectReview.minutes, "");
  assert.equal(sampleReview.minutes, "");
});
