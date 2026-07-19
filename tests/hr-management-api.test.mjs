import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/hr-management.js";
import { writeHrManagementState } from "../functions/api/hr-management/_shared/storage.js";

const COLLECTION_TABLES = {
  employees: "hr_employees",
  assignments: "hr_assignments",
  roleAssignments: "hr_role_assignments",
  lifecycleEvents: "hr_lifecycle_events",
  performanceTemplates: "hr_performance_templates",
  performanceCycles: "hr_performance_cycles",
  performanceItems: "hr_performance_items",
  evidenceSnapshots: "hr_evidence_snapshots",
  auditLogs: "hr_audit_logs"
};

function createHrDb(state = {}, version = 3) {
  const rowsByTable = Object.fromEntries(Object.entries(COLLECTION_TABLES).map(([collection, table]) => [table, (state[collection] || []).map(payload => ({ payload: JSON.stringify(payload) }))]));
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async all() {
          const table = Object.values(COLLECTION_TABLES).find(name => new RegExp(`FROM ${name}\\b`, "i").test(sql));
          return { results: table ? rowsByTable[table] : [] };
        },
        async first() {
          if (/FROM hr_management_meta/i.test(sql) && statement.values[0] === "company_version") return { value: String(version) };
          if (/FROM hr_management_meta/i.test(sql) && statement.values[0] === "updated_at") return { value: "2026-07-19T00:00:00.000Z" };
          return null;
        },
        async run() { return { success: true }; }
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
}

const sampleState = {
  employees: [
    { id: "emp-manager", userId: "u-manager", name: "示例主管", employmentStatus: "active" },
    { id: "emp-1", userId: "u-1", name: "示例员工", employmentStatus: "active" },
    { id: "emp-2", userId: "u-2", name: "另一员工", employmentStatus: "active" }
  ],
  assignments: [
    { id: "a-manager", employeeId: "emp-manager", managerEmployeeId: "", departmentName: "运营部", positionName: "运营主管", effectiveFrom: "2026-01-01" },
    { id: "a-1", employeeId: "emp-1", managerEmployeeId: "emp-manager", departmentName: "运营部", positionName: "运营", effectiveFrom: "2026-01-01" },
    { id: "a-2", employeeId: "emp-2", managerEmployeeId: "", departmentName: "产品部", positionName: "产品经理", effectiveFrom: "2026-01-01" }
  ],
  performanceCycles: [{ id: "cycle-1", name: "7月绩效", status: "manager_submitted" }],
  performanceItems: [
    { id: "p-1", cycleId: "cycle-1", employeeId: "emp-1", title: "重点产品", weight: 100, selfScore: 80, suggestedScore: 85, managerScore: 88 },
    { id: "p-2", cycleId: "cycle-1", employeeId: "emp-2", title: "产品规划", weight: 100, selfScore: 90, suggestedScore: 90, managerScore: 92 }
  ]
};

async function call({ method = "GET", resource = "bootstrap", session, db, body } = {}) {
  const response = await onRequest({
    request: new Request(`https://flow.example.com/api/hr-management?resource=${resource}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }),
    env: db ? { PRODUCT_FLOW_DB: db } : {},
    data: session ? { session } : {}
  });
  return { response, body: await response.json() };
}

test("HR API requires a session and D1", async () => {
  assert.equal((await call()).response.status, 401);
  assert.equal((await call({ session: { userId: "u-exec", department: "总经办", role: "executive" } })).response.status, 501);
});

test("employee bootstrap contains only the employee's own records", async () => {
  const result = await call({ session: { userId: "u-1", name: "示例员工", department: "运营部" }, db: createHrDb(sampleState) });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.state.employees.map(item => item.id), ["emp-1"]);
  assert.deepEqual(result.body.state.performanceItems.map(item => item.id), ["p-1"]);
  assert.equal(result.body.state.performanceItems[0].managerScore, 88);
  assert.deepEqual(result.body.scope.roles, ["employee"]);
});

test("manager bootstrap contains self and current direct reports only", async () => {
  const result = await call({ session: { userId: "u-manager", name: "示例主管", department: "运营部" }, db: createHrDb(sampleState) });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.state.employees.map(item => item.id).sort(), ["emp-1", "emp-manager"]);
  assert.deepEqual(result.body.state.performanceItems.map(item => item.id), ["p-1"]);
  assert.ok(result.body.scope.roles.includes("manager"));
});

test("unknown employee is denied while executive can bootstrap HR", async () => {
  const db = createHrDb(sampleState);
  assert.equal((await call({ session: { userId: "u-outsider", department: "品牌部" }, db })).response.status, 403);
  const executive = await call({ session: { userId: "u-exec", department: "总经办", role: "executive" }, db });
  assert.equal(executive.response.status, 200);
  assert.equal(executive.body.state.employees.length, 3);
  assert.ok(executive.body.scope.roles.includes("executive"));
});

test("Phase 1A has no payroll resource and stale writes are rejected", async () => {
  const session = { userId: "u-exec", department: "总经办", role: "executive" };
  const db = createHrDb(sampleState, 3);
  assert.equal((await call({ resource: "payroll", session, db })).response.status, 404);
  const stale = await call({
    method: "POST",
    session,
    db,
    body: { version: 2, action: { type: "upsert_employee", record: { id: "emp-3", userId: "u-3", name: "新员工", employmentStatus: "active" } } }
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error.code, "HR_VERSION_CONFLICT");
});

test("HR storage deletes dependent tables before parents and inserts parents first", async () => {
  const executed = [];
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { executed.push(sql); return { success: true }; }
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
  await writeHrManagementState(db, sampleState, "人事负责人");
  const deletes = executed.filter(sql => /^DELETE FROM/i.test(sql));
  assert.equal(deletes[0], "DELETE FROM hr_audit_logs");
  assert.equal(deletes.at(-1), "DELETE FROM hr_employees");
  const firstEmployeeInsert = executed.findIndex(sql => /^INSERT INTO hr_employees/i.test(sql));
  const firstAssignmentInsert = executed.findIndex(sql => /^INSERT INTO hr_assignments/i.test(sql));
  assert.ok(firstEmployeeInsert < firstAssignmentInsert);
});
