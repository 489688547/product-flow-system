import { archiveDouyinReport } from "./providers/douyin/archive.mjs";
import {
  SELF_SERVICE_REPORT_VERSION,
  readDouyinReport,
  readDouyinSelfServiceReport
} from "./providers/douyin/parser.mjs";

function probeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function numericCoverage(value, rowCount) {
  if (Number.isFinite(value)) return Math.max(0, Math.min(1, Number(value)));
  const source = Number(value?.sourceRowCount);
  const facts = Number(value?.factCount ?? rowCount);
  return Number.isFinite(source) && source > 0 && Number.isFinite(facts)
    ? Math.max(0, Math.min(1, facts / source))
    : null;
}

export async function runEgoProbe({
  task,
  executeTask,
  checkpointStore,
  archiveRoot,
  archiveReport = archiveDouyinReport,
  parseReport = null
} = {}) {
  if (typeof executeTask !== "function" || typeof checkpointStore?.save !== "function") {
    throw probeError("EGO_PROBE_DEPENDENCIES_REQUIRED", "Ego 本地探针依赖不完整。");
  }
  const result = await executeTask({ task, control: { explicitHumanRetry: false } });
  if (result?.kind !== "downloaded") return result;
  await checkpointStore.save(task.jobId, { stage: "downloaded", result });

  const archived = await archiveReport({
    filePath: result.filePath,
    ...(archiveRoot ? { rootDir: archiveRoot } : {}),
    storeId: task.storeId,
    resourceType: task.resourceType,
    businessDate: task.businessDate
  });
  const resume = {
    archive: {
      relativeArchiveKey: archived.relativeArchiveKey,
      fileHash: archived.sha256
    }
  };
  await checkpointStore.save(task.jobId, { stage: "archived", result, resume });

  const reader = parseReport || (
    result.reportVersion === SELF_SERVICE_REPORT_VERSION
      ? readDouyinSelfServiceReport
      : readDouyinReport
  );
  const parsed = await reader(result.filePath, {
    resourceType: task.resourceType,
    businessDate: task.businessDate,
    storeId: task.storeId
  });
  if (!Array.isArray(parsed?.facts) || parsed.facts.length < 1) {
    throw probeError("DOUYIN_REPORT_EMPTY", "Ego 本地探针解析结果为空。");
  }
  resume.parsed = {
    reportVersion: parsed.reportVersion,
    rowCount: parsed.facts.length,
    coverage: numericCoverage(parsed.coverage, parsed.facts.length),
    confidence: parsed.confidence
  };
  await checkpointStore.save(task.jobId, { stage: "parsed", result, resume });
  await checkpointStore.save(task.jobId, { stage: "pending_upload", result, resume });

  return {
    kind: "pending_upload",
    jobId: task.jobId,
    safeFileName: result.safeFileName,
    fileHash: archived.sha256,
    archiveId: archived.relativeArchiveKey,
    rowCount: parsed.facts.length
  };
}
