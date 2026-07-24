import { createHash } from "node:crypto";

import { normalizeCommerceFact } from "../../../../src/domain/commerceFacts.js";
import { archiveDouyinReport, DEFAULT_DOUYIN_ARCHIVE_ROOT } from "./archive.mjs";
import { readDouyinReport } from "./parser.mjs";

export { DEFAULT_DOUYIN_ARCHIVE_ROOT };

export const DOUYIN_COLLECTION_RESOURCES = Object.freeze([
  Object.freeze({ type: "store_daily", rangeKind: "daily_fact", scheduleVersion: "v1" }),
  Object.freeze({ type: "product_daily", rangeKind: "daily_fact", scheduleVersion: "v1" }),
  Object.freeze({ type: "live_daily", rangeKind: "daily_fact", scheduleVersion: "v1" }),
  Object.freeze({ type: "video_daily", rangeKind: "daily_fact", scheduleVersion: "v1" })
]);

function processorError(code, message) {
  const error = new Error(message);
  error.name = "DouyinProcessorError";
  error.code = code;
  error.retryable = false;
  return error;
}

export function createDouyinProcessor({
  archiveRoot = DEFAULT_DOUYIN_ARCHIVE_ROOT,
  uploadFactChunk,
  resolveDownloadFile
} = {}) {
  if (typeof uploadFactChunk !== "function") {
    throw processorError("DOUYIN_FACT_UPLOADER_REQUIRED", "抖店经营事实上传器未配置。");
  }
  return Object.freeze({
    id: "douyin-ecommerce",
    async process({ job, result, onValidated } = {}) {
      if (job?.providerId !== "douyin-ecommerce") {
        throw processorError("DOUYIN_JOB_MISMATCH", "抖店 processor 收到其他平台任务。");
      }
      if (result?.kind === "captured") {
        if (job.resourceType !== "store_daily" || result.resourceType !== "store_daily") {
          throw processorError("DOUYIN_CAPTURE_RESOURCE_INVALID", "仅店铺总览允许安全页面读数。");
        }
        const sourceVersion = `douyin-store-capture-${result.selectorVersion}`;
        const fact = normalizeCommerceFact("store_daily", {
          providerId: job.providerId,
          storeId: job.storeId,
          businessDate: job.businessDate,
          sourceVersion,
          ...result.facts
        });
        const contentHash = createHash("sha256")
          .update(JSON.stringify(fact))
          .digest("hex");
        const batchId = `douyin-store_daily-${contentHash.slice(0, 24)}`;
        const populated = Object.values(result.facts).filter(value => value !== null).length;
        const coverage = populated / Object.keys(result.facts).length;
        await onValidated?.({ coverage, confidence: "medium" });
        await uploadFactChunk({
          jobId: job.id,
          batchId,
          providerId: job.providerId,
          storeId: job.storeId,
          resourceType: job.resourceType,
          businessDate: job.businessDate,
          schemaVersion: sourceVersion,
          sourceVersion,
          contentHash,
          chunkIndex: 0,
          complete: false,
          expectedCount: null,
          coverage: null,
          confidence: null,
          facts: [fact]
        });
        const completed = await uploadFactChunk({
          jobId: job.id,
          batchId,
          providerId: job.providerId,
          storeId: job.storeId,
          resourceType: job.resourceType,
          businessDate: job.businessDate,
          schemaVersion: sourceVersion,
          sourceVersion,
          contentHash,
          chunkIndex: 1,
          complete: true,
          expectedCount: 1,
          coverage,
          confidence: "medium",
          facts: []
        });
        return {
          batchId,
          rowCount: 1,
          coverage,
          confidence: "medium",
          fileHash: contentHash,
          sourceVersion,
          completedCount: completed?.completedCount ?? 1
        };
      }
      if (result?.kind !== "downloaded") {
        throw processorError("DOUYIN_DOWNLOAD_RESULT_REQUIRED", "抖店官方报表任务缺少本机下载文件。");
      }
      const filePath = result.filePath || (
        typeof resolveDownloadFile === "function"
          ? await resolveDownloadFile(result.safeFileName)
          : null
      );
      if (!filePath) throw processorError("DOUYIN_DOWNLOAD_RESULT_REQUIRED", "抖店官方报表任务缺少本机下载文件。");
      const archived = await archiveDouyinReport({
        filePath,
        rootDir: archiveRoot,
        storeId: job.storeId,
        resourceType: job.resourceType,
        businessDate: job.businessDate
      });
      const parsed = await readDouyinReport(filePath, {
        resourceType: job.resourceType,
        businessDate: job.businessDate,
        storeId: job.storeId
      });
      if (result.reportVersion && result.reportVersion !== parsed.reportVersion) {
        throw processorError("DOUYIN_REPORT_SCHEMA_CHANGED", "插件识别的抖店报表版本与本机解析器不一致。");
      }
      await onValidated?.({ coverage: parsed.coverage, confidence: parsed.confidence });
      const batchId = `douyin-${job.resourceType}-${archived.sha256.slice(0, 24)}`;
      for (let index = 0; index < parsed.facts.length; index += 500) {
        await uploadFactChunk({
          jobId: job.id,
          batchId,
          providerId: job.providerId,
          storeId: job.storeId,
          resourceType: job.resourceType,
          businessDate: job.businessDate,
          schemaVersion: parsed.reportVersion,
          sourceVersion: parsed.reportVersion,
          contentHash: archived.sha256,
          chunkIndex: index / 500,
          complete: false,
          expectedCount: null,
          coverage: null,
          confidence: null,
          facts: parsed.facts.slice(index, index + 500)
        });
      }
      const completed = await uploadFactChunk({
        jobId: job.id,
        batchId,
        providerId: job.providerId,
        storeId: job.storeId,
        resourceType: job.resourceType,
        businessDate: job.businessDate,
        schemaVersion: parsed.reportVersion,
        sourceVersion: parsed.reportVersion,
        contentHash: archived.sha256,
        chunkIndex: Math.ceil(parsed.facts.length / 500),
        complete: true,
        expectedCount: parsed.facts.length,
        coverage: parsed.coverage,
        confidence: parsed.confidence,
        facts: []
      });
      return {
        batchId,
        rowCount: parsed.facts.length,
        coverage: parsed.coverage,
        confidence: parsed.confidence,
        relativeArchiveKey: archived.relativeArchiveKey,
        fileHash: archived.sha256,
        sourceVersion: parsed.reportVersion,
        completedCount: completed?.completedCount ?? parsed.facts.length
      };
    }
  });
}
