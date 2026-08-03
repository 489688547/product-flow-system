import { createDailyPlan } from "../../src/domain/webCollection.js";
import {
  WEB_COLLECTION_ADAPTERS,
  createKuaimaiProcessor,
  createProviderProcessorRegistry
} from "./providers/index.mjs";

function safeTask(job) {
  return {
    jobId: job.id,
    providerId: job.providerId,
    ...(job.storeId ? { storeId: job.storeId } : {}),
    resourceType: job.resourceType,
    businessDate: job.businessDate,
    status: job.status,
    attempt: job.attempt,
    scheduleVersion: job.scheduleVersion
  };
}

function safeErrorCode(value, fallback = "WEB_COLLECTION_LOCAL_PROCESSING_FAILED") {
  const code = String(value || fallback).toUpperCase();
  return /^[A-Z0-9_]{3,80}$/.test(code) ? code : fallback;
}

// dedicated 模式下改由专用浏览器执行的 provider。其余 provider 仍由扩展执行——
// 快麦就是靠这条继续跑的。
const DEDICATED_PROVIDERS = new Set(["douyin-ecommerce"]);

// 任务分发只在这一处发生，出问题时必须能从日志看出「谁领走了什么」。
// 不打日志的话，只能从失败记录反推，而失败记录不记录是哪个执行器跑的。
function logRouting(message) {
  process.stdout.write(`[routing] ${new Date().toISOString()} ${message}\n`);
}

export function createWebCollectorOrchestrator({
  api,
  processors,
  processDownload,
  notify = async () => {},
  now = () => new Date(),
  extensionOnlineWindowMs = 2 * 60 * 1000,
  executionMode = "extension",
  runtimeVersion = "0.2.0"
}) {
  if (!api) throw new Error("网页采集编排依赖不完整。");
  const processorRegistry = processors || (
    typeof processDownload === "function"
      ? createProviderProcessorRegistry([createKuaimaiProcessor(processDownload)])
      : null
  );
  if (!processorRegistry || typeof processorRegistry.require !== "function") {
    throw new Error("网页采集 processor 注册表未配置。");
  }
  let activeJob = null;
  let activeLeaseExpiresAt = 0;
  let lastExtensionSeenAt = 0;
  let processingResult = false;
  let dedicatedBrowserStatus = "dedicated_browser_offline";

  function currentTime() {
    const value = now();
    const parsed = value instanceof Date ? value.valueOf() : Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function rememberLease(job, fallbackSeconds = 300) {
    const parsed = Date.parse(String(job?.leaseExpiresAt || ""));
    activeLeaseExpiresAt = Number.isFinite(parsed) ? parsed : currentTime() + fallbackSeconds * 1000;
  }

  function clearActiveJob() {
    activeJob = null;
    activeLeaseExpiresAt = 0;
  }

  async function transition(from, status, details = {}) {
    const response = await api.transition({
      jobId: activeJob.id,
      from,
      status,
      stage: details.stage || status,
      ...(details.errorCode ? { errorCode: safeErrorCode(details.errorCode) } : {}),
      ...(details.errorSummary ? { errorSummary: String(details.errorSummary).slice(0, 160) } : {})
    });
    activeJob = { ...activeJob, ...(response?.job || {}), status };
    if (response?.job?.leaseExpiresAt) rememberLease(activeJob);
  }

  async function fail(from, result, fallbackCode) {
    const resultStatus = result.status || result.kind;
    const target = resultStatus === "schema_changed"
      ? "schema_changed"
      : resultStatus === "waiting_human" || resultStatus === "waiting_login"
        ? "waiting_human"
        : "failed";
    const errorCode = safeErrorCode(result.errorCode, fallbackCode);
    await transition(from, target, {
      stage: result.stage || from,
      errorCode,
      ...(result.errorSummary ? { errorSummary: result.errorSummary } : {})
    });
    await notify({
      kind: target,
      jobId: activeJob.id,
      providerId: activeJob.providerId,
      resourceType: activeJob.resourceType,
      businessDate: activeJob.businessDate,
      errorCode,
      stage: result.stage || from
    });
    clearActiveJob();
  }

  return Object.freeze({
    async prepare({ now: planNow = new Date() } = {}) {
      const jobs = createDailyPlan({ adapters: WEB_COLLECTION_ADAPTERS, now: planNow });
      const extensionOnline = lastExtensionSeenAt > 0
        && Math.max(0, currentTime() - lastExtensionSeenAt) <= extensionOnlineWindowMs;
      await api.heartbeat({
        version: runtimeVersion,
        chromeStatus: executionMode === "dedicated"
          ? dedicatedBrowserStatus
          : extensionOnline ? "extension_online" : "extension_offline",
        currentJobId: activeJob?.id || null
      });
      if (typeof api.ensureRegisteredPlan === "function") return api.ensureRegisteredPlan();
      if (!jobs.length) return { jobs: [] };
      return api.ensurePlan(jobs);
    },
    async nextTask({ storeId = "", executor = "extension" } = {}) {
      if (executor === "extension") lastExtensionSeenAt = currentTime();
      // dedicated 模式下只有抖音改由专用浏览器执行，快麦等仍旧由扩展执行。
      //
      // 原先的判据是「扩展请求带了 storeId 就一概不给」，但扩展只要存过抖音的 storeId，
      // 之后每次轮询都会带着它——于是快麦任务再也发不出去，而表现只是「快麦不采了」，
      // 看不出跟切换浏览器模式有关。判据应当是「这条任务归谁执行」，与请求里带什么无关。
      const 归专用浏览器 = job => executionMode === "dedicated"
        && DEDICATED_PROVIDERS.has(String(job?.providerId || ""));
      // 反方向同样要堵：专用浏览器执行器只认抖音任务，拿到别的平台会直接判 DOUYIN_TASK_INVALID。
      // 实测 08-02 的 kuaimai inventory 与 orders 就是这么被判失败的——领错了活，
      // 而且失败得像是快麦自己出了问题。
      const 不该给专用浏览器 = job => executionMode === "dedicated"
        && !DEDICATED_PROVIDERS.has(String(job?.providerId || ""));
      const profileStoreId = String(storeId || "");
      if (activeJob) {
        if (processingResult) return null;
        if (activeLeaseExpiresAt && currentTime() >= activeLeaseExpiresAt) clearActiveJob();
      }
      if (activeJob) {
        if (executor !== "dedicated" && 归专用浏览器(activeJob)) return null;
        if (executor === "dedicated" && 不该给专用浏览器(activeJob)) return null;
        if (activeJob.providerId === "douyin-ecommerce" && activeJob.storeId !== profileStoreId) return null;
        return safeTask(activeJob);
      }
      // 扩展在 dedicated 模式下不按 storeId 过滤：带上抖音的 storeId 会把快麦任务一并挡在外面。
      const 过滤 = profileStoreId && (executor === "dedicated" || executionMode !== "dedicated")
        ? { storeId: profileStoreId }
        : {};
      const claimed = await api.claim(300, 过滤);
      if (!claimed?.job) return null;
      activeJob = claimed.job;
      rememberLease(activeJob, 300);
      await transition("claimed", "opening");
      // 抖音的任务留给专用浏览器下一轮来取，不交给扩展；
      // 别的平台的任务留给扩展下一轮来取，不交给专用浏览器。
      //
      // 这里打日志是因为出过一次说不清的事：代码与执行器都验证过会扣下抖音任务，
      // 但生产上抖音任务仍被扩展执行了。静态分析解释不了，只能让下一次运行自己说话——
      // 日志里没有「扣下」而抖音又被扩展跑了，就说明跑的根本不是这份代码。
      if (executor !== "dedicated" && 归专用浏览器(activeJob)) {
        logRouting(`扣下 ${activeJob.providerId}/${activeJob.resourceType} ${activeJob.businessDate}：归专用浏览器，不交给扩展`);
        return null;
      }
      if (executor === "dedicated" && 不该给专用浏览器(activeJob)) {
        logRouting(`扣下 ${activeJob.providerId}/${activeJob.resourceType} ${activeJob.businessDate}：不归专用浏览器，留给扩展`);
        return null;
      }
      logRouting(`派发 ${activeJob.providerId}/${activeJob.resourceType} ${activeJob.businessDate} → ${executor}`);
      return safeTask(activeJob);
    },
    recordBrowserStatus(status = {}) {
      dedicatedBrowserStatus = status.online === true
        ? "dedicated_browser_online"
        : "dedicated_browser_offline";
      return dedicatedBrowserStatus;
    },
    async registerStore(input) {
      const result = await api.registerStore(input);
      await api.ensureRegisteredPlan();
      return result;
    },
    async submitResult(result, {
      resume = {},
      onCheckpoint = async () => {}
    } = {}) {
      if (!activeJob || result?.jobId !== activeJob.id) {
        const error = new Error("插件结果与当前任务不匹配。");
        error.code = "WEB_COLLECTION_RESULT_JOB_MISMATCH";
        throw error;
      }
      if (processingResult) {
        const error = new Error("当前任务结果正在处理。");
        error.code = "WEB_COLLECTION_RESULT_ALREADY_PROCESSING";
        throw error;
      }
      processingResult = true;
      try {
        const resultKind = result.kind || result.status;
        const resultStatus = result.status || resultKind;
        if (["waiting_login", "waiting_human", "schema_changed", "failed"].includes(resultStatus)) {
          await fail("opening", result, "WEB_COLLECTION_EXTENSION_FAILED");
          return { terminal: true };
        }
        if (!["downloaded", "captured"].includes(resultKind)) {
          await fail("opening", { ...result, status: "failed" }, "WEB_COLLECTION_RESULT_STATUS_INVALID");
          return { terminal: true };
        }
        let current = "opening";
        if (resultKind === "downloaded") {
          await transition(current, "exporting"); current = "exporting";
          await transition(current, "downloading"); current = "downloading";
        } else {
          await transition(current, "collecting", { stage: "collecting" }); current = "collecting";
        }
        await transition(current, "validating"); current = "validating";
        const processor = processorRegistry.require(activeJob.providerId);
        const processed = await processor.process({
          job: activeJob,
          result,
          resume,
          onStage: onCheckpoint,
          onValidated: async () => {
            if (current === "validating") {
              await transition(current, "ingesting");
              current = "ingesting";
            }
          }
        });
        if (current === "validating") {
          await transition(current, "ingesting");
          current = "ingesting";
        }
        const completed = await api.complete({
          jobId: activeJob.id,
          run: {
            batchId: processed.batchId || null,
            archiveId: processed.archiveId || processed.relativeArchiveKey || null,
            rowCount: Number.isFinite(Number(processed.rowCount)) ? Number(processed.rowCount) : null,
            fileHash: processed.fileHash || null
          }
        });
        clearActiveJob();
        return completed;
      } catch (error) {
        if (activeJob) {
          const current = activeJob.status || "opening";
          await fail(current, {
            status: "failed",
            stage: current,
            errorCode: safeErrorCode(error?.code),
            errorSummary: "本机文件处理或入库失败。"
          }, "WEB_COLLECTION_LOCAL_PROCESSING_FAILED");
        }
        throw error;
      } finally {
        processingResult = false;
      }
    },
    currentJob() {
      return activeJob ? safeTask(activeJob) : null;
    }
  });
}
