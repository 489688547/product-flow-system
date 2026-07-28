// 归档文件本体留在公司 Mac 上，线上只保存索引。归档成功不等于已入库：
// 「已下载未入库」意味着线上数字并不包含这批文件，必须与「已入库」明确区分。
export const ARCHIVE_STATE = Object.freeze({
  ingested: "ingested",
  pending: "pending",
  processing: "processing",
  skipped: "skipped",
  failed: "failed"
});

const STATE_LABEL = Object.freeze({
  [ARCHIVE_STATE.ingested]: "已入库",
  [ARCHIVE_STATE.pending]: "已下载未入库",
  [ARCHIVE_STATE.processing]: "处理中",
  [ARCHIVE_STATE.skipped]: "未纳入标准事实",
  [ARCHIVE_STATE.failed]: "处理失败"
});

const REASON_LABEL = Object.freeze({
  TIME_BASIS_MISSING: "缺少业务时间字段",
  DETAIL_STORAGE_DEFERRED: "明细索引暂缓",
  UNSUPPORTED_REPORT_GRAIN: "暂不支持该报表粒度"
});

const RESOURCE_LABEL = Object.freeze({
  order_items: "订单明细",
  orders: "订单",
  sales_items: "销售明细",
  inventory_snapshot: "库存快照",
  products: "商品",
  store_daily: "店铺每日",
  product_daily: "商品每日",
  live_daily: "直播每日",
  video_daily: "短视频每日"
});

function archiveState(archive) {
  const status = String(archive?.status || "");
  if (status === "processed") return ARCHIVE_STATE.ingested;
  if (status === "processing") return ARCHIVE_STATE.processing;
  if (status === "failed" || archive?.errorCode) return ARCHIVE_STATE.failed;
  if (archive?.ingestionDecision === "skipped") return ARCHIVE_STATE.skipped;
  return ARCHIVE_STATE.pending;
}

// 月份优先取相对路径中的目录名，与公司 Mac 上的目录结构保持一致；
// 取不到时回退到归档时间。
function archiveMonth(archive) {
  const fromPath = String(archive?.relativePath || "").match(/\/(\d{4}-\d{2})\//);
  if (fromPath) return fromPath[1];
  const stamp = Date.parse(String(archive?.archivedAt || ""));
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 7) : "未知月份";
}

function decorate(archive) {
  const state = archiveState(archive);
  return {
    id: String(archive?.id || ""),
    fileName: String(archive?.fileName || ""),
    // 只给相对路径：文件在公司 Mac 上，线上不构造也不展示绝对路径。
    relativePath: String(archive?.relativePath || ""),
    resourceType: String(archive?.resourceType || ""),
    resourceLabel: RESOURCE_LABEL[archive?.resourceType] || String(archive?.resourceType || "未知资源"),
    sizeBytes: Number(archive?.sizeBytes) || 0,
    month: archiveMonth(archive),
    archivedAt: archive?.archivedAt || "",
    processedAt: archive?.processedAt || "",
    errorCode: archive?.errorCode || "",
    ingestionDecision: archive?.ingestionDecision === "skipped" ? "skipped" : "pending",
    ingestionReasonCode: archive?.ingestionReasonCode || "",
    reasonLabel: REASON_LABEL[archive?.ingestionReasonCode] || "",
    decisionAt: archive?.decisionAt || "",
    decisionBy: archive?.decisionBy || "",
    version: Math.max(1, Number(archive?.version || 1)),
    state,
    stateLabel: STATE_LABEL[state]
  };
}

export function groupLocalArchives(archives = []) {
  const items = (Array.isArray(archives) ? archives : []).map(decorate);
  const pendingItems = items.filter(item => item.state === ARCHIVE_STATE.pending);
  const failedItems = items.filter(item => item.state === ARCHIVE_STATE.failed);
  const processingItems = items.filter(item => item.state === ARCHIVE_STATE.processing);
  const skippedItems = items.filter(item => item.state === ARCHIVE_STATE.skipped);
  const byResource = new Map();
  for (const item of items) {
    if (!byResource.has(item.resourceType)) {
      byResource.set(item.resourceType, { resourceType: item.resourceType, label: item.resourceLabel, items: [] });
    }
    byResource.get(item.resourceType).items.push(item);
  }
  const groups = [...byResource.values()]
    .map(group => {
      const byMonth = new Map();
      for (const item of group.items) {
        if (!byMonth.has(item.month)) byMonth.set(item.month, { month: item.month, items: [] });
        byMonth.get(item.month).items.push(item);
      }
      return {
        resourceType: group.resourceType,
        label: group.label,
        count: group.items.length,
        bytes: group.items.reduce((total, item) => total + item.sizeBytes, 0),
        pendingCount: group.items.filter(item => item.state === ARCHIVE_STATE.pending).length,
        failedCount: group.items.filter(item => item.state === ARCHIVE_STATE.failed).length,
        skippedCount: group.items.filter(item => item.state === ARCHIVE_STATE.skipped).length,
        months: [...byMonth.values()]
          .map(month => ({
            month: month.month,
            count: month.items.length,
            bytes: month.items.reduce((total, item) => total + item.sizeBytes, 0),
            items: month.items.slice().sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt)))
          }))
          .sort((left, right) => right.month.localeCompare(left.month))
      };
    })
    .sort((left, right) => right.bytes - left.bytes);
  return {
    totalCount: items.length,
    totalBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
    pending: {
      count: pendingItems.length,
      bytes: pendingItems.reduce((total, item) => total + item.sizeBytes, 0),
      items: pendingItems.slice().sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt))),
      warning: pendingItems.length
        ? "这些文件已下载到公司 Mac，但尚未入库，线上数字不含这批数据。"
        : ""
    },
    actionable: {
      count: failedItems.length + pendingItems.length,
      failedCount: failedItems.length,
      pendingCount: pendingItems.length,
      items: [
        ...failedItems.slice().sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt))),
        ...pendingItems.slice().sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt)))
      ],
      warning: [
        failedItems.length ? "处理失败的文件尚未形成新事实；上一可信数据保持不变。" : "",
        pendingItems.length ? "其余文件尚未记录是否纳入标准事实。" : ""
      ].filter(Boolean).join(" ")
    },
    processing: {
      count: processingItems.length,
      bytes: processingItems.reduce((total, item) => total + item.sizeBytes, 0),
      items: processingItems
    },
    skipped: {
      count: skippedItems.length,
      bytes: skippedItems.reduce((total, item) => total + item.sizeBytes, 0),
      items: skippedItems.slice().sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt)))
    },
    groups
  };
}
