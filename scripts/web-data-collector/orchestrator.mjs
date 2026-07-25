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
    await transition(from, target, { stage: result.stage || from, errorCode });
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
      if (executionMode === "dedicated" && executor !== "dedicated" && storeId) return null;
      if (executor === "extension") lastExtensionSeenAt = currentTime();
      const profileStoreId = String(storeId || "");
      if (activeJob) {
        if (processingResult) return null;
        if (activeLeaseExpiresAt && currentTime() >= activeLeaseExpiresAt) clearActiveJob();
      }
      if (activeJob) {
        if (activeJob.providerId === "douyin-ecommerce" && activeJob.storeId !== profileStoreId) return null;
        return safeTask(activeJob);
      }
      const claimed = await api.claim(300, profileStoreId ? { storeId: profileStoreId } : {});
      if (!claimed?.job) return null;
      activeJob = claimed.job;
      rememberLease(activeJob, 300);
      await transition("claimed", "opening");
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
    async submitResult(result) {
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
