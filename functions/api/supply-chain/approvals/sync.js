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
const APPROVAL_DETAIL_INTERVAL_MS = 35;
const APPROVAL_THROTTLE_COOLDOWN_MS = 1100;

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function upsertByProcess(records, record) {
  const found = records.some(item => item.processInstanceId === record.processInstanceId);
  return found
    ? records.map(item => item.processInstanceId === record.processInstanceId ? { ...item, ...record } : item)
    : [record, ...records];
}

function belongsToSupplyChain(record, settings) {
  const category = String(record?.businessCategory || "").trim();
  const prefixes = Array.isArray(settings.purchaseCategoryPrefixes)
    ? settings.purchaseCategoryPrefixes.map(value => String(value || "").trim()).filter(Boolean)
    : [];
  return !category || !prefixes.length || prefixes.some(prefix => category.startsWith(prefix));
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

function isDingTalkThrottle(error) {
  return Number(error?.detail?.errcode) === 90018 || /(?:90018|qps.*流控|请求被暂时限制)/i.test(String(error?.message || ""));
}

async function getApprovalInstanceWithThrottleRetry(accessToken, id, fetchImpl, sleepImpl) {
  try {
    return await getDingApprovalInstance(accessToken, id, fetchImpl);
  } catch (error) {
    if (!isDingTalkThrottle(error)) throw error;
    await sleepImpl(APPROVAL_THROTTLE_COOLDOWN_MS);
    return getDingApprovalInstance(accessToken, id, fetchImpl);
  }
}

async function getApprovalInstancesWithPacing(accessToken, ids, fetchImpl, sleepImpl) {
  const instances = [];
  for (let index = 0; index < ids.length; index += 1) {
    if (index > 0) await sleepImpl(APPROVAL_DETAIL_INTERVAL_MS);
    instances.push(await getApprovalInstanceWithThrottleRetry(accessToken, ids[index], fetchImpl, sleepImpl));
  }
  return instances;
}

export async function syncSupplyApprovals({ state: inputState, accessToken, startTime, endTime, fetchImpl = fetch, sleepImpl = sleep }) {
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
  next.purchaseApprovals = next.purchaseApprovals.filter(record => belongsToSupplyChain(record, settings));
  const allowedPurchaseIds = new Set(next.purchaseApprovals.map(record => record.processInstanceId));
  next.paymentApprovals = next.paymentApprovals.filter(record => !record.purchaseProcessInstanceId || allowedPurchaseIds.has(record.purchaseProcessInstanceId));
  const synced = { purchase: 0, payment: 0, unmapped: 0, skipped: 0 };

  for (const config of configs) {
    const ids = await listAllInstanceIds(accessToken, { processCode: config.processCode, startTime, endTime }, fetchImpl);
    const instances = await getApprovalInstancesWithPacing(accessToken, ids, fetchImpl, sleepImpl);
    for (const instance of instances) {
      const normalized = normalizeDingSupplyApproval(instance, {
        ...(settings.fieldMappings?.[config.kind] || {}),
        kind: config.kind
      });
      if (!belongsToSupplyChain(normalized.record, settings)) {
        synced.skipped += 1;
        continue;
      }
      if (config.kind === "payment" && normalized.record.purchaseProcessInstanceId && !allowedPurchaseIds.has(normalized.record.purchaseProcessInstanceId)) {
        synced.skipped += 1;
        continue;
      }
      next[config.collection] = upsertByProcess(next[config.collection], normalized.record);
      if (config.kind === "purchase") {
        allowedPurchaseIds.add(normalized.record.processInstanceId);
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
