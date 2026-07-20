import { readPlatformState } from "../../../../../platform.js";

function select(record = {}, keys = []) {
  return Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

async function platformRecords(db) {
  const stored = await readPlatformState(db);
  return { state: stored?.state || {}, updatedAt: stored?.updatedAt || "" };
}

function inDepartmentScope(record, scope = {}) {
  if (scope.executive) return true;
  const recordDepartment = String(record?.department || record?.ownerDepartment || "").trim();
  return Boolean(recordDepartment) && (scope.departments || []).includes(recordDepartment);
}

export async function buildStrategyContext(db) {
  const { state, updatedAt } = await platformRecords(db);
  return {
    records: (state.strategies || []).slice(0, 30)
      .map(item => select(item, ["id", "name", "title", "status", "period", "owner", "progress", "updatedAt"])),
    updatedAt
  };
}

export async function buildProjectsContext(db) {
  const { state, updatedAt } = await platformRecords(db);
  return {
    records: (state.projects || []).slice(0, 60)
      .map(item => select(item, ["id", "name", "title", "status", "priority", "owner", "department", "progress", "dueDate", "updatedAt"])),
    updatedAt
  };
}

export async function buildCommitmentsContext(db, { scope } = {}) {
  const { state, updatedAt } = await platformRecords(db);
  return {
    records: (state.departmentCommitments || []).filter(item => inDepartmentScope(item, scope)).slice(0, 80)
      .map(item => select(item, ["id", "title", "status", "department", "owner", "progress", "dueDate", "updatedAt"])),
    updatedAt
  };
}

export async function buildOperatingReviewsContext(db, { scope } = {}) {
  const { state, updatedAt } = await platformRecords(db);
  return {
    records: {
      openRisks: (state.risks || []).filter(item => item.status !== "closed" && inDepartmentScope(item, scope)).slice(0, 60)
        .map(item => select(item, ["id", "title", "status", "severity", "owner", "department", "dueDate", "updatedAt"])),
      reports: (state.monthlyReports || []).filter(item => inDepartmentScope(item, scope)).slice(0, 20)
        .map(item => select(item, ["id", "title", "status", "period", "department", "summary", "updatedAt"]))
    },
    updatedAt
  };
}
