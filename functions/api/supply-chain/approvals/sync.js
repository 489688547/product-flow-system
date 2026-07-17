import {
  getDingAccessToken,
  getDingApprovalInstance,
  jsonResponse,
  listDingApprovalInstanceIds,
  normalizeDingSupplyApproval,
  optionsResponse
} from "../../dingtalk/_shared/dingtalk.js";
import { normalizeSupplyChainState } from "../../../../src/domain/supplyChain.js";
import { readSupplyState, supplyDatabase, writeSupplyState } from "../_shared/storage.js";

const SYNC_DEPARTMENTS = new Set(["总经办", "供应链", "供应链部", "供应链团队", "采购部", "财务部"]);

function upsertByProcess(records, record) {
  const found = records.some(item => item.processInstanceId === record.processInstanceId);
  return found
    ? records.map(item => item.processInstanceId === record.processInstanceId ? { ...item, ...record } : item)
    : [record, ...records];
}

async function listAllInstanceIds(accessToken, input, fetchImpl) {
  const ids = [];
  const seenCursors = new Set();
  let cursor = 0;
  while (cursor !== null && cursor !== undefined && !seenCursors.has(cursor)) {
    seenCursors.add(cursor);
    const page = await listDingApprovalInstanceIds(accessToken, { ...input, cursor }, fetchImpl);
    ids.push(...page.processInstanceIds);
    cursor = page.nextCursor;
  }
  return [...new Set(ids)];
}

export async function syncSupplyApprovals({ state: inputState, accessToken, startTime, endTime, fetchImpl = fetch }) {
  const state = normalizeSupplyChainState(inputState);
  const settings = state.settings || {};
  if (!settings.purchaseProcessCode || !settings.paymentProcessCode) {
    const error = new Error("请先在供应链设置中配置采购申请和付款申请的 processCode。");
    error.status = 400;
    throw error;
  }
  const configs = [
    { kind: "purchase", processCode: settings.purchaseProcessCode, collection: "purchaseApprovals" },
    { kind: "payment", processCode: settings.paymentProcessCode, collection: "paymentApprovals" }
  ];
  const next = normalizeSupplyChainState(state);
  const synced = { purchase: 0, payment: 0, unmapped: 0 };

  for (const config of configs) {
    const ids = await listAllInstanceIds(accessToken, { processCode: config.processCode, startTime, endTime }, fetchImpl);
    const instances = await Promise.all(ids.map(id => getDingApprovalInstance(accessToken, id, fetchImpl)));
    for (const instance of instances) {
      const normalized = normalizeDingSupplyApproval(instance, {
        ...(settings.fieldMappings?.[config.kind] || {}),
        kind: config.kind
      });
      next[config.collection] = upsertByProcess(next[config.collection], normalized.record);
      if (config.kind === "purchase") {
        for (const line of normalized.lines) {
          const lineRecord = { ...line, purchaseProcessInstanceId: normalized.record.processInstanceId };
          const found = next.purchaseLines.some(item => item.id === lineRecord.id);
          next.purchaseLines = found
            ? next.purchaseLines.map(item => item.id === lineRecord.id ? { ...item, ...lineRecord } : item)
            : [lineRecord, ...next.purchaseLines];
        }
      }
      synced[config.kind] += 1;
      if (normalized.record.mappingStatus === "unmapped") synced.unmapped += 1;
    }
  }
  const completedAt = new Date().toISOString();
  next.syncRuns = [{
    id: `approval-sync-${completedAt}`,
    type: "dingtalk-approvals",
    status: "success",
    startTime,
    endTime,
    counts: synced,
    completedAt
  }, ...next.syncRuns].slice(0, 100);
  return { state: next, synced };
}

function sessionDepartment(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!SYNC_DEPARTMENTS.has(sessionDepartment(data.session))) {
    return jsonResponse({ synced: false, message: "当前部门无权同步钉钉采购与付款审批。" }, 403);
  }
  if (data.session?.role === "readonly") return jsonResponse({ synced: false, message: "只读账号不能执行审批同步。" }, 403);
  const db = supplyDatabase(env);
  if (!db) return jsonResponse({ synced: false, message: "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。" }, 501);

  const body = await request.json().catch(() => ({}));
  const now = Date.now();
  const startTime = Number(body.startTime) || now - 30 * 24 * 60 * 60 * 1000;
  const endTime = Number(body.endTime) || now;
  let stored;
  try {
    stored = await readSupplyState(db);
    const accessToken = await getDingAccessToken(env);
    const result = await syncSupplyApprovals({ state: stored.state, accessToken, startTime, endTime });
    const saved = await writeSupplyState(db, result.state, String(data.session?.name || "系统同步").slice(0, 80));
    return jsonResponse({ synced: true, counts: result.synced, ...saved });
  } catch (error) {
    if (stored?.state) {
      const failedAt = new Date().toISOString();
      const failedState = normalizeSupplyChainState(stored.state);
      failedState.syncRuns = [{
        id: `approval-sync-failed-${failedAt}`,
        type: "dingtalk-approvals",
        status: "failed",
        startTime,
        endTime,
        message: error.message || "审批同步失败",
        completedAt: failedAt
      }, ...failedState.syncRuns].slice(0, 100);
      await writeSupplyState(db, failedState, String(data.session?.name || "系统同步").slice(0, 80)).catch(() => {});
    }
    return jsonResponse({ synced: false, message: error.message || "钉钉审批同步失败。" }, error.status || 502);
  }
}
