import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLoopbackAddress, readDwsTodoPreview } from "./server/dwsTodoPreview.mjs";
import { createProductionDataClient } from "./server/productionDataClient.mjs";
import {
  buildConfigResponse,
  createDingCalendarEvent,
  createDingTodoTask,
  getDingAccessToken,
  getDingUserByCode,
  getDingUserDetail,
  filterOrgUsers,
  listDingCalendarEvents,
  mapDingRole,
  publicUser,
  queryDingDocTextFromUrl,
  queryDingMeetingMinutesText,
  syncDingTodoTask,
  syncDingOrg
} from "./functions/api/dingtalk/_shared/dingtalk.js";
import {
  callKuaimai,
  kuaimaiConfigFromEnv,
  pullKuaimaiDay,
  refreshKuaimaiSession
} from "./functions/api/kuaimai/_shared/kuaimai.js";
import { syncSupplyApprovals } from "./functions/api/supply-chain/approvals/sync.js";
import { normalizeSupplyChainState } from "./src/domain/supplyChain.js";
import { normalizeDataCenterState } from "./src/domain/dataCenter.js";
import {
  confirmCategoryMapping,
  copyInsightRuleSet,
  normalizeUserInsightsState,
  transitionCompetitorCandidate
} from "./src/domain/userInsights.js";
import { AI_DATA_DOMAINS, normalizeAiProvider } from "./src/domain/aiAssistant.js";
import {
  applyCollaborationTransition,
  filterCollaborationItems,
  normalizeCollaborationDraft
} from "./src/domain/collaboration.js";
import {
  validateCreateInput,
  validatePatchInput,
  validateTransitionInput
} from "./functions/api/platform/v1/_shared/collaborationValidation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DINGTALK_PORT || 8127);
const LOCAL_DATA_DIR = path.join(__dirname, ".local-data");
const LOCAL_STATE_PATH = path.join(LOCAL_DATA_DIR, "product-flow-state.json");
const LOCAL_SUPPLY_STATE_PATH = path.join(LOCAL_DATA_DIR, "supply-chain-state.json");
const LOCAL_DATA_CENTER_STATE_PATH = path.join(LOCAL_DATA_DIR, "data-center-state.json");
const LOCAL_USER_INSIGHTS_PATH = path.join(LOCAL_DATA_DIR, "user-insights-state.json");
const LOCAL_COLLABORATION_PATH = path.join(LOCAL_DATA_DIR, "collaboration-items.json");
let orgCache = null;
let productionDataClient;

const LOCAL_COLLABORATION_ACTOR = {
  userId: "u-zhou",
  unionId: "union-zhou",
  name: "周荣庆",
  departmentIds: ["exec"],
  departmentNames: ["总经办"],
  executive: true,
  readonly: false
};

loadDotEnv();
productionDataClient = createProductionDataClient({
  apiUrl: process.env.PRODUCTION_DATA_API_URL || "https://product-flow-system.pages.dev",
  accessToken: process.env.PRODUCTION_DATA_ACCESS_TOKEN || ""
});

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function readLocalCompanyState() {
  try {
    const raw = await readFile(LOCAL_STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readLocalSupplyState() {
  try {
    const raw = JSON.parse(await readFile(LOCAL_SUPPLY_STATE_PATH, "utf8"));
    return normalizeSupplyChainState(raw.state || raw);
  } catch {
    return normalizeSupplyChainState();
  }
}

async function writeLocalSupplyState(state, updatedBy = "") {
  const normalized = normalizeSupplyChainState(state);
  const updatedAt = new Date().toISOString();
  const payload = { state: normalized, version: normalized.version, updatedAt, updatedBy: String(updatedBy || "").slice(0, 80) };
  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  await writeFile(LOCAL_SUPPLY_STATE_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

async function readLocalDataCenterState() {
  try {
    const raw = JSON.parse(await readFile(LOCAL_DATA_CENTER_STATE_PATH, "utf8"));
    return normalizeDataCenterState(raw.state || raw);
  } catch {
    return normalizeDataCenterState();
  }
}

async function writeLocalDataCenterState(state, updatedBy = "") {
  const normalized = normalizeDataCenterState(state);
  const updatedAt = new Date().toISOString();
  const payload = { state: normalized, version: normalized.version, updatedAt, updatedBy: String(updatedBy || "").slice(0, 80) };
  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  await writeFile(LOCAL_DATA_CENTER_STATE_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

async function readLocalUserInsights() {
  try {
    const raw = JSON.parse(await readFile(LOCAL_USER_INSIGHTS_PATH, "utf8"));
    return normalizeUserInsightsState(raw.state || raw);
  } catch {
    return normalizeUserInsightsState();
  }
}

async function writeLocalUserInsights(state, updatedBy = "") {
  const normalized = normalizeUserInsightsState(state);
  const updatedAt = new Date().toISOString();
  const payload = { state: { ...normalized, updatedAt }, version: normalized.version, updatedAt, updatedBy: String(updatedBy || "").slice(0, 80) };
  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  await writeFile(LOCAL_USER_INSIGHTS_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function upsertLocalCollection(collection, record) {
  const current = collection.find(item => item.id === record.id);
  const version = current ? Number(current.version || 1) + 1 : Math.max(1, Number(record.version || 1));
  const next = { ...record, version, updatedAt: new Date().toISOString(), updatedBy: "周荣庆" };
  return { next, collection: current ? collection.map(item => item.id === next.id ? next : item) : [next, ...collection] };
}

async function handleLocalUserInsights(req, res, url) {
  try {
    const state = await readLocalUserInsights();
    const basePath = "/api/platform/v1/user-insights";
    const subpath = url.pathname.slice(basePath.length).replace(/^\//, "");
    if (req.method === "GET" && !subpath) {
      json(res, 200, {
        synced: true,
        advisoryOnly: true,
        localPreview: true,
        actor: { departments: ["总经办"], readonly: false },
        data: {
          categoryMappings: state.categoryMappings,
          snapshots: state.snapshots,
          entities: state.entities,
          ruleSets: state.ruleSets,
          ruleHistory: state.ruleHistory || [],
          competitors: state.competitors,
          suggestions: state.suggestions,
          syncRuns: state.syncRuns
        }
      });
      return;
    }
    if (req.method === "GET" && ["category-mappings", "rules", "competitors"].includes(subpath)) {
      const key = subpath === "category-mappings" ? "categoryMappings" : subpath === "rules" ? "ruleSets" : "competitors";
      json(res, 200, { synced: true, [subpath === "category-mappings" ? "mappings" : subpath]: state[key] });
      return;
    }
    const body = await readBody(req);
    if (!subpath && req.method === "POST" && body.action === "retry") {
      const mapping = state.categoryMappings.find(item => item.status === "confirmed" && item.platform === body.scope?.platform && item.categoryId === body.scope?.categoryId);
      if (!mapping) {
        json(res, 409, { synced: false, message: "请先确认平台类目，再发起手动重试。", error: { code: "CATEGORY_CONFIRMATION_REQUIRED", retryable: false } });
        return;
      }
      const run = { id: globalThis.crypto.randomUUID(), ...body.scope, status: "queued", trigger: "manual", requestedAt: new Date().toISOString(), requestedBy: "周荣庆" };
      const saved = upsertLocalCollection(state.syncRuns, run);
      await writeLocalUserInsights({ ...state, syncRuns: saved.collection }, "周荣庆");
      json(res, 202, { synced: true, run: saved.next, localPreview: true });
      return;
    }
    if (subpath === "category-mappings" && ["POST", "PATCH"].includes(req.method)) {
      let mapping = body.mapping || {};
      if (body.action === "confirm") mapping = confirmCategoryMapping(mapping, { name: "周荣庆", department: "总经办", now: new Date().toISOString() });
      const saved = upsertLocalCollection(state.categoryMappings, mapping);
      await writeLocalUserInsights({ ...state, categoryMappings: saved.collection }, "周荣庆");
      json(res, 200, { synced: true, mapping: saved.next, localPreview: true, security: "不保存浏览器凭证" });
      return;
    }
    if (subpath === "rules" && ["POST", "PATCH"].includes(req.method)) {
      let rule = body.rule || {};
      if (body.action === "copy") {
        const source = state.ruleSets.find(item => item.id === body.sourceRuleId);
        if (!source) { json(res, 404, { synced: false, message: "来源规则不存在。" }); return; }
        rule = copyInsightRuleSet(source, { ...body.target, actor: "周荣庆", now: new Date().toISOString() });
      }
      if (body.action === "publish") rule = { ...rule, status: "published" };
      if (body.action === "disable") rule = { ...rule, status: "disabled" };
      const saved = upsertLocalCollection(state.ruleSets, rule);
      const history = [{ id: globalThis.crypto.randomUUID(), action: body.action === "copy" ? "copy_rule" : body.action === "publish" ? "publish_rule" : body.action === "disable" ? "disable_rule" : "upsert_rule", name: saved.next.name, consumerAppId: saved.next.consumerAppId, ownerDepartment: saved.next.ownerDepartment, status: saved.next.status, version: saved.next.version, updatedAt: saved.next.updatedAt, updatedBy: "周荣庆" }, ...(state.ruleHistory || [])];
      await writeLocalUserInsights({ ...state, ruleSets: saved.collection, ruleHistory: history }, "周荣庆");
      json(res, 200, { synced: true, rule: saved.next, localPreview: true });
      return;
    }
    if (subpath === "competitors" && req.method === "POST") {
      const saved = upsertLocalCollection(state.competitors, { ...(body.competitor || {}), status: "candidate" });
      await writeLocalUserInsights({ ...state, competitors: saved.collection }, "周荣庆");
      json(res, 201, { synced: true, competitor: saved.next, localPreview: true });
      return;
    }
    if (subpath === "competitors" && req.method === "PATCH") {
      const current = state.competitors.find(item => item.id === body.id);
      if (!current) { json(res, 404, { synced: false, message: "竞品候选不存在。" }); return; }
      const next = transitionCompetitorCandidate(current, body.status, { actor: "周荣庆", department: "总经办", reason: body.reason, now: new Date().toISOString() });
      const saved = upsertLocalCollection(state.competitors, next);
      await writeLocalUserInsights({ ...state, competitors: saved.collection }, "周荣庆");
      json(res, 200, { synced: true, competitor: saved.next, localPreview: true });
      return;
    }
    json(res, 405, { synced: false, message: "Method not allowed" });
  } catch (error) {
    json(res, 400, { synced: false, message: error.message || "本地用户洞察处理失败。" });
  }
}

async function handleLocalAiPreview(req, res, url) {
  const state = await readLocalDataCenterState();
  const provider = normalizeAiProvider(state.aiProviders?.[0]);
  const secretConfigured = Boolean(process.env.LINGSUAN_API_KEY);
  const publicProvider = { ...provider, secretConfigured };
  if (req.method === "GET" && url.pathname === "/api/platform/v1/ai/status") {
    json(res, 200, {
      enabled: process.env.AI_ASSISTANT_ENABLED === "1",
      ready: provider.enabled && secretConfigured,
      provider: publicProvider,
      allowedDomains: AI_DATA_DOMAINS.filter(item => item.id !== "finance").map(item => item.id),
      blockedDomains: ["finance"],
      localPreview: true
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/platform/v1/ai/provider") {
    json(res, 200, { provider: publicProvider, policies: state.aiDataPolicies || [], canManage: false, localPreview: true });
    return;
  }
  json(res, 403, {
    message: "本地 AI 预览为只读模式，不调用外部模型或修改 Provider。",
    error: { code: "AI_LOCAL_PREVIEW_READ_ONLY", retryable: false }
  });
}

function relativeIso(days, hour = 18) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function localCollaborationIdentity() {
  return {
    requesterUser: {
      userId: LOCAL_COLLABORATION_ACTOR.userId,
      unionId: LOCAL_COLLABORATION_ACTOR.unionId,
      name: LOCAL_COLLABORATION_ACTOR.name
    },
    requesterDepartment: { id: "exec", name: "总经办" }
  };
}

function localCollaborationSeed() {
  const now = new Date().toISOString();
  const executive = localCollaborationIdentity().requesterUser;
  const definitions = [
    {
      id: "demo-decision-douyin",
      idempotencyKey: "demo:decision:douyin-budget",
      kind: "decision",
      title: "抖音投流优化方案需要确认增量预算",
      description: "增长组已完成两轮素材与人群测试，继续放量前需要确认预算上限。",
      requestedAction: "确认采用推荐方案并批准下一阶段预算。",
      impactLevel: "high",
      businessImpact: "若本周不决策，将错过当前素材起量窗口。",
      status: "pending_acceptance",
      requesterUser: { userId: "u-growth", unionId: "union-growth", name: "李晴" },
      requesterDepartment: { id: "growth", name: "增长部" },
      ownerDepartment: { id: "exec", name: "总经办" },
      decisionOwner: executive,
      partnerDepartments: [{ id: "brand", name: "品牌内容部" }],
      dueAt: relativeIso(2),
      source: { appId: "brand-content", entityType: "campaign", entityId: "douyin-q3", sourceRecordId: "douyin-q3", sourceRoute: "#/content-review", sourceLabel: "品牌内容 · 抖音投流优化" },
      strategyLinks: { strategyId: "growth", projectId: "douyin-investment" }
    },
    {
      id: "demo-risk-supply",
      idempotencyKey: "demo:risk:supply-delay",
      kind: "risk",
      title: "鹦鹉谷物棒首批包材交期存在延误风险",
      description: "供应商交期较原计划晚三天，可能影响首批排产。",
      requestedAction: "协调供应商锁定补救交期，并同步销售侧是否调整首发节奏。",
      impactLevel: "high",
      businessImpact: "若不能在两天内恢复，将影响新品首发和投流计划。",
      status: "blocked",
      requesterUser: { userId: "u-product", unionId: "union-product", name: "陈薇" },
      requesterDepartment: { id: "product", name: "产品部" },
      ownerUser: executive,
      ownerDepartment: { id: "exec", name: "总经办" },
      partnerDepartments: [{ id: "supply", name: "供应链部" }, { id: "sales", name: "销售部" }],
      dueAt: relativeIso(-1),
      blockedReason: "供应商尚未给出可承诺的新交期。",
      coordinationNeed: "需要总经办协调供应链与销售共同确认补救方案。",
      blockedAt: relativeIso(-2, 10),
      source: { appId: "supply-chain", entityType: "quality_issue", entityId: "parrot-bar-packaging", sourceRecordId: "parrot-bar-packaging", sourceRoute: "#/supply-chain", sourceLabel: "供应链 · 鹦鹉谷物棒" },
      strategyLinks: { strategyId: "product", requiredResultId: "new-product-launch" }
    },
    {
      id: "demo-handoff-product",
      idempotencyKey: "demo:handoff:launch-material",
      kind: "handoff",
      title: "新品上市素材需求等待总经办确认优先级",
      description: "产品部已提交上市节奏，品牌内容部需要明确资源排序。",
      requestedAction: "确认该新品是否进入本月重点资源位，并指定牵头人。",
      impactLevel: "medium",
      businessImpact: "影响新品上市素材交付时间和渠道启动。",
      status: "pending_acceptance",
      requesterUser: { userId: "u-product", unionId: "union-product", name: "陈薇" },
      requesterDepartment: { id: "product", name: "产品部" },
      ownerDepartment: { id: "exec", name: "总经办" },
      partnerDepartments: [{ id: "brand", name: "品牌内容部" }],
      dueAt: relativeIso(4),
      source: { appId: "product-flow", entityType: "product_task", entityId: "launch-material", sourceRecordId: "launch-material", sourceRoute: "#/progress", sourceLabel: "产品全周期 · 新品上市" },
      strategyLinks: { strategyId: "product" }
    },
    {
      id: "demo-data-verification",
      idempotencyKey: "demo:data:gmv-definition",
      kind: "data_issue",
      title: "月度汇报 GMV 口径已完成修正，等待验收",
      description: "数据中心已统一创建时间口径并排除其它渠道。",
      requestedAction: "核对本月汇报数字与经营口径是否一致。",
      impactLevel: "medium",
      businessImpact: "决定月度经营复盘中的核心数据是否可信。",
      status: "pending_verification",
      requesterUser: executive,
      requesterDepartment: { id: "exec", name: "总经办" },
      ownerUser: { userId: "u-data", unionId: "union-data", name: "王衡" },
      ownerDepartment: { id: "data", name: "数据中心" },
      partnerDepartments: [],
      dueAt: relativeIso(1),
      completionSummary: "已按订单创建时间重算，并完成异常渠道排除。",
      submittedAt: now,
      source: { appId: "data-center", entityType: "data_quality", entityId: "monthly-gmv", sourceRecordId: "monthly-gmv", sourceRoute: "#/data-center", sourceLabel: "数据中心 · 月度经营数据" }
    }
  ];
  const items = definitions.map(definition => normalizeCollaborationDraft({
    ...definition,
    version: 1,
    createdAt: relativeIso(-5, 9),
    updatedAt: now,
    createdBy: definition.requesterUser,
    updatedBy: definition.requesterUser
  }, { now }));
  return {
    items,
    activitiesByItem: Object.fromEntries(items.map(item => [item.id, [{
      id: `activity:${item.id}:demo-create`,
      itemId: item.id,
      idempotencyKey: `demo-create:${item.id}`,
      action: "create",
      fromStatus: "",
      toStatus: item.status,
      actorUser: item.requesterUser,
      actorDepartment: item.requesterDepartment,
      reason: "本地演示数据",
      changedFields: [],
      createdAt: item.createdAt
    }]])),
    updatedAt: now
  };
}

async function readLocalCollaborationState() {
  try {
    const raw = JSON.parse(await readFile(LOCAL_COLLABORATION_PATH, "utf8"));
    return {
      items: Array.isArray(raw.items) ? raw.items.map(item => normalizeCollaborationDraft(item)) : [],
      activitiesByItem: raw.activitiesByItem && typeof raw.activitiesByItem === "object" ? raw.activitiesByItem : {},
      updatedAt: raw.updatedAt || ""
    };
  } catch {
    const seeded = localCollaborationSeed();
    await writeLocalCollaborationState(seeded);
    return seeded;
  }
}

async function writeLocalCollaborationState(state) {
  const payload = { ...state, updatedAt: new Date().toISOString() };
  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  await writeFile(LOCAL_COLLABORATION_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function localCollaborationError(res, error) {
  const status = Number(error?.status) || (error?.code === "COLLABORATION_VERSION_CONFLICT" ? 409 : 400);
  json(res, status, {
    synced: false,
    message: error?.message || "本地协同数据处理失败。",
    error: { code: error?.code || "COLLABORATION_ITEM_INVALID", retryable: false, details: error?.details }
  });
}

function localActivity(item, action, before, reason = "") {
  return {
    id: `activity:${item.id}:${action}:${item.version}`,
    itemId: item.id,
    idempotencyKey: `${action}:${item.id}:${item.version}`,
    action,
    fromStatus: before?.status || "",
    toStatus: item.status,
    actorUser: localCollaborationIdentity().requesterUser,
    actorDepartment: localCollaborationIdentity().requesterDepartment,
    reason,
    changedFields: before ? Object.keys(item).filter(key => JSON.stringify(item[key]) !== JSON.stringify(before[key])) : [],
    createdAt: item.updatedAt
  };
}

async function handleLocalCollaboration(req, res, url) {
  try {
    const base = "/api/platform/v1/collaboration-items";
    const tail = url.pathname.slice(base.length).replace(/^\//, "");
    const [encodedId = "", action = ""] = tail.split("/");
    const id = decodeURIComponent(encodedId);
    const state = await readLocalCollaborationState();

    if (!id) {
      if (req.method === "GET") {
        const query = {
          view: url.searchParams.get("view") || "my_scope",
          status: url.searchParams.getAll("status").flatMap(value => value.split(",")).filter(Boolean),
          appId: url.searchParams.get("appId") || "",
          kind: url.searchParams.get("kind") || "",
          impactLevel: url.searchParams.get("impactLevel") || "",
          departmentId: url.searchParams.get("departmentId") || "",
          query: url.searchParams.get("query") || "",
          dueBefore: url.searchParams.get("dueBefore") || "",
          includeArchived: ["true", "1"].includes(url.searchParams.get("includeArchived"))
        };
        json(res, 200, {
          synced: true,
          items: filterCollaborationItems(state.items, query, LOCAL_COLLABORATION_ACTOR),
          nextCursor: "",
          scope: { mode: "company", departmentIds: LOCAL_COLLABORATION_ACTOR.departmentIds }
        });
        return;
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const existing = state.items.find(item => item.idempotencyKey === body.idempotencyKey);
        if (existing) {
          json(res, 200, { synced: true, deduplicated: true, item: existing });
          return;
        }
        const item = validateCreateInput(body, localCollaborationIdentity(), new Date());
        state.items.unshift(item);
        state.activitiesByItem[item.id] = [localActivity(item, "create")];
        await writeLocalCollaborationState(state);
        json(res, 201, { synced: true, item });
        return;
      }
      json(res, 405, { synced: false, message: "Method not allowed" });
      return;
    }

    const index = state.items.findIndex(item => item.id === id);
    if (index < 0) {
      json(res, 404, { synced: false, message: "协同事项不存在。", error: { code: "COLLABORATION_ITEM_NOT_FOUND" } });
      return;
    }
    const current = state.items[index];

    if (!action && req.method === "GET") {
      json(res, 200, { synced: true, item: current });
      return;
    }
    if (!action && req.method === "PATCH") {
      const body = await readBody(req);
      if (body.version !== current.version) {
        const error = new Error("事项已被其他同事更新，请刷新后重试。");
        error.code = "COLLABORATION_VERSION_CONFLICT";
        error.details = { currentVersion: current.version, updatedAt: current.updatedAt };
        throw error;
      }
      const update = validatePatchInput(body, current, LOCAL_COLLABORATION_ACTOR, new Date());
      state.items[index] = update.item;
      state.activitiesByItem[id] = [localActivity(update.item, update.action, current, update.reason), ...(state.activitiesByItem[id] || [])];
      await writeLocalCollaborationState(state);
      json(res, 200, { synced: true, item: update.item });
      return;
    }
    if (action === "activities" && req.method === "GET") {
      json(res, 200, { synced: true, activities: state.activitiesByItem[id] || [] });
      return;
    }
    if (action === "transitions" && req.method === "POST") {
      const body = validateTransitionInput(await readBody(req));
      const duplicate = (state.activitiesByItem[id] || []).some(activity => activity.idempotencyKey === body.idempotencyKey);
      if (duplicate) {
        json(res, 200, { synced: true, deduplicated: true, item: current });
        return;
      }
      if (body.version !== current.version) {
        const error = new Error("事项已被其他同事更新，请刷新后重试。");
        error.code = "COLLABORATION_VERSION_CONFLICT";
        error.details = { currentVersion: current.version, updatedAt: current.updatedAt };
        throw error;
      }
      const result = applyCollaborationTransition(current, body, LOCAL_COLLABORATION_ACTOR, new Date());
      state.items[index] = result.item;
      state.activitiesByItem[id] = [result.activity, ...(state.activitiesByItem[id] || [])];
      await writeLocalCollaborationState(state);
      json(res, 200, { synced: true, item: result.item });
      return;
    }
    if (action === "dingtalk" && req.method === "POST") {
      json(res, 501, {
        synced: false,
        message: "本地预览不会发送真实钉钉待办，请在线上验收环境验证。",
        error: { code: "COLLABORATION_LOCAL_DINGTALK_DISABLED", retryable: false }
      });
      return;
    }
    json(res, 405, { synced: false, message: "Method not allowed" });
  } catch (error) {
    localCollaborationError(res, error);
  }
}

function validateCompanyState(state) {
  const requiredArrays = ["demands", "products", "tasks", "deliverables", "reviews", "feedbackIssues"];
  if (!state || typeof state !== "object" || Array.isArray(state)) return "缺少有效的产品流程状态数据。";
  const missing = requiredArrays.filter(key => !Array.isArray(state[key]));
  return missing.length ? `状态数据缺少必要列表：${missing.join("、")}` : "";
}

async function handleKuaimaiStatus(res) {
  const config = kuaimaiConfigFromEnv(process.env);
  if (!config.ready) {
    json(res, 200, { connected: false, configured: false, message: "缺少快麦API配置（.env 里的 KUAIMAI_* 变量）。" });
    return;
  }
  try {
    const payload = await callKuaimai("open.system.time.get", {}, config);
    json(res, 200, { connected: true, configured: true, serverTime: payload.time || payload.systemTime || payload.date || "", traceId: payload.trace_id || "" });
  } catch (error) {
    json(res, 200, { connected: false, configured: true, message: error.message || "快麦接口连接失败。" });
  }
}

async function handleKuaimaiRefresh(res) {
  const config = kuaimaiConfigFromEnv(process.env);
  if (!config.ready || !config.refreshToken) {
    json(res, 400, { refreshed: false, message: "缺少快麦API配置或refreshToken。" });
    return;
  }
  try {
    const session = await refreshKuaimaiSession(config);
    json(res, 200, { refreshed: true, expiresIn: session?.expiresIn ?? null, refreshedAt: new Date().toISOString() });
  } catch (error) {
    const rateLimited = /限流|频繁|一小时|too many/i.test(error.message || "");
    json(res, rateLimited ? 200 : 502, { refreshed: false, rateLimited, message: error.message || "刷新会话失败。" });
  }
}

async function handleKuaimaiPull(res, url) {
  const config = kuaimaiConfigFromEnv(process.env);
  if (!config.ready) {
    json(res, 400, { message: "缺少快麦API配置。" });
    return;
  }
  const date = String(url.searchParams.get("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    json(res, 400, { message: "缺少要同步的日期参数（YYYY-MM-DD）。" });
    return;
  }
  const pageNo = Math.max(1, Number(url.searchParams.get("pageNo")) || 1);
  try {
    const result = await pullKuaimaiDay(config, { date, pageNo, maxPages: 8 });
    json(res, 200, { synced: true, ...result });
  } catch (error) {
    json(res, 502, { synced: false, message: error.message || "快麦订单拉取失败。" });
  }
}

async function handleState(req, res) {
  try {
    if (productionDataClient.configured) {
      if (req.method === "GET") {
        json(res, 200, await productionDataClient.readState());
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { message: "Method not allowed" });
        return;
      }
      const body = await readBody(req);
      const message = validateCompanyState(body.state);
      if (message) {
        json(res, 400, { synced: false, message });
        return;
      }
      json(res, 200, await productionDataClient.writeState(body));
      return;
    }
    if (req.method === "GET") {
      const stored = await readLocalCompanyState();
      json(res, 200, stored ? { synced: true, ...stored } : { synced: false, state: null });
      return;
    }
    if (req.method !== "POST") {
      json(res, 405, { message: "Method not allowed" });
      return;
    }
    const body = await readBody(req);
    const message = validateCompanyState(body.state);
    if (message) {
      json(res, 400, { synced: false, message });
      return;
    }
    const updatedAt = new Date().toISOString();
    const payload = {
      state: body.state,
      version: String(body.state.version || "unknown"),
      updatedAt,
      updatedBy: String(body.updatedBy || "").slice(0, 80)
    };
    await mkdir(LOCAL_DATA_DIR, { recursive: true });
    await writeFile(LOCAL_STATE_PATH, JSON.stringify(payload, null, 2));
    json(res, 200, { synced: true, version: payload.version, updatedAt });
  } catch (error) {
    json(res, error.status || 500, { synced: false, message: error.message || "公司共享数据同步失败。", error: { code: error.code || "STATE_SYNC_FAILED" } });
  }
}

async function handleProductionWriteSession(req, res) {
  try {
    if (!productionDataClient.configured) {
      json(res, 200, productionDataClient.status());
      return;
    }
    if (req.method === "GET") {
      json(res, 200, productionDataClient.status());
      return;
    }
    if (req.method === "DELETE") {
      json(res, 200, await productionDataClient.lock());
      return;
    }
    if (req.method === "POST") {
      json(res, 200, await productionDataClient.unlock(await readBody(req)));
      return;
    }
    json(res, 405, { message: "Method not allowed" });
  } catch (error) {
    json(res, error.status || 500, { allowed: false, unlocked: false, message: error.message || "生产写入授权失败。", error: { code: error.code || "PRODUCTION_ACCESS_FAILED" } });
  }
}

async function handleEnvironmentReadiness(res) {
  if (!productionDataClient.configured) {
    json(res, 200, {
      environment: "development",
      ready: false,
      checkedAt: new Date().toISOString(),
      capabilities: [{
        id: "local-production-data",
        name: "本地生产数据连接",
        description: "本地服务通过个人令牌连接生产数据网关。",
        level: "blocking",
        status: "blocked",
        missing: ["PRODUCTION_DATA_ACCESS_TOKEN"]
      }],
      dataAccess: productionDataClient.status(),
      audit: []
    });
    return;
  }
  try {
    const [production, state] = await Promise.all([productionDataClient.readiness(), productionDataClient.readState()]);
    json(res, 200, {
      ...production,
      environment: "development",
      productionEnvironment: production.environment,
      dataAccess: productionDataClient.status(),
      audit: state.audit || []
    });
  } catch (error) {
    json(res, error.status || 500, { ready: false, message: error.message || "生产环境状态读取失败。", error: { code: error.code || "ENVIRONMENT_READINESS_FAILED" } });
  }
}

async function handleProductionRollback(req, res) {
  try {
    if (req.method !== "POST") {
      json(res, 405, { message: "Method not allowed" });
      return;
    }
    const body = await readBody(req);
    json(res, 200, await productionDataClient.rollback(body.auditId, body.confirmation));
  } catch (error) {
    json(res, error.status || 500, { synced: false, message: error.message || "生产数据回滚失败。", error: { code: error.code || "PRODUCTION_ROLLBACK_FAILED" } });
  }
}

function requireLocalOnlineRuntime(res) {
  json(res, 501, {
    synced: false,
    message: "旧 Node 预览不提供真实外部操作，请通过 npm start 运行完整 Pages Functions。",
    error: { code: "LOCAL_ONLINE_RUNTIME_REQUIRED" }
  });
}

async function handleSupplyState(req, res) {
  try {
    if (req.method === "GET") {
      const state = await readLocalSupplyState();
      json(res, 200, { synced: Boolean(state.updatedAt), state, version: state.version, updatedAt: state.updatedAt || "" });
      return;
    }
    if (req.method !== "POST") {
      json(res, 405, { message: "Method not allowed" });
      return;
    }
    const body = await readBody(req);
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      json(res, 400, { synced: false, message: "缺少有效的供应链数据。" });
      return;
    }
    const saved = await writeLocalSupplyState(body.state, body.updatedBy || "本地开发");
    json(res, 200, { synced: true, version: saved.version, updatedAt: saved.updatedAt });
  } catch (error) {
    json(res, 500, { synced: false, message: error.message || "本地供应链数据保存失败。" });
  }
}

async function handleDataCenterState(req, res) {
  try {
    if (req.method === "GET") {
      const state = await readLocalDataCenterState();
      json(res, 200, { synced: Boolean(state.updatedAt), state, version: state.version, updatedAt: state.updatedAt || "" });
      return;
    }
    if (req.method !== "POST") {
      json(res, 405, { message: "Method not allowed" });
      return;
    }
    const body = await readBody(req);
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      json(res, 400, { synced: false, message: "缺少有效的数据中心元数据。" });
      return;
    }
    const saved = await writeLocalDataCenterState(body.state, body.updatedBy || "本地开发");
    json(res, 200, { synced: true, version: saved.version, updatedAt: saved.updatedAt });
  } catch (error) {
    json(res, 500, { synced: false, message: error.message || "本地数据中心元数据保存失败。" });
  }
}

async function handleSupplyApprovalSync(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { synced: false, message: "Method not allowed" });
    return;
  }
  try {
    const body = await readBody(req);
    const now = Date.now();
    const state = await readLocalSupplyState();
    const accessToken = await getDingAccessToken(process.env);
    const result = await syncSupplyApprovals({
      state,
      accessToken,
      startTime: Number(body.startTime) || now - 30 * 24 * 60 * 60 * 1000,
      endTime: Number(body.endTime) || now
    });
    const saved = await writeLocalSupplyState(result.state, "本地钉钉同步");
    json(res, 200, { synced: true, counts: result.synced, updatedAt: saved.updatedAt, version: saved.version });
  } catch (error) {
    json(res, error.status || 502, { synced: false, message: error.message || "本地钉钉审批同步失败。" });
  }
}

async function handleDingLogin(req, res) {
  try {
    const body = await readBody(req);
    const authCode = body.authCode || body.code;
    if (!authCode) {
      json(res, 400, { message: "缺少钉钉免登授权码 authCode" });
      return;
    }
    const accessToken = await getDingAccessToken(process.env);
    const basic = await getDingUserByCode(accessToken, authCode);
    const detail = await getDingUserDetail(accessToken, basic.userid);
    const user = publicUser(basic, detail);
    const role = mapDingRole({ ...basic, ...detail });
    json(res, 200, {
      role,
      user,
      org: { corpId: body.corpId || "", deptIds: user.deptIds, roles: user.roles }
    });
  } catch (error) {
    json(res, error.status || 500, {
      message: error.message || "钉钉登录失败",
      detail: error.detail || undefined
    });
  }
}

async function syncOrgCache() {
  const accessToken = await getDingAccessToken(process.env);
  orgCache = await syncDingOrg(accessToken, fetch, new Date(), {
    rootDeptId: process.env.DINGTALK_ROOT_DEPT_ID || 1
  });
  return orgCache;
}

async function handleDingOrgSync(req, res) {
  try {
    const org = await syncOrgCache();
    json(res, 200, { synced: true, org });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉组织架构同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingOrgUsers(req, res, url) {
  try {
    if (!orgCache || Date.now() > Date.parse(orgCache.expiresAt || 0)) await syncOrgCache();
    const query = url.searchParams.get("q") || "";
    const limit = Number(url.searchParams.get("limit") || 20);
    json(res, 200, { users: filterOrgUsers(orgCache, query, limit), syncedAt: orgCache.syncedAt });
  } catch (error) {
    json(res, error.status || 500, {
      users: [],
      message: error.message || "钉钉同事搜索失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingTodoCreate(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const todo = await createDingTodoTask(accessToken, body);
    json(res, 200, { synced: true, todo });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉待办同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingTodoSync(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const todo = await syncDingTodoTask(accessToken, body);
    json(res, 200, { synced: true, todo });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉待办同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingCalendarCreate(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const event = await createDingCalendarEvent(accessToken, body);
    json(res, 200, { synced: true, event });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉会议同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingCalendarEvents(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const result = await listDingCalendarEvents(accessToken, body);
    json(res, 200, { synced: true, ...result });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉日历会议查询失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingMeetingMinutes(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const result = await queryDingMeetingMinutesText(accessToken, body);
    json(res, 200, { synced: true, text: result.text, raw: result.raw });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉会议纪要同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingDocRead(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const result = await queryDingDocTextFromUrl(accessToken, {
      ...body,
      operatorUnionId: body.operatorUnionId || body.unionId || process.env.DINGTALK_OPERATOR_UNION_ID || process.env.DINGTALK_OPERATOR_ID || ""
    });
    json(res, 200, {
      synced: true,
      title: result.title,
      docKey: result.docKey,
      docUrl: result.docUrl,
      text: result.text
    });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉文档读取失败",
      detail: error.detail || undefined
    });
  }
}

function handleDingOrgStatus(res) {
  json(res, 200, {
    configured: buildConfigResponse(process.env, "").configured,
    cached: !!orgCache,
    syncedAt: orgCache?.syncedAt || "",
    expiresAt: orgCache?.expiresAt || ""
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(__dirname, pathname));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch (error) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 200, {});
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/dingtalk/config") {
    json(res, 200, buildConfigResponse(process.env, url.origin));
    return;
  }
  if (url.pathname === "/api/dev/dws/todos") {
    if (req.method !== "GET") {
      json(res, 405, { readonly: true, message: "Method not allowed" });
      return;
    }
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      json(res, 403, { readonly: true, message: "仅允许本机回环地址访问真实待办预览。" });
      return;
    }
    try {
      const result = await readDwsTodoPreview({ status: url.searchParams.get("status") === "true" });
      json(res, 200, result);
    } catch (error) {
      json(res, 502, { readonly: true, message: error.message || "DWS 待办查询失败。" });
    }
    return;
  }
  if (url.pathname === "/api/platform/v1/collaboration-items" || url.pathname.startsWith("/api/platform/v1/collaboration-items/")) {
    await handleLocalCollaboration(req, res, url);
    return;
  }
  if (url.pathname === "/api/platform/v1/user-insights" || url.pathname.startsWith("/api/platform/v1/user-insights/")) {
    await handleLocalUserInsights(req, res, url);
    return;
  }
  if ([
    "/api/platform/v1/ai/status",
    "/api/platform/v1/ai/provider",
    "/api/platform/v1/ai/provider/test",
    "/api/platform/v1/ai/chat"
  ].includes(url.pathname)) {
    await handleLocalAiPreview(req, res, url);
    return;
  }
  if (url.pathname === "/api/state") {
    await handleState(req, res);
    return;
  }
  if (url.pathname === "/api/platform/v1/production-write-session") {
    await handleProductionWriteSession(req, res);
    return;
  }
  if (url.pathname === "/api/platform/v1/environment-readiness" && req.method === "GET") {
    await handleEnvironmentReadiness(res);
    return;
  }
  if (url.pathname === "/api/platform/v1/production-data/rollback") {
    await handleProductionRollback(req, res);
    return;
  }
  if (url.pathname === "/api/supply-chain") {
    await handleSupplyState(req, res);
    return;
  }
  if (url.pathname === "/api/supply-chain/approvals/sync") {
    await handleSupplyApprovalSync(req, res);
    return;
  }
  if (url.pathname === "/api/data-center") {
    await handleDataCenterState(req, res);
    return;
  }
  if (url.pathname === "/api/data-center/sales") {
    json(res, 501, { synced: false, message: "本地测试模式没有 D1 数据库，数据中心销售读取将降级到浏览器本地仓库。" });
    return;
  }
  if (url.pathname === "/api/sales") {
    json(res, 501, { synced: false, message: "本地测试模式没有 D1 数据库，销售数据将保存在浏览器本地。" });
    return;
  }
  if (url.pathname === "/api/kuaimai/status" && req.method === "GET") {
    await handleKuaimaiStatus(res);
    return;
  }
  if (url.pathname === "/api/kuaimai/refresh" && req.method === "POST") {
    requireLocalOnlineRuntime(res);
    return;
  }
  if (url.pathname === "/api/kuaimai/pull" && req.method === "GET") {
    await handleKuaimaiPull(res, url);
    return;
  }
  if (url.pathname === "/api/dingtalk/login" && req.method === "POST") {
    await handleDingLogin(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/org/status" && req.method === "GET") {
    handleDingOrgStatus(res);
    return;
  }
  if (url.pathname === "/api/dingtalk/org/sync" && ["GET", "POST"].includes(req.method)) {
    await handleDingOrgSync(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/org/users" && req.method === "GET") {
    await handleDingOrgUsers(req, res, url);
    return;
  }
  if (url.pathname === "/api/dingtalk/todo/create" && req.method === "POST") {
    requireLocalOnlineRuntime(res);
    return;
  }
  if (url.pathname === "/api/dingtalk/todo/sync" && req.method === "POST") {
    requireLocalOnlineRuntime(res);
    return;
  }
  if (url.pathname === "/api/dingtalk/calendar/create" && req.method === "POST") {
    requireLocalOnlineRuntime(res);
    return;
  }
  if (url.pathname === "/api/dingtalk/calendar/events" && req.method === "POST") {
    await handleDingCalendarEvents(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/meeting/minutes" && req.method === "POST") {
    await handleDingMeetingMinutes(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/doc/read" && req.method === "POST") {
    await handleDingDocRead(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Product flow DingTalk server: http://127.0.0.1:${PORT}/`);
});
