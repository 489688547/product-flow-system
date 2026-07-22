import { createDailyPlan } from "../../src/domain/webCollection.js";
import { WEB_COLLECTION_ADAPTERS } from "./providers/index.mjs";

function safeTask(job) {
  return {
    jobId: job.id,
    providerId: job.providerId,
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

export function createWebCollectorOrchestrator({ api, processDownload, notify = async () => {} }) {
  if (!api || typeof processDownload !== "function") throw new Error("网页采集编排依赖不完整。");
  let activeJob = null;
  let processingResult = false;

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
  }

  async function fail(from, result, fallbackCode) {
    const target = result.status === "schema_changed" ? "schema_changed" : result.status === "waiting_human" || result.status === "waiting_login" ? "waiting_human" : "failed";
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
    activeJob = null;
  }

  return Object.freeze({
    async prepare({ now = new Date() } = {}) {
      const jobs = createDailyPlan({ adapters: WEB_COLLECTION_ADAPTERS, now });
      await api.heartbeat({ version: "0.1.0", chromeStatus: "extension_expected", currentJobId: activeJob?.id || null });
      if (!jobs.length) return { jobs: [] };
      return api.ensurePlan(jobs);
    },
    async nextTask() {
      if (activeJob) return processingResult ? null : safeTask(activeJob);
      const claimed = await api.claim(300);
      if (!claimed?.job) return null;
      activeJob = claimed.job;
      await transition("claimed", "opening");
      return safeTask(activeJob);
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
        if (["waiting_login", "waiting_human", "schema_changed", "failed"].includes(result.status)) {
          await fail("opening", result, "WEB_COLLECTION_EXTENSION_FAILED");
          return { terminal: true };
        }
        if (result.status !== "downloaded") {
          await fail("opening", { ...result, status: "failed" }, "WEB_COLLECTION_RESULT_STATUS_INVALID");
          return { terminal: true };
        }
        let current = "opening";
        await transition(current, "exporting"); current = "exporting";
        await transition(current, "downloading"); current = "downloading";
        await transition(current, "validating"); current = "validating";
        const processed = await processDownload({
          fileName: result.fileName,
          resourceType: activeJob.resourceType,
          businessDate: activeJob.businessDate,
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
            archiveId: processed.archiveId || null,
            rowCount: Number.isFinite(Number(processed.rowCount)) ? Number(processed.rowCount) : null,
            fileHash: processed.fileHash || null
          }
        });
        activeJob = null;
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
