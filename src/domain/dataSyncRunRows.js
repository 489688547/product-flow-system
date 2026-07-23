const TERMINAL_JOB_STATES = new Set(["success", "failed", "waiting_human", "schema_changed"]);

const RESOURCE_LABELS = Object.freeze({
  orders: "订单",
  order_items: "订单商品明细",
  sales_items: "销售主题明细"
});

function safeDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function timestamp(row) {
  return String(row.completedAt || row.startedAt || row.createdAt || "");
}

function sourceName(job) {
  const provider = job?.providerId === "kuaimai" ? "快麦 ERP" : String(job?.providerId || "网页采集");
  const resource = RESOURCE_LABELS[job?.resourceType] || String(job?.resourceType || "未知资源");
  return `${provider} · ${resource}`;
}

function resultMessage(run) {
  if (run.status === "success") return "Chrome 采集完成，原始文件已归档并入库。";
  return run.errorSummary || [run.errorCode, run.stage ? `阶段 ${run.stage}` : ""].filter(Boolean).join(" · ") || "采集未完成，请查看任务状态。";
}

export function buildDataSyncRunRows({ legacyRuns = [], jobs = [], runs = [] } = {}) {
  const jobById = new Map(jobs.map(job => [job.id, job]));
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
      message: resultMessage(run)
    };
  });
  const terminalJobIds = new Set(runs.map(run => run.jobId));
  const jobRows = jobs
    .filter(job => !terminalJobIds.has(job.id))
    .map(job => {
      const businessDate = safeDate(job.businessDate);
      const terminal = TERMINAL_JOB_STATES.has(job.status);
      return {
        id: `web-job:${job.id}`,
        sourceId: job.providerId || "web-collection",
        sourceName: sourceName(job),
        resourceType: job.resourceType || "",
        from: businessDate,
        to: businessDate,
        rowCount: null,
        status: terminal ? job.status : "running",
        stage: job.stage || job.status || "",
        startedAt: job.startedAt || job.createdAt || null,
        completedAt: null,
        message: terminal
          ? resultMessage(job)
          : `Chrome 采集进行中${job.stage || job.status ? `，当前阶段 ${job.stage || job.status}` : ""}。`
      };
    });
  return [...terminalRows, ...jobRows, ...legacyRuns]
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)));
}
