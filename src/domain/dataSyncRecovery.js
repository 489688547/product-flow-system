import { DOUYIN_COLLECTION_RESOURCES } from "./dataCenterConnectors.js";

const RUNNING_STATES = new Set(["queued", "claimed", "opening", "collecting", "exporting", "downloading", "validating", "ingesting", "running"]);

export const DOUYIN_RECOVERY = Object.freeze({
  DOUYIN_LOGIN_REQUIRED: "在公司 Mac 的同一 Chrome Profile 登录抖店后重新触发。",
  DOUYIN_HUMAN_VERIFICATION_REQUIRED: "在公司 Mac 完成验证码、扫码、滑块或设备验证后重新触发。",
  DOUYIN_REPORT_SCHEMA_CHANGED: "页面字段已变化，采集已停止，等待更新采集适配。",
  DOUYIN_PAGE_SCHEMA_CHANGED: "页面结构已变化，采集已停止，等待更新采集适配。",
  DOUYIN_STORE_IDENTITY_MISMATCH: "确认公司 Chrome 当前店铺与任务店铺一致后重新触发。",
  DOUYIN_OFFICIAL_REPORT_BUTTON_MISSING: "官方报表入口不可用，请检查账号权限或页面变化。",
  EXTENSION_DOWNLOAD_TIMEOUT: "官方报表下载超时，请稍后重新触发。"
});

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latest(items = []) {
  return [...items].sort((left, right) => timestamp(right.updatedAt || right.completedAt || right.startedAt || right.lastSeenAt)
    - timestamp(left.updatedAt || left.completedAt || left.startedAt || left.lastSeenAt))[0] || null;
}

function runnerOnline(runner, now) {
  if (!runner || runner.status === "disabled") return false;
  const seenAt = timestamp(runner.lastSeenAt);
  return Boolean(seenAt) && Math.max(0, now.valueOf() - seenAt) <= 5 * 60 * 1000;
}

function recovery(input) {
  return {
    tone: "warning",
    canImportFile: true,
    primaryAction: { type: "refresh", label: "刷新状态" },
    showConnectorLink: true,
    showKuaimaiLogin: false,
    runner: null,
    job: null,
    ...input
  };
}

export function buildKuaimaiSalesRecovery({
  date = "",
  anomalyStatus = "",
  runners = [],
  jobs = [],
  loading = false,
  error = "",
  now = new Date()
} = {}) {
  if (loading) {
    return recovery({
      tone: "neutral",
      label: "正在读取采集状态",
      title: "正在检查公司 Mac 与 Chrome 插件",
      instruction: "状态读取完成后会显示对应处理动作。"
    });
  }
  if (error) {
    return recovery({
      tone: "danger",
      label: "采集状态读取失败",
      title: "暂时无法读取 Chrome 采集状态",
      instruction: "可以先检查数据接入，或直接导入快麦官方销售报表。"
    });
  }

  const matchingJobs = (jobs || []).filter(job => (
    job?.providerId === "kuaimai"
    && job?.businessDate === date
    && ["order_items", "sales_items", "orders"].includes(job?.resourceType)
  ));
  const preferredJobs = matchingJobs.filter(job => ["order_items", "sales_items"].includes(job.resourceType));
  const job = latest(preferredJobs.length ? preferredJobs : matchingJobs);
  const runner = (runners || []).find(item => item.id === job?.runnerId) || latest(runners);
  const online = runnerOnline(runner, now);
  const runnerName = runner?.name || "公司 Mac";
  const status = String(job?.status || "");
  const errorCode = String(job?.errorCode || "");

  if (status === "success") {
    if (anomalyStatus === "anomaly") {
      return recovery({
        tone: "danger",
        label: "入库校验未通过",
        title: `${date} 快麦文件已采集，但销售事实尚未生成`,
        instruction: "原始文件已保留，但本批未通过完整性校验，不能算同步成功。请重新采集并入库；若仍失败，再导入快麦官方销售报表。",
        primaryAction: { type: "retrigger", label: "重新采集并入库" },
        showConnectorLink: false,
        runner,
        job
      });
    }
    return recovery({
      tone: "success",
      label: "Chrome 采集完成",
      title: `${date} 快麦订单明细已完成采集`,
      instruction: "请刷新数据状态；如销售事实仍不完整，请导入包含退款与成本的官方销售报表。",
      primaryAction: { type: "refresh", label: "刷新数据状态" },
      showConnectorLink: false,
      runner,
      job
    });
  }
  if (status === "waiting_human") {
    const needsLogin = /LOGIN/i.test(errorCode);
    return recovery({
      tone: "danger",
      label: needsLogin ? "需要登录" : "需要人工验证",
      title: needsLogin ? "快麦登录状态已失效" : "快麦页面正在等待人工验证",
      instruction: needsLogin
        ? `请在${runnerName}的 Chrome 中打开快麦并完成登录，然后点击“我已登录，重新触发”。`
        : `请在${runnerName}的 Chrome 中完成验证码、滑块或设备确认，然后点击“我已登录，重新触发”。`,
      primaryAction: { type: "retrigger", label: "我已登录，重新触发" },
      showKuaimaiLogin: needsLogin,
      runner,
      job
    });
  }
  if (status === "schema_changed") {
    return recovery({
      tone: "danger",
      label: "页面结构变化",
      title: "Chrome 插件暂时无法识别快麦页面",
      instruction: "请保留当前页面并反馈页面变化；如需立即补数，请导入官方销售报表。",
      runner,
      job
    });
  }
  if (status === "failed") {
    return recovery({
      tone: "danger",
      label: "Chrome 采集失败",
      title: `${date} 快麦采集未完成`,
      instruction: online
        ? "请检查快麦页面、下载状态和插件提示；也可以直接导入官方销售报表。"
        : `请启动${runnerName}上的 Chrome 和数据采集插件。`,
      primaryAction: online
        ? { type: "retrigger", label: "重新触发采集" }
        : { type: "refresh", label: "重新检测采集器" },
      showConnectorLink: online,
      runner,
      job
    });
  }
  if (RUNNING_STATES.has(status) && !online) {
    return recovery({
      tone: "danger",
      label: "采集器离线",
      title: `${date} 任务已排队，但公司 Mac 采集器未在线`,
      instruction: `${runnerName}的后台采集服务没有持续上报心跳。服务恢复后会自动领取任务；此时打开快麦页面不能代替恢复采集服务。`,
      primaryAction: { type: "refresh", label: "重新检测采集器" },
      showConnectorLink: false,
      runner,
      job
    });
  }
  if (RUNNING_STATES.has(status)) {
    return recovery({
      tone: "warning",
      label: "Chrome 采集中",
      title: `${date} 快麦订单明细正在采集`,
      instruction: `${runnerName} 正在执行 ${job.stage || status} 阶段，请等待完成后刷新状态。`,
      primaryAction: { type: "refresh", label: "刷新采集进度" },
      showConnectorLink: false,
      runner,
      job
    });
  }
  if (!online) {
    return recovery({
      tone: "danger",
      label: "采集器离线",
      title: "公司 Mac 的 Chrome 采集器未在线",
      instruction: `${runnerName}的后台采集服务没有持续上报心跳。服务恢复后会自动领取任务；此时打开快麦页面不能代替恢复采集服务。`,
      primaryAction: { type: "refresh", label: "重新检测采集器" },
      showConnectorLink: false,
      runner,
      job
    });
  }
  return recovery({
    tone: "warning",
    label: "等待 Chrome 采集",
    title: `${date} 尚无快麦订单明细任务`,
    instruction: `${runnerName}在线，可等待下一轮采集；如需立即补数，请导入官方销售报表。`,
    primaryAction: { type: "retrigger", label: "立即触发采集" },
    showConnectorLink: false,
    runner,
    job
  });
}

export function buildDouyinCollectionRecovery({
  storeId = "",
  runners = [],
  jobs = [],
  cursors = [],
  now = new Date()
} = {}) {
  const matchingJobs = jobs.filter(job => (
    job?.providerId === "douyin-ecommerce"
    && (!storeId || job.storeId === storeId)
  ));
  const matchingCursors = cursors.filter(cursor => (
    cursor?.providerId === "douyin-ecommerce"
    && (!storeId || cursor.storeId === storeId)
  ));
  const fallbackRunner = latest(runners);

  return {
    providerId: "douyin-ecommerce",
    storeId,
    resources: DOUYIN_COLLECTION_RESOURCES.map(resource => {
      const job = latest(matchingJobs.filter(item => item.resourceType === resource.type));
      const cursor = latest(matchingCursors.filter(item => item.resourceType === resource.type));
      const runner = runners.find(item => item.id === job?.runnerId) || fallbackRunner;
      const online = runnerOnline(runner, now);
      const errorCode = String(job?.errorCode || "");
      const jobStatus = String(job?.status || "");
      const status = jobStatus && jobStatus !== "success"
        ? jobStatus
        : cursor || jobStatus === "success"
          ? "success"
          : "unavailable";
      const instruction = DOUYIN_RECOVERY[errorCode]
        || (RUNNING_STATES.has(status)
          ? online
            ? "公司 Mac 正在采集，完成后刷新状态。"
            : "公司 Mac 采集器离线，恢复后台服务后会继续领取任务。"
          : status === "success"
            ? "最近可信批次已完成；可在执行记录查看日期、行数和结果。"
            : "尚未完成真实采集，不会显示为已接通。");
      return {
        type: resource.type,
        label: resource.label,
        status,
        businessDate: job?.businessDate || cursor?.businessDate || null,
        errorCode: errorCode || null,
        instruction,
        runner,
        job,
        cursor,
        canRetry: Boolean(job && ["waiting_human", "failed", "schema_changed", "success"].includes(jobStatus))
      };
    })
  };
}

// 待处理问题卡片同时反映持久化质量问题与实时销售异常，取两者较大值避免漏报。
export function countDataSyncIssues({ openIssues = 0, latestSalesAnomaly } = {}) {
  const persistedCount = Math.max(0, Number(openIssues) || 0);
  const liveAnomalyCount = latestSalesAnomaly?.status === "anomaly" ? 1 : 0;
  return Math.max(persistedCount, liveAnomalyCount);
}
