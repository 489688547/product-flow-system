import { archiveDouyinReport, DEFAULT_DOUYIN_ARCHIVE_ROOT } from "./archive.mjs";
import { readDouyinReport } from "./parser.mjs";

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
  uploadFactChunk
} = {}) {
  if (typeof uploadFactChunk !== "function") {
    throw processorError("DOUYIN_FACT_UPLOADER_REQUIRED", "抖店经营事实上传器未配置。");
  }
  return Object.freeze({
    id: "douyin-ecommerce",
    async process({ job, result } = {}) {
      if (job?.providerId !== "douyin-ecommerce") {
        throw processorError("DOUYIN_JOB_MISMATCH", "抖店 processor 收到其他平台任务。");
      }
      if (result?.kind !== "downloaded" || !result.filePath) {
        throw processorError("DOUYIN_DOWNLOAD_RESULT_REQUIRED", "抖店官方报表任务缺少本机下载文件。");
      }
      const archived = await archiveDouyinReport({
        filePath: result.filePath,
        rootDir: archiveRoot,
        storeId: job.storeId,
        resourceType: job.resourceType,
        businessDate: job.businessDate
      });
      const parsed = await readDouyinReport(result.filePath, {
        resourceType: job.resourceType,
        businessDate: job.businessDate,
        storeId: job.storeId
      });
      if (result.reportVersion && result.reportVersion !== parsed.reportVersion) {
        throw processorError("DOUYIN_REPORT_SCHEMA_CHANGED", "插件识别的抖店报表版本与本机解析器不一致。");
      }
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
