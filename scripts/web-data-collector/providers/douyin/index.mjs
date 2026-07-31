import { createHash } from "node:crypto";

import { normalizeCommerceFact } from "../../../../src/domain/commerceFacts.js";
import { archiveDouyinReport, DEFAULT_DOUYIN_ARCHIVE_ROOT } from "./archive.mjs";
import {
  readDouyinReport,
  readDouyinSelfServiceReport,
  SELF_SERVICE_REPORT_VERSION
} from "./parser.mjs";

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
    async process({
      job,
      result,
      onValidated,
      onStage = async () => {},
      resume = {}
    } = {}) {
      if (job?.providerId !== "douyin-ecommerce") {
        throw processorError("DOUYIN_JOB_MISMATCH", "抖店 processor 收到其他平台任务。");
      }
      if (resume?.processed) return structuredClone(resume.processed);
      let state = {
        ...(resume?.archive ? { archive: structuredClone(resume.archive) } : {}),
        ...(resume?.parsed ? { parsed: structuredClone(resume.parsed) } : {}),
        ...(Number.isInteger(resume?.nextChunkIndex)
          ? { nextChunkIndex: resume.nextChunkIndex }
          : {})
      };
      const checkpoint = async (stage, next = {}) => {
        state = { ...state, ...next };
        await onStage(stage, structuredClone(state));
      };
      if (result?.kind === "captured") {
        if (
          !["store_daily", "product_daily"].includes(job.resourceType)
          || result.resourceType !== job.resourceType
        ) {
          throw processorError("DOUYIN_CAPTURE_RESOURCE_INVALID", "页面读数资源与抖店任务不匹配。");
        }
        const sourceVersion = job.resourceType === "store_daily"
          ? `douyin-store-capture-${result.selectorVersion}`
          : `douyin-product-api-${result.selectorVersion}`;
        const capturedFacts = job.resourceType === "store_daily"
          ? [result.facts]
          : result.facts;
        if (!Array.isArray(capturedFacts) || capturedFacts.length === 0) {
          throw processorError("DOUYIN_CAPTURE_EMPTY", "抖店页面读数为空，未写入事实。");
        }
        const facts = capturedFacts.map(captured => normalizeCommerceFact(job.resourceType, {
          providerId: job.providerId,
          storeId: job.storeId,
          businessDate: job.businessDate,
          sourceVersion,
          ...captured
        }));
        const contentHash = createHash("sha256")
          .update(JSON.stringify(facts))
          .digest("hex");
        const batchId = `douyin-${job.resourceType}-${contentHash.slice(0, 24)}`;
        const values = capturedFacts.flatMap(fact => Object.values(fact));
        const populated = values.filter(value => value !== null).length;
        const coverage = populated / values.length;
        await onValidated?.({ coverage, confidence: "medium" });
        await checkpoint("validated");
        const chunks = [];
        for (let offset = 0; offset < facts.length; offset += 200) {
          chunks.push(facts.slice(offset, offset + 200));
        }
        const nextChunkIndex = Number.isInteger(state.nextChunkIndex) ? state.nextChunkIndex : 0;
        if (nextChunkIndex < 0 || nextChunkIndex > chunks.length) {
          throw processorError("DOUYIN_CHECKPOINT_INVALID", "抖店本机恢复分块位置无效。");
        }
        for (let chunkIndex = nextChunkIndex; chunkIndex < chunks.length; chunkIndex += 1) {
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
            chunkIndex,
            complete: false,
            expectedCount: null,
            coverage: null,
            confidence: null,
            facts: chunks[chunkIndex]
          });
          await checkpoint("uploading", { nextChunkIndex: chunkIndex + 1 });
        }
        await checkpoint("uploading", { nextChunkIndex: chunks.length });
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
          chunkIndex: chunks.length,
          complete: true,
          expectedCount: facts.length,
          coverage,
          confidence: "medium",
          facts: []
        });
        const processed = {
          batchId,
          rowCount: facts.length,
          coverage,
          confidence: "medium",
          fileHash: contentHash,
          sourceVersion,
          completedCount: completed?.completedCount ?? facts.length
        };
        await checkpoint("submitted", { processed });
        return processed;
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
      const archived = state.archive
        ? {
          sha256: state.archive.fileHash,
          relativeArchiveKey: state.archive.relativeArchiveKey
        }
        : await archiveDouyinReport({
          filePath,
          rootDir: archiveRoot,
          storeId: job.storeId,
          resourceType: job.resourceType,
          businessDate: job.businessDate
        });
      if (!state.archive) {
        await checkpoint("archived", {
          archive: {
            relativeArchiveKey: archived.relativeArchiveKey,
            fileHash: archived.sha256
          }
        });
      }
      // 自助取数的文件结构与逐页导出完全不同（「统计日期」是区间、直播没有成交金额列），
      // 必须走各自的解析口径，不能让它去撞逐页导出那套别名匹配。
      const readReport = result.reportVersion === SELF_SERVICE_REPORT_VERSION
        ? readDouyinSelfServiceReport
        : readDouyinReport;
      const parsed = await readReport(filePath, {
        resourceType: job.resourceType,
        businessDate: job.businessDate,
        storeId: job.storeId
      });
      if (result.reportVersion && result.reportVersion !== parsed.reportVersion) {
        throw processorError("DOUYIN_REPORT_SCHEMA_CHANGED", "插件识别的抖店报表版本与本机解析器不一致。");
      }
      await checkpoint("parsed", {
        parsed: {
          reportVersion: parsed.reportVersion,
          rowCount: parsed.facts.length,
          coverage: parsed.coverage,
          confidence: parsed.confidence
        }
      });
      await onValidated?.({ coverage: parsed.coverage, confidence: parsed.confidence });
      await checkpoint("validated");
      const batchId = `douyin-${job.resourceType}-${archived.sha256.slice(0, 24)}`;
      const chunkCount = Math.ceil(parsed.facts.length / 500);
      const nextChunkIndex = Number.isInteger(state.nextChunkIndex) ? state.nextChunkIndex : 0;
      if (nextChunkIndex < 0 || nextChunkIndex > chunkCount) {
        throw processorError("DOUYIN_CHECKPOINT_INVALID", "抖店本机恢复分块位置无效。");
      }
      for (let index = nextChunkIndex * 500; index < parsed.facts.length; index += 500) {
        const chunkIndex = index / 500;
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
          chunkIndex,
          complete: false,
          expectedCount: null,
          coverage: null,
          confidence: null,
          facts: parsed.facts.slice(index, index + 500)
        });
        await checkpoint("uploading", { nextChunkIndex: chunkIndex + 1 });
      }
      await checkpoint("uploading", { nextChunkIndex: chunkCount });
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
        chunkIndex: chunkCount,
        complete: true,
        expectedCount: parsed.facts.length,
        coverage: parsed.coverage,
        confidence: parsed.confidence,
        facts: []
      });
      const processed = {
        batchId,
        rowCount: parsed.facts.length,
        coverage: parsed.coverage,
        confidence: parsed.confidence,
        relativeArchiveKey: archived.relativeArchiveKey,
        fileHash: archived.sha256,
        sourceVersion: parsed.reportVersion,
        completedCount: completed?.completedCount ?? parsed.facts.length
      };
      await checkpoint("submitted", { processed });
      return processed;
    }
  });
}
