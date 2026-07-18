export const BRAND_PRODUCTION_STATUSES = ["brief", "scripting", "editing", "reviewing", "ready", "published", "archived"];

export const BRAND_PRODUCTION_STATUS_LABELS = {
  brief: "待拆解",
  scripting: "脚本中",
  editing: "剪辑中",
  reviewing: "待审核",
  ready: "待发布",
  published: "已发布",
  archived: "已归档"
};

export const BRAND_DATA_STATUS_LABELS = {
  not_published: "待发布",
  missing_id: "缺素材 ID",
  waiting_sync: "等待数据同步",
  learning: "学习中",
  untested: "未获有效测试",
  tested: "已完成有效测试",
  inconsistent: "数据异常"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SETTINGS = {
  learningDays: { douyin: 3, kuaishou: 3, xiaohongshu: 3 },
  effectiveSpend: { douyin: 50, kuaishou: 50, xiaohongshu: 0 },
  idPrefix: "BC",
  nasRootLabel: "品牌内容/正式素材",
  nasIndexStatus: "offline",
  nasLastScannedAt: "2026-07-17T20:30:00+08:00",
  dataCenterContractStatus: "planned"
};

const PEOPLE = {
  directorA: { id: "u-chenyuetong", name: "陈悦桐" },
  directorB: { id: "u-zhengchuanshan", name: "郑传珊" },
  editorA: { id: "u-zhangyulei", name: "张煜雷" },
  editorB: { id: "u-chenyuxin", name: "陈语欣" },
  operatorA: { id: "u-ops-official", name: "官旗运营" },
  operatorB: { id: "u-ops-creator", name: "达人运营" }
};

function contentRecord({
  id,
  productId,
  productName,
  title,
  purpose = "product_sale",
  contentDirection,
  productionStatus,
  dueAt,
  director = PEOPLE.directorA,
  editor = PEOPLE.editorA,
  operator = PEOPLE.operatorA,
  sourceContentId = "",
  decisionId = ""
}) {
  return {
    id,
    productId,
    productName,
    purpose,
    title,
    brief: `${productName}内容任务，围绕${contentDirection}完成可发布版本。`,
    contentDirection,
    hook: "前三秒直接呈现用户问题与结果",
    sellingPoints: ["核心卖点可视化", "真实使用场景"],
    directorId: director.id,
    directorName: director.name,
    editorId: editor.id,
    editorName: editor.name,
    operatorId: operator.id,
    operatorName: operator.name,
    collaboratorIds: [],
    productionStatus,
    dueAt,
    createdAt: `${dueAt.slice(0, 8)}01T09:00:00+08:00`,
    updatedAt: `${dueAt}T18:00:00+08:00`,
    sourceContentId,
    decisionId
  };
}

const DEFAULT_CONTENTS = [
  contentRecord({ id: "BC-260717-001", productId: "p-berry", productName: "莓果冻干主粮", title: "开袋闻香反应", contentDirection: "真实反应开场", productionStatus: "published", dueAt: "2026-07-17", director: PEOPLE.directorB, editor: PEOPLE.editorA, operator: PEOPLE.operatorB }),
  contentRecord({ id: "BC-260708-002", productId: "p-wood", productName: "木砂", title: "吸水结团对比", contentDirection: "实验对比", productionStatus: "published", dueAt: "2026-07-08", director: PEOPLE.directorA, editor: PEOPLE.editorB }),
  contentRecord({ id: "BC-260706-001", productId: "p-berry", productName: "莓果冻干主粮", title: "挑食仓鼠七天变化", contentDirection: "喂养结果", productionStatus: "published", dueAt: "2026-07-06", director: PEOPLE.directorB, editor: PEOPLE.editorA, operator: PEOPLE.operatorB }),
  contentRecord({ id: "BC-260705-003", productId: "p-buckwheat", productName: "荞麦砂", title: "铲屎前后反差", contentDirection: "痛点反差", productionStatus: "published", dueAt: "2026-07-05", director: PEOPLE.directorA, editor: PEOPLE.editorB }),
  contentRecord({ id: "BC-260712-001", productId: "p-water", productName: "水壶", title: "夜间静音喝水", contentDirection: "安静场景", productionStatus: "published", dueAt: "2026-07-12", director: PEOPLE.directorA, editor: PEOPLE.editorA }),
  contentRecord({ id: "BC-260718-002", productId: "p-star", productName: "元气星浆果粮", title: "颗粒成分拆解", contentDirection: "成分可视化", productionStatus: "reviewing", dueAt: "2026-07-19", director: PEOPLE.directorB, editor: PEOPLE.editorB, operator: PEOPLE.operatorB }),
  contentRecord({ id: "BC-260718-003", productId: "p-woodvelvet", productName: "木丝绒", title: "一袋能用多久", contentDirection: "使用周期测算", productionStatus: "editing", dueAt: "2026-07-20", director: PEOPLE.directorA, editor: PEOPLE.editorA }),
  contentRecord({ id: "BC-260718-004", productId: "p-bean", productName: "小豆团", title: "通勤便携喂食", contentDirection: "生活场景", productionStatus: "brief", dueAt: "2026-07-22", director: PEOPLE.directorA, editor: PEOPLE.editorB })
];

const DEFAULT_ASSETS = [
  { id: "asset-berry-v3", contentId: "BC-260717-001", version: 3, nasRelativePath: "2026/07/莓果粮/BC-260717-001-v3.mp4", fileName: "BC-260717-001-v3.mp4", fileSize: 47_820_300, durationSeconds: 28, modifiedAt: "2026-07-17T14:20:00+08:00", thumbnailRef: "", reviewStatus: "approved", reviewComment: "前三秒保留原声反应。", createdBy: "张煜雷", createdAt: "2026-07-17T14:20:00+08:00", indexStatus: "indexed" },
  { id: "asset-wood-v2", contentId: "BC-260708-002", version: 2, nasRelativePath: "2026/07/木砂/BC-260708-002-v2.mp4", fileName: "BC-260708-002-v2.mp4", fileSize: 55_105_200, durationSeconds: 34, modifiedAt: "2026-07-08T17:10:00+08:00", thumbnailRef: "", reviewStatus: "approved", reviewComment: "结团对比镜头已补近景。", createdBy: "陈语欣", createdAt: "2026-07-08T17:10:00+08:00", indexStatus: "indexed" },
  { id: "asset-buckwheat-v1", contentId: "BC-260705-003", version: 1, nasRelativePath: "2026/07/荞麦砂/BC-260705-003-v1.mp4", fileName: "BC-260705-003-v1.mp4", fileSize: 39_801_000, durationSeconds: 25, modifiedAt: "2026-07-05T16:45:00+08:00", thumbnailRef: "", reviewStatus: "approved", reviewComment: "", createdBy: "陈语欣", createdAt: "2026-07-05T16:45:00+08:00", indexStatus: "indexed" },
  { id: "asset-star-v2", contentId: "BC-260718-002", version: 2, nasRelativePath: "2026/07/元气星/BC-260718-002-v2.mp4", fileName: "BC-260718-002-v2.mp4", fileSize: 62_420_000, durationSeconds: 31, modifiedAt: "2026-07-18T11:05:00+08:00", thumbnailRef: "", reviewStatus: "reviewing", reviewComment: "等待卖点字幕确认。", createdBy: "陈语欣", createdAt: "2026-07-18T11:05:00+08:00", indexStatus: "indexed" },
  { id: "asset-missing", contentId: "BC-260718-003", version: 1, nasRelativePath: "2026/07/木丝绒/BC-260718-003-v1.mp4", fileName: "BC-260718-003-v1.mp4", fileSize: 0, durationSeconds: null, modifiedAt: "2026-07-18T09:30:00+08:00", thumbnailRef: "", reviewStatus: "draft", reviewComment: "NAS 文件移动后待重新匹配。", createdBy: "张煜雷", createdAt: "2026-07-18T09:30:00+08:00", indexStatus: "missing" }
];

const DEFAULT_PUBLICATIONS = [
  { id: "pub-berry-douyin", contentId: "BC-260717-001", platform: "douyin", platformLabel: "抖音", accountId: "creator-account", accountName: "达人内容号", productLinkId: "link-berry", productLinkName: "莓果冻干主粮", publishedAt: "2026-07-17T10:00:00+08:00", platformContentId: "dy-content-001", materialIds: ["766300000000000001"], url: "", publishingPurpose: "product_sale", createdBy: "达人运营", createdAt: "2026-07-17T10:10:00+08:00", updatedAt: "2026-07-17T10:10:00+08:00" },
  { id: "pub-wood-douyin", contentId: "BC-260708-002", platform: "douyin", platformLabel: "抖音", accountId: "official-account", accountName: "官旗内容号", productLinkId: "link-wood", productLinkName: "木砂", publishedAt: "2026-07-08T09:00:00+08:00", platformContentId: "dy-content-002", materialIds: ["766300000000000002"], url: "", publishingPurpose: "product_sale", createdBy: "官旗运营", createdAt: "2026-07-08T09:08:00+08:00", updatedAt: "2026-07-08T09:08:00+08:00" },
  { id: "pub-berry-strong", contentId: "BC-260706-001", platform: "douyin", platformLabel: "抖音", accountId: "creator-account", accountName: "达人内容号", productLinkId: "link-berry", productLinkName: "莓果冻干主粮", publishedAt: "2026-07-06T11:00:00+08:00", platformContentId: "dy-content-003", materialIds: ["766300000000000003"], url: "", publishingPurpose: "product_sale", createdBy: "达人运营", createdAt: "2026-07-06T11:06:00+08:00", updatedAt: "2026-07-06T11:06:00+08:00" },
  { id: "pub-buckwheat", contentId: "BC-260705-003", platform: "douyin", platformLabel: "抖音", accountId: "official-account", accountName: "官旗内容号", productLinkId: "link-buckwheat", productLinkName: "荞麦砂", publishedAt: "2026-07-05T09:30:00+08:00", platformContentId: "dy-content-004", materialIds: ["766300000000000004"], url: "", publishingPurpose: "product_sale", createdBy: "官旗运营", createdAt: "2026-07-05T09:36:00+08:00", updatedAt: "2026-07-05T09:36:00+08:00" },
  { id: "pub-water", contentId: "BC-260712-001", platform: "douyin", platformLabel: "抖音", accountId: "official-account", accountName: "官旗内容号", productLinkId: "link-water", productLinkName: "水壶", publishedAt: "2026-07-12T15:00:00+08:00", platformContentId: "dy-content-005", materialIds: [], url: "", publishingPurpose: "product_sale", createdBy: "官旗运营", createdAt: "2026-07-12T15:05:00+08:00", updatedAt: "2026-07-12T15:05:00+08:00" }
];

const DEFAULT_SNAPSHOTS = [
  { id: "snap-berry-new", contentId: "BC-260717-001", asOfDate: "2026-07-17", platform: "douyin", accountId: "creator-account", deliverySystem: "全域", marketingGoal: "推商品", selectionMode: "商品自选", deliveryStrategy: "放量", productLinkId: "link-berry", materialId: "766300000000000001", spend: 18.4, gmv: 352, actualPayment: 337, impressions: 1820, clicks: 75, orders: 12, roi: 19.13, contentViews: 12_800, completionRate: 0.42, interactions: 428, favorites: 96, shares: 41, followersGained: 37, reconciliationStatus: "reconciled", coverageRate: 1, metricVersion: "demo-v1", sourceUpdatedAt: "2026-07-18T08:00:00+08:00" },
  { id: "snap-wood-low", contentId: "BC-260708-002", asOfDate: "2026-07-17", platform: "douyin", accountId: "official-account", deliverySystem: "全域", marketingGoal: "推商品", selectionMode: "全店托管", deliveryStrategy: "控成本", productLinkId: "link-wood", materialId: "766300000000000002", spend: 21.2, gmv: 174, actualPayment: 168, impressions: 3020, clicks: 88, orders: 7, roi: 8.21, contentViews: 5_230, completionRate: 0.31, interactions: 164, favorites: 39, shares: 12, followersGained: 9, reconciliationStatus: "reconciled", coverageRate: 1, metricVersion: "demo-v1", sourceUpdatedAt: "2026-07-18T08:00:00+08:00" },
  { id: "snap-berry-strong", contentId: "BC-260706-001", asOfDate: "2026-07-17", platform: "douyin", accountId: "creator-account", deliverySystem: "全域", marketingGoal: "推商品", selectionMode: "商品自选", deliveryStrategy: "放量", productLinkId: "link-berry", materialId: "766300000000000003", spend: 386.5, gmv: 4_982, actualPayment: 4_710, impressions: 38_200, clicks: 1_366, orders: 158, roi: 12.89, contentViews: 86_400, completionRate: 0.48, interactions: 3_820, favorites: 1_027, shares: 286, followersGained: 342, reconciliationStatus: "reconciled", coverageRate: 1, metricVersion: "demo-v1", sourceUpdatedAt: "2026-07-18T08:00:00+08:00" },
  { id: "snap-buckwheat", contentId: "BC-260705-003", asOfDate: "2026-07-17", platform: "douyin", accountId: "official-account", deliverySystem: "全域", marketingGoal: "推商品", selectionMode: "全店托管", deliveryStrategy: "控成本", productLinkId: "link-buckwheat", materialId: "766300000000000004", spend: 168.3, gmv: 271, actualPayment: 258, impressions: 19_600, clicks: 540, orders: 14, roi: 1.61, contentViews: 21_300, completionRate: 0.19, interactions: 318, favorites: 54, shares: 17, followersGained: 12, reconciliationStatus: "reconciled", coverageRate: 1, metricVersion: "demo-v1", sourceUpdatedAt: "2026-07-18T08:00:00+08:00" }
];

const DEFAULT_DECISIONS = [
  { id: "decision-berry", productId: "p-berry", productName: "莓果冻干主粮", action: "make_variation", label: "制作变体", evidence: "成熟素材已完成有效测试，完播和 ROI 同时高于产品链接基准。", quantity: 2, contentDirection: "复刻真实反应开场", targetAccount: "官旗-全域", sourceContentId: "BC-260706-001", evidenceVersion: "demo-v1", reviewAt: "2026-07-26", status: "pending", createdAt: "2026-07-18T08:10:00+08:00" },
  { id: "decision-wood", productId: "p-wood", productName: "木砂", action: "increase_test", label: "追加测试", evidence: "已成熟但累计消耗不足 50 元，暂不能评价内容能力。", quantity: 0, contentDirection: "沿用现有实验对比", targetAccount: "官旗-全域", sourceContentId: "BC-260708-002", evidenceVersion: "demo-v1", reviewAt: "2026-07-23", status: "pending", createdAt: "2026-07-18T08:12:00+08:00" }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mergeSettings(input = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...(input && typeof input === "object" ? input : {}),
    learningDays: { ...DEFAULT_SETTINGS.learningDays, ...(input?.learningDays || {}) },
    effectiveSpend: { ...DEFAULT_SETTINGS.effectiveSpend, ...(input?.effectiveSpend || {}) }
  };
}

export function createDefaultBrandContentState() {
  return {
    version: 0,
    contents: clone(DEFAULT_CONTENTS),
    assetVersions: clone(DEFAULT_ASSETS),
    publications: clone(DEFAULT_PUBLICATIONS),
    performanceSnapshots: clone(DEFAULT_SNAPSHOTS),
    decisions: clone(DEFAULT_DECISIONS),
    accounts: [
      { id: "official-account", platform: "douyin", platformLabel: "抖音", name: "官旗内容号", type: "official", status: "active" },
      { id: "creator-account", platform: "douyin", platformLabel: "抖音", name: "达人内容号", type: "creator", status: "active" },
      { id: "xiaohongshu-brand", platform: "xiaohongshu", platformLabel: "小红书", name: "品牌种草号", type: "brand", status: "waiting_import" }
    ],
    dataQuality: { asOfDate: "2026-07-17", reconciliationStatus: "reconciled", coverageRate: 1, difference: 0, metricVersion: "demo-v1", sourceUpdatedAt: "2026-07-18T08:00:00+08:00", sourceMode: "demo" },
    settings: clone(DEFAULT_SETTINGS),
    auditLogs: []
  };
}

export function normalizeBrandContentState(input = {}) {
  const defaults = createDefaultBrandContentState();
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const collections = ["contents", "assetVersions", "publications", "performanceSnapshots", "decisions", "accounts", "auditLogs"];
  const normalized = { ...defaults, ...source };
  collections.forEach(key => {
    normalized[key] = Array.isArray(source[key]) ? clone(source[key]) : defaults[key];
  });
  normalized.version = Math.max(0, Math.trunc(finiteNumber(source.version, defaults.version)));
  normalized.settings = mergeSettings(source.settings);
  normalized.dataQuality = source.dataQuality && typeof source.dataQuality === "object"
    ? { ...defaults.dataQuality, ...source.dataQuality }
    : defaults.dataQuality;
  normalized.contents = normalized.contents.map(content => ({
    ...content,
    productionStatus: BRAND_PRODUCTION_STATUSES.includes(content.productionStatus) ? content.productionStatus : "brief",
    collaboratorIds: Array.isArray(content.collaboratorIds) ? [...new Set(content.collaboratorIds.filter(Boolean))] : [],
    sellingPoints: Array.isArray(content.sellingPoints) ? content.sellingPoints.filter(Boolean) : []
  }));
  normalized.publications = normalized.publications.map(publication => ({
    ...publication,
    materialIds: Array.isArray(publication.materialIds) ? [...new Set(publication.materialIds.map(String).filter(Boolean))] : []
  }));
  return normalized;
}

function startOfLocalDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function completeDaysSince(value, now) {
  const start = startOfLocalDay(value);
  const end = startOfLocalDay(now);
  if (start == null || end == null) return 0;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

function snapshotTotals(snapshots) {
  return snapshots.reduce((total, snapshot) => ({
    spend: total.spend + (Number.isFinite(Number(snapshot.spend)) ? Number(snapshot.spend) : 0),
    gmv: total.gmv + (Number.isFinite(Number(snapshot.gmv)) ? Number(snapshot.gmv) : 0),
    views: total.views + (Number.isFinite(Number(snapshot.contentViews)) ? Number(snapshot.contentViews) : 0),
    interactions: total.interactions + (Number.isFinite(Number(snapshot.interactions)) ? Number(snapshot.interactions) : 0),
    favorites: total.favorites + (Number.isFinite(Number(snapshot.favorites)) ? Number(snapshot.favorites) : 0),
    shares: total.shares + (Number.isFinite(Number(snapshot.shares)) ? Number(snapshot.shares) : 0),
    followers: total.followers + (Number.isFinite(Number(snapshot.followersGained)) ? Number(snapshot.followersGained) : 0)
  }), { spend: 0, gmv: 0, views: 0, interactions: 0, favorites: 0, shares: 0, followers: 0 });
}

export function deriveContentDataStatus(content, publications = [], snapshots = [], settings = DEFAULT_SETTINGS, now = new Date()) {
  if (!content) return { code: "inconsistent", label: "内容不存在", ownerRole: "lead", canJudgeContent: false, reason: "缺少内容主档。" };
  const relatedPublications = publications.filter(publication => publication.contentId === content.id);
  if (!relatedPublications.length) {
    return { code: "not_published", label: BRAND_DATA_STATUS_LABELS.not_published, ownerRole: "operator", canJudgeContent: false, reason: "尚未建立发布记录。" };
  }
  if (relatedPublications.some(publication => !publication.materialIds?.length)) {
    return { code: "missing_id", label: BRAND_DATA_STATUS_LABELS.missing_id, ownerRole: "operator", canJudgeContent: false, reason: "发布记录缺少平台素材 ID。" };
  }
  const materialIds = new Set(relatedPublications.flatMap(publication => publication.materialIds || []).map(String));
  const relatedSnapshots = snapshots.filter(snapshot => snapshot.contentId === content.id || materialIds.has(String(snapshot.materialId || "")));
  if (!relatedSnapshots.length) {
    return { code: "waiting_sync", label: BRAND_DATA_STATUS_LABELS.waiting_sync, ownerRole: "operator", canJudgeContent: false, reason: "素材 ID 已登记，数据中心尚未返回快照。" };
  }
  const inconsistent = relatedSnapshots.some(snapshot => snapshot.reconciliationStatus !== "reconciled" || Number(snapshot.coverageRate) < 1);
  if (inconsistent) {
    return { code: "inconsistent", label: BRAND_DATA_STATUS_LABELS.inconsistent, ownerRole: "operator", canJudgeContent: false, reason: "数据尚未对平，暂不能确认内容问题。" };
  }
  const earliestPublication = relatedPublications
    .map(publication => publication.publishedAt)
    .filter(Boolean)
    .sort()[0];
  const platform = relatedPublications[0]?.platform || "douyin";
  const learningDays = Math.max(0, finiteNumber(settings?.learningDays?.[platform], DEFAULT_SETTINGS.learningDays[platform] ?? 3));
  const matureDays = completeDaysSince(earliestPublication, now);
  if (matureDays < learningDays) {
    const remaining = learningDays - matureDays;
    return { code: "learning", label: `学习中 · 还需 ${remaining} 个完整日`, ownerRole: "operator", canJudgeContent: false, reason: "仍在平台学习期。", matureDays, remainingDays: remaining };
  }
  const totals = snapshotTotals(relatedSnapshots);
  const threshold = Math.max(0, finiteNumber(settings?.effectiveSpend?.[platform], DEFAULT_SETTINGS.effectiveSpend[platform] ?? 0));
  if (totals.spend < threshold) {
    return { code: "untested", label: BRAND_DATA_STATUS_LABELS.untested, ownerRole: "operator", canJudgeContent: false, reason: "成熟素材仍未获得足够消耗，请先检查账户与投放分配。", matureDays, spend: totals.spend, threshold };
  }
  return { code: "tested", label: BRAND_DATA_STATUS_LABELS.tested, ownerRole: "lead", canJudgeContent: true, reason: "已满足学习期和有效测试门槛。", matureDays, spend: totals.spend, gmv: totals.gmv, roi: totals.spend ? totals.gmv / totals.spend : null };
}

function transitionError(from, to) {
  return new Error(`内容不能从“${BRAND_PRODUCTION_STATUS_LABELS[from] || from}”直接流转到“${BRAND_PRODUCTION_STATUS_LABELS[to] || to}”。`);
}

export function transitionBrandContent(state, id, nextStatus, actor = "", now = new Date(), options = {}) {
  const current = normalizeBrandContentState(state);
  const content = current.contents.find(item => item.id === id);
  if (!content) throw new Error("内容主档不存在。");
  if (!BRAND_PRODUCTION_STATUSES.includes(nextStatus)) throw new Error("未知内容生产状态。");
  const fromIndex = BRAND_PRODUCTION_STATUSES.indexOf(content.productionStatus);
  const toIndex = BRAND_PRODUCTION_STATUSES.indexOf(nextStatus);
  const returningForRevision = content.productionStatus === "reviewing" && nextStatus === "editing" && String(options.reason || "").trim();
  if (toIndex !== fromIndex + 1 && !returningForRevision) throw transitionError(content.productionStatus, nextStatus);
  const updatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  return {
    ...current,
    contents: current.contents.map(item => item.id === id ? { ...item, productionStatus: nextStatus, updatedAt, reviewComment: options.reason || item.reviewComment || "" } : item),
    auditLogs: [{ id: `audit-${id}-${Date.parse(updatedAt)}`, type: "content_transition", contentId: id, from: content.productionStatus, to: nextStatus, reason: options.reason || "", actor, createdAt: updatedAt }, ...current.auditLogs]
  };
}

function platformMaterialKey(publication, materialId) {
  return [publication.platform || "", publication.accountId || "", String(materialId || "")].join("|");
}

export function findBrandContentIssues(state, now = new Date()) {
  const current = normalizeBrandContentState(state);
  const issues = [];
  const materialOwners = new Map();
  current.publications.forEach(publication => {
    if (!publication.productLinkId) {
      issues.push({ id: `missing-product-${publication.id}`, type: "missing_product_link", severity: "high", contentId: publication.contentId, ownerRole: "operator", title: "发布记录缺少产品链接", scope: publication.accountName || publication.platformLabel, action: "补充产品链接映射", lastRetriedAt: "" });
    }
    if (!publication.materialIds?.length) {
      issues.push({ id: `missing-id-${publication.id}`, type: "missing_material_id", severity: "high", contentId: publication.contentId, ownerRole: "operator", title: "已发布但缺少素材 ID", scope: publication.accountName || publication.platformLabel, action: "回到发布后台补齐素材 ID", lastRetriedAt: "" });
    }
    (publication.materialIds || []).forEach(materialId => {
      const key = platformMaterialKey(publication, materialId);
      const existing = materialOwners.get(key);
      if (existing && existing.contentId !== publication.contentId) {
        issues.push({ id: `duplicate-${key}`, type: "duplicate_material_id", severity: "critical", contentId: publication.contentId, ownerRole: "operator", title: "平台素材 ID 重复归属", scope: `${existing.contentId} / ${publication.contentId}`, action: "核对平台与账户后解除错误关联", lastRetriedAt: "" });
      } else if (!existing) materialOwners.set(key, publication);
    });
  });
  current.assetVersions.filter(asset => asset.indexStatus === "missing").forEach(asset => {
    issues.push({ id: `asset-${asset.id}`, type: "nas_asset_missing", severity: "medium", contentId: asset.contentId, ownerRole: "editor", title: "NAS 文件失联", scope: asset.nasRelativePath, action: "重新扫描或选择移动后的文件", lastRetriedAt: current.settings.nasLastScannedAt || "" });
  });
  if (current.dataQuality.reconciliationStatus !== "reconciled" || Number(current.dataQuality.coverageRate) < 1) {
    issues.push({ id: "data-reconciliation", type: "data_reconciliation", severity: "critical", contentId: "", ownerRole: "operator", title: "公司投放总盘尚未对平", scope: `覆盖率 ${Math.round(Number(current.dataQuality.coverageRate || 0) * 100)}%`, action: "在数据中心补齐账户与模式后重新同步", lastRetriedAt: current.dataQuality.sourceUpdatedAt || "" });
  }
  return issues.map(issue => ({ ...issue, detectedAt: now.toISOString() }));
}

function groupBy(items, keyOf) {
  const groups = new Map();
  items.forEach(item => {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

export function summarizeBrandOverview(state, now = new Date()) {
  const current = normalizeBrandContentState(state);
  const statuses = new Map(current.contents.map(content => [content.id, deriveContentDataStatus(content, current.publications, current.performanceSnapshots, current.settings, now)]));
  const focus = { unpublished: 0, missingId: 0, learning: 0, untested: 0, dataIssues: findBrandContentIssues(current, now).length, pendingDecisions: current.decisions.filter(decision => decision.status === "pending").length };
  statuses.forEach(status => {
    if (status.code === "not_published") focus.unpublished += 1;
    if (status.code === "missing_id") focus.missingId += 1;
    if (status.code === "learning") focus.learning += 1;
    if (status.code === "untested") focus.untested += 1;
  });
  const totals = snapshotTotals(current.performanceSnapshots);
  const products = [...groupBy(current.contents, content => content.productId).entries()].map(([productId, contents]) => {
    const contentIds = new Set(contents.map(content => content.id));
    const snapshots = current.performanceSnapshots.filter(snapshot => contentIds.has(snapshot.contentId));
    const productTotals = snapshotTotals(snapshots);
    const productStatuses = contents.map(content => statuses.get(content.id));
    const tested = productStatuses.filter(status => status?.code === "tested").length;
    const learning = productStatuses.filter(status => status?.code === "learning").length;
    const untested = productStatuses.filter(status => status?.code === "untested").length;
    const nextAction = productStatuses.some(status => status?.code === "inconsistent" || status?.code === "missing_id")
      ? "先修复数据"
      : untested ? "追加有效测试" : learning ? "继续观察" : tested ? "复盘成熟素材" : "推进发布";
    return { productId, productName: contents[0]?.productName || productId, contentCount: contents.length, tested, learning, untested, spend: productTotals.spend, gmv: productTotals.gmv, roi: productTotals.spend ? productTotals.gmv / productTotals.spend : null, nextAction };
  });
  return {
    focus,
    paid: { spend: totals.spend, gmv: totals.gmv, roi: totals.spend ? totals.gmv / totals.spend : null },
    organic: { views: totals.views, interactions: totals.interactions, favorites: totals.favorites, shares: totals.shares, followersGained: totals.followers },
    products,
    statuses: Object.fromEntries(statuses),
    dataQuality: current.dataQuality
  };
}

function roleMetrics(state, role, now) {
  const idKey = `${role}Id`;
  const nameKey = `${role}Name`;
  const groups = groupBy(state.contents, content => `${content[idKey]}|${content[nameKey]}`);
  return [...groups.entries()].map(([key, contents]) => {
    const [personId, personName] = key.split("|");
    const statuses = contents.map(content => deriveContentDataStatus(content, state.publications, state.performanceSnapshots, state.settings, now));
    const published = contents.filter(content => content.productionStatus === "published" || content.productionStatus === "archived").length;
    const onTime = contents.filter(content => !content.dueAt || content.updatedAt?.slice(0, 10) <= content.dueAt).length;
    const tested = statuses.filter(status => status.code === "tested");
    const secondTier = tested.filter(status => Number(status.spend) >= Number(state.settings.effectiveSpend.douyin || 50) * 3).length;
    const matureSamples = tested.length;
    return {
      id: personId || personName,
      name: personName || "待分配",
      delivered: contents.length,
      onTimeRate: contents.length ? onTime / contents.length : null,
      publishedRate: contents.length ? published / contents.length : null,
      effectiveTestRate: published ? matureSamples / published : null,
      secondTier,
      matureSamples,
      rankStatus: matureSamples >= 3 ? "ranked" : "insufficient"
    };
  }).sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name, "zh-CN"));
}

export function buildBrandTeamMetrics(state, now = new Date()) {
  const current = normalizeBrandContentState(state);
  return {
    directors: roleMetrics(current, "director", now),
    editors: roleMetrics(current, "editor", now),
    operators: roleMetrics(current, "operator", now)
  };
}

function timestampOf(action) {
  const date = action.now ? new Date(action.now) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function nextContentId(state, now, index = 0) {
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const prefix = `${state.settings.idPrefix || "BC"}-${year}${month}${day}-`;
  const used = state.contents
    .map(content => String(content.id || ""))
    .filter(id => id.startsWith(prefix))
    .map(id => Number(id.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...used) + index + 1).padStart(3, "0")}`;
}

function createContentFromInput(state, input, actor, now, overrides = {}) {
  const id = overrides.id || nextContentId(state, now, overrides.index || 0);
  const createdAt = now.toISOString();
  return {
    id,
    productId: String(input.productId || ""),
    productName: String(input.productName || "未映射产品"),
    purpose: input.purpose || "product_sale",
    title: String(input.title || input.contentDirection || "新内容任务"),
    brief: String(input.brief || ""),
    contentDirection: String(input.contentDirection || ""),
    hook: String(input.hook || ""),
    sellingPoints: Array.isArray(input.sellingPoints) ? input.sellingPoints.filter(Boolean) : [],
    directorId: String(input.directorId || ""),
    directorName: String(input.directorName || "待分配"),
    editorId: String(input.editorId || ""),
    editorName: String(input.editorName || "待分配"),
    operatorId: String(input.operatorId || ""),
    operatorName: String(input.operatorName || "待分配"),
    collaboratorIds: Array.isArray(input.collaboratorIds) ? [...new Set(input.collaboratorIds.filter(Boolean))] : [],
    productionStatus: "brief",
    dueAt: String(input.dueAt || ""),
    createdAt,
    updatedAt: createdAt,
    createdBy: actor,
    sourceContentId: String(overrides.sourceContentId || input.sourceContentId || ""),
    decisionId: String(overrides.decisionId || input.decisionId || "")
  };
}

export function reduceBrandContentState(state, action = {}) {
  const current = normalizeBrandContentState(state);
  const now = timestampOf(action);
  const actor = String(action.actor || "系统");
  if (action.type === "create_content") {
    const record = createContentFromInput(current, action.record || {}, actor, now);
    if (!record.productId || !record.directorId || !record.editorId || !record.operatorId || !record.dueAt) throw new Error("创建内容需要产品、主编导、主剪辑、主运营和截止时间。");
    return { ...current, contents: [record, ...current.contents], auditLogs: [{ id: `audit-create-${record.id}`, type: "content_created", contentId: record.id, actor, createdAt: now.toISOString() }, ...current.auditLogs] };
  }
  if (action.type === "transition_content") return transitionBrandContent(current, action.id, action.nextStatus, actor, now, { reason: action.reason });
  if (action.type === "upsert_asset") {
    const record = { ...(action.record || {}), id: action.record?.id || `asset-${now.getTime()}` };
    return { ...current, assetVersions: [record, ...current.assetVersions.filter(item => item.id !== record.id)] };
  }
  if (action.type === "upsert_publication") {
    const record = { ...(action.record || {}), id: action.record?.id || `publication-${now.getTime()}`, materialIds: [...new Set((action.record?.materialIds || []).map(String).filter(Boolean))] };
    return { ...current, publications: [record, ...current.publications.filter(item => item.id !== record.id)] };
  }
  if (action.type === "confirm_decision") {
    const decision = current.decisions.find(item => item.id === action.id);
    if (!decision) throw new Error("补充决策不存在。");
    const input = action.input || {};
    const quantity = Math.max(0, Math.min(20, Math.trunc(finiteNumber(input.quantity, 0))));
    if (!quantity) throw new Error("确认制作决策时数量必须大于 0。");
    const records = Array.from({ length: quantity }, (_, index) => createContentFromInput(current, {
      ...input,
      productId: decision.productId,
      productName: decision.productName,
      title: `${decision.productName} · ${input.contentDirection || decision.contentDirection} ${index + 1}`
    }, actor, now, { index, sourceContentId: decision.sourceContentId, decisionId: decision.id }));
    return {
      ...current,
      contents: [...records, ...current.contents],
      decisions: current.decisions.map(item => item.id === decision.id ? { ...item, ...input, quantity, status: "confirmed", confirmedAt: now.toISOString(), confirmedBy: actor, createdContentIds: records.map(record => record.id) } : item),
      auditLogs: [{ id: `audit-decision-${decision.id}-${now.getTime()}`, type: "decision_confirmed", decisionId: decision.id, actor, createdAt: now.toISOString() }, ...current.auditLogs]
    };
  }
  if (action.type === "update_settings") {
    return { ...current, settings: mergeSettings({ ...current.settings, ...(action.patch || {}) }) };
  }
  throw new Error(`未知品牌内容动作：${action.type || "空"}。`);
}
