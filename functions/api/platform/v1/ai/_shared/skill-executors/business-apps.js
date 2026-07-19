import { readOperationsState } from "../../../../../ecommerce-operations/_shared/storage.js";
import { filterOperationsStateForSession } from "../../../../../ecommerce-operations/_shared/access.js";
import { readBrandContentState } from "../../../../../brand-content/_shared/storage.js";
import { readPerformanceState } from "../../../../../performance-management/_shared/storage.js";
import { filterPerformanceState } from "../../../../../performance-management/_shared/access.js";

function select(record = {}, keys = []) {
  return Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

function matches(record, { query = "", status = "" } = {}) {
  if (status && String(record?.status || record?.productionStatus || "") !== status) return false;
  return !query || JSON.stringify(record).toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function selected(records, keys, args, fallbackLimit = 60) {
  return (records || []).filter(item => matches(item, args)).slice(0, args.limit || fallbackLimit).map(item => select(item, keys));
}

async function queryOperations({ db, session, args }) {
  const state = filterOperationsStateForSession(await readOperationsState(db), session);
  return {
    records: {
      cycles: selected(state.cycles, ["id", "productId", "productName", "platform", "storeName", "status", "ownerId", "ownerName", "updatedAt"], args),
      plans: selected(state.plans, ["id", "cycleId", "title", "status", "ownerId", "ownerName", "reviewStatus", "updatedAt"], args),
      executions: selected(state.executions, ["id", "planId", "title", "status", "ownerId", "ownerName", "dueAt", "acceptedAt", "updatedAt"], args),
      collaborations: selected(state.collaborations, ["id", "cycleId", "title", "status", "targetDepartment", "ownerId", "ownerName", "dueAt", "updatedAt"], args),
      responsibilities: selected(state.responsibilities, ["id", "cycleId", "memberId", "memberName", "role", "status", "updatedAt"], args),
      aiReviews: selected(state.aiReviews, ["id", "planId", "mode", "summary", "createdAt"], args)
    },
    updatedAt: state.updatedAt || ""
  };
}

async function queryBrand({ db, args }) {
  const stored = await readBrandContentState(db);
  const state = stored?.state || {};
  return {
    records: {
      contents: selected(state.contents, ["id", "productId", "productName", "title", "purpose", "productionStatus", "dueAt", "directorName", "editorName", "operatorName", "updatedAt"], args),
      assets: selected(state.assetVersions, ["id", "contentId", "version", "reviewStatus", "indexStatus", "modifiedAt"], args),
      publications: selected(state.publications, ["id", "contentId", "platform", "platformLabel", "accountName", "publishedAt", "publishingPurpose", "updatedAt"], args),
      performance: selected(state.performanceSnapshots, ["id", "contentId", "asOfDate", "platform", "contentViews", "completionRate", "interactions", "favorites", "shares", "followersGained", "reconciliationStatus", "coverageRate", "sourceUpdatedAt"], args)
    },
    updatedAt: stored?.updatedAt || ""
  };
}

async function queryPerformance({ db, session, args }) {
  const state = filterPerformanceState(await readPerformanceState(db), session);
  return {
    records: {
      assessments: selected(state.assessments, ["id", "cycleId", "employeeId", "employeeName", "managerId", "managerName", "status", "period", "evidenceRefs", "submittedAt", "reviewedAt", "updatedAt"], args),
      reviewRequests: selected(state.reviewRequests, ["id", "assessmentId", "status", "reason", "createdAt", "resolvedAt"], args),
      managerAssignments: selected(state.managerAssignments, ["id", "managerId", "managerName", "employeeId", "employeeName", "active", "updatedAt"], args)
    },
    updatedAt: state.updatedAt || ""
  };
}

export const BUSINESS_SKILL_EXECUTORS = Object.freeze({
  ecommerce_operations_query: queryOperations,
  brand_content_query: queryBrand,
  performance_management_query: queryPerformance
});
