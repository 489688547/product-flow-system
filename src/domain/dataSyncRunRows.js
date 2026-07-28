import { explainCollectionFailure } from "./collectionFailureExplainer.js";

const TERMINAL_JOB_STATES = new Set(["success", "failed", "waiting_human", "schema_changed"]);

const RESOURCE_LABELS = Object.freeze({
  orders: "订单",
  order_items: "订单商品明细",
  sales_items: "销售主题明细",
  store_daily: "店铺每日",
  product_daily: "商品每日",
  live_daily: "直播每日",
  video_daily: "短视频每日"
});

function safeDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function timestamp(row) {
  return String(row.completedAt || row.startedAt || row.createdAt || "");
}

function sourceName(job) {
  const provider = job?.providerId === "kuaimai"
    ? "快麦 ERP"
    : job?.providerId === "douyin-ecommerce"
      ? "抖店罗盘"
      : String(job?.providerId || "网页采集");
  const resource = RESOURCE_LABELS[job?.resourceType] || String(job?.resourceType || "未知资源");
  return `${provider} · ${resource}`;
}

function resultMessage(run) {
  if (run.status === "success") return "Chrome 采集完成，原始文件已归档并入库。";
  // 机器码不再直接示人：翻译成「出了什么事、卡在哪」，原码保留在 failure.code 里供排查。
  const failure = explainCollectionFailure(run.errorCode, { stage: run.stage });
  if (failure) return [failure.summary, failure.stuckAt].filter(Boolean).join(" ");
  return run.errorSummary || "采集未完成，请查看任务状态。";
}

// 抖店文件不进快麦的归档索引，但本机目录结构是确定的，可由 run 自身字段推出：
// <抖店罗盘>/<providerId>/<storeId>/<resourceType>/<年>/<月>/<业务日>/<contentHash>.xlsx
// 规则已用生产文件逐一核对。
const DERIVED_ARCHIVE_ROOTS = Object.freeze({ "douyin-ecommerce": "抖店罗盘" });

function derivedArchivePath(job, run) {
  const root = DERIVED_ARCHIVE_ROOTS[String(job?.providerId || "")];
  const hash = String(run?.archiveId || "");
  const businessDate = safeDate(job?.businessDate);
  const storeId = String(job?.storeId || "");
  const resourceType = String(job?.resourceType || "");
  if (!root || !hash || !businessDate || !storeId || !resourceType) return "";
  const [year, month] = businessDate.split("-");
  return `${root}/${job.providerId}/${storeId}/${resourceType}/${year}/${month}/${businessDate}/${hash}.xlsx`;
}

// run.archive_id 存的是内容哈希而不是归档记录 id：按 id 关联在生产上命中 0 条，
// 按 contentHash 才对得上。字段名与实际内容不一致，这里以实际内容为准。
function archiveLookup(archives) {
  return new Map((archives || [])
    .filter(archive => archive?.contentHash)
    .map(archive => [String(archive.contentHash), archive]));
}

function artifactFor(job, run, archiveByHash) {
  if (String(run?.status || "") !== "success") return { artifactPath: "", artifactSource: "" };
  const hash = String(run?.archiveId || "");
  if (!hash) return { artifactPath: "", artifactSource: "" };
  const indexed = archiveByHash.get(hash);
  if (indexed?.relativePath) {
    return { artifactPath: String(indexed.relativePath), artifactSource: "archive-index" };
  }
  const derived = derivedArchivePath(job, run);
  // 推不出来就如实留空，不退化成猜测。
  return derived ? { artifactPath: derived, artifactSource: "derived-path" } : { artifactPath: "", artifactSource: "" };
}

// 页面结构变化、扩展版本过旧、需要人工登录这几类，原样重试必然再失败，
// 给按钮等于让人白点；此时只给处理建议，不给重试。
function failureGuidance(job, run) {
  if (String(run?.status || "") === "success") {
    return { failure: null, retryTarget: null, canRetry: false, retryHint: "" };
  }
  const failure = explainCollectionFailure(run?.errorCode, { stage: run?.stage });
  const target = retryTargetFor(job);
  const retryable = failure ? failure.retryable : true;
  return {
    failure,
    retryTarget: target,
    canRetry: Boolean(target) && retryable,
    retryHint: failure?.action || ""
  };
}

function retryTargetFor(job) {
  const providerId = String(job?.providerId || "");
  const resourceType = String(job?.resourceType || "");
  const businessDate = safeDate(job?.businessDate);
  if (!providerId || !resourceType || !businessDate) return null;
  return {
    providerId,
    storeId: String(job?.storeId || ""),
    resourceType,
    businessDate
  };
}

export function buildDataSyncRunRows({ legacyRuns = [], jobs = [], runs = [], archives = [], now = new Date() } = {}) {
  const nowValue = now instanceof Date ? now.valueOf() : Date.parse(String(now || ""));
  const jobById = new Map(jobs.map(job => [job.id, job]));
  const archiveByHash = archiveLookup(archives);
  const terminalRows = runs.map(run => {
    const job = jobById.get(run.jobId) || {};
    const businessDate = safeDate(job.businessDate);
    return {
      id: `web:${run.id}`,
      sourceId: job.providerId || "web-collection",
      sourceName: sourceName(job),
      resourceType: job.resourceType || "",
      from: businessDate,
      to: businessDate,
      rowCount: run.rowCount === null || run.rowCount === undefined ? null : Number(run.rowCount),
      status: run.status || "failed",
      stage: run.stage || "",
      startedAt: run.startedAt || null,
      completedAt: run.completedAt || null,
      message: resultMessage(run),
      ...artifactFor(job, run, archiveByHash),
      ...failureGuidance(job, run)
    };
  });
  const terminalJobIds = new Set(runs.map(run => run.jobId));
  const jobRows = jobs
    .filter(job => !terminalJobIds.has(job.id))
    .map(job => {
      const businessDate = safeDate(job.businessDate);
      const terminal = TERMINAL_JOB_STATES.has(job.status);
      const queued = job.status === "queued";
      const leaseExpiresAt = Date.parse(String(job.leaseExpiresAt || ""));
      const expired = !terminal && !queued
        && Number.isFinite(nowValue)
        && Number.isFinite(leaseExpiresAt)
        && leaseExpiresAt <= nowValue;
      return {
        id: `web-job:${job.id}`,
        sourceId: job.providerId || "web-collection",
        sourceName: sourceName(job),
        resourceType: job.resourceType || "",
        from: businessDate,
        to: businessDate,
        rowCount: null,
        status: terminal || queued ? job.status : expired ? "stale" : "running",
        stage: job.stage || job.status || "",
        startedAt: job.startedAt || job.createdAt || null,
        completedAt: null,
        message: terminal
          ? resultMessage(job)
          : queued
            ? "任务已排队，等待 Chrome 扩展领取。"
            : expired
              ? "任务租约已过期，等待采集器重新领取。"
              : `Chrome 采集进行中${job.stage || job.status ? `，当前阶段 ${job.stage || job.status}` : ""}。`
      };
    });
  return [...terminalRows, ...jobRows, ...legacyRuns]
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)));
}
