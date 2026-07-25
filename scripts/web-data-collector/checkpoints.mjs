import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHECKPOINT_STAGES = new Set([
  "opening",
  "waiting_download",
  "downloaded",
  "archived",
  "parsed",
  "validated",
  "uploading",
  "submitted"
]);
const RESULT_FIELDS = new Set([
  "kind",
  "jobId",
  "filePath",
  "safeFileName",
  "pageType",
  "reportVersion",
  "resourceType",
  "facts",
  "selectorVersion",
  "errorCode",
  "safeSummary",
  "stage"
]);
const SENSITIVE_FIELD = /cookie|token|password|credential|authorization|html|pageText/i;
const RESUME_FIELDS = new Set(["archive", "parsed", "nextChunkIndex", "processed"]);
const ARCHIVE_FIELDS = new Set(["relativeArchiveKey", "fileHash"]);
const PARSED_FIELDS = new Set(["reportVersion", "rowCount", "coverage", "confidence"]);
const PROCESSED_FIELDS = new Set([
  "batchId",
  "rowCount",
  "coverage",
  "confidence",
  "relativeArchiveKey",
  "archiveId",
  "fileHash",
  "sourceVersion",
  "completedCount"
]);

function assertJobId(value) {
  const jobId = String(value || "");
  if (!/^[-_a-zA-Z0-9]{1,128}$/.test(jobId)) throw new Error("本机检查点任务标识无效。");
  return jobId;
}

function validateResult(result, jobId) {
  if (result === undefined) return undefined;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("本机检查点结果字段无效。");
  }
  const keys = Object.keys(result);
  if (keys.some(key => SENSITIVE_FIELD.test(key) || !RESULT_FIELDS.has(key))) {
    throw new Error("本机检查点包含敏感或未登记字段。");
  }
  if (result.jobId && result.jobId !== jobId) throw new Error("本机检查点任务结果不匹配。");
  return structuredClone(result);
}

function assertObjectFields(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`本机检查点${label}无效。`);
  }
  if (Object.keys(value).some(key => SENSITIVE_FIELD.test(key) || !fields.has(key))) {
    throw new Error(`本机检查点${label}包含敏感或未登记字段。`);
  }
}

function validateRelativeArchiveKey(value) {
  const key = String(value || "");
  if (
    !key
    || key.length > 600
    || key.startsWith("/")
    || key.includes("\\")
    || key.split("/").some(part => !part || part === "." || part === "..")
  ) {
    throw new Error("本机检查点恢复归档路径无效。");
  }
  return key;
}

function validateHash(value) {
  const hash = String(value || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("本机检查点恢复文件哈希无效。");
  return hash;
}

function validateCount(value, label) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > 10_000_000) {
    throw new Error(`本机检查点恢复${label}无效。`);
  }
  return count;
}

function validateCoverage(value) {
  if (value === null || value === undefined) return null;
  const coverage = Number(value);
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
    throw new Error("本机检查点恢复覆盖率无效。");
  }
  return coverage;
}

function validateConfidence(value) {
  if (value === null || value === undefined) return null;
  const confidence = String(value || "");
  if (!["low", "medium", "high"].includes(confidence)) {
    throw new Error("本机检查点恢复可信等级无效。");
  }
  return confidence;
}

function validateResume(resume) {
  if (resume === undefined) return undefined;
  assertObjectFields(resume, RESUME_FIELDS, "恢复信息");
  const normalized = {};
  if (resume.archive !== undefined) {
    assertObjectFields(resume.archive, ARCHIVE_FIELDS, "恢复归档信息");
    normalized.archive = {
      relativeArchiveKey: validateRelativeArchiveKey(resume.archive.relativeArchiveKey),
      fileHash: validateHash(resume.archive.fileHash)
    };
  }
  if (resume.parsed !== undefined) {
    assertObjectFields(resume.parsed, PARSED_FIELDS, "恢复解析信息");
    const reportVersion = String(resume.parsed.reportVersion || "");
    if (!/^[-_.a-zA-Z0-9]{1,120}$/.test(reportVersion)) {
      throw new Error("本机检查点恢复报表版本无效。");
    }
    normalized.parsed = {
      reportVersion,
      rowCount: validateCount(resume.parsed.rowCount, "解析行数"),
      coverage: validateCoverage(resume.parsed.coverage),
      confidence: validateConfidence(resume.parsed.confidence)
    };
  }
  if (resume.nextChunkIndex !== undefined) {
    normalized.nextChunkIndex = validateCount(resume.nextChunkIndex, "分块位置");
  }
  if (resume.processed !== undefined && resume.processed !== null) {
    assertObjectFields(resume.processed, PROCESSED_FIELDS, "恢复完成信息");
    const processed = {};
    for (const [key, value] of Object.entries(resume.processed)) {
      if (key === "relativeArchiveKey") processed[key] = validateRelativeArchiveKey(value);
      else if (key === "fileHash") processed[key] = validateHash(value);
      else if (["rowCount", "completedCount"].includes(key)) processed[key] = validateCount(value, key);
      else if (key === "coverage") processed[key] = validateCoverage(value);
      else if (key === "confidence") processed[key] = validateConfidence(value);
      else if (!/^[-_.:/a-zA-Z0-9]{1,240}$/.test(String(value || ""))) {
        throw new Error(`本机检查点恢复完成字段 ${key} 无效。`);
      } else processed[key] = String(value);
    }
    normalized.processed = processed;
  } else if (resume.processed === null) {
    normalized.processed = null;
  }
  return normalized;
}

export function createCheckpointStore({
  rootDir,
  now = () => new Date(),
  fileSystem = {}
}) {
  const fs = {
    mkdir: fileSystem.mkdir || mkdir,
    readFile: fileSystem.readFile || readFile,
    rename: fileSystem.rename || rename,
    unlink: fileSystem.unlink || unlink,
    writeFile: fileSystem.writeFile || writeFile
  };

  return Object.freeze({
    async save(inputJobId, checkpoint = {}) {
      const jobId = assertJobId(inputJobId);
      const stage = String(checkpoint.stage || "");
      if (!CHECKPOINT_STAGES.has(stage)) throw new Error("本机检查点阶段无效。");
      const saved = {
        version: 1,
        checkpointId: jobId,
        stage,
        updatedAt: now().toISOString(),
        ...(checkpoint.result !== undefined
          ? { result: validateResult(checkpoint.result, jobId) }
          : {}),
        ...(checkpoint.resume !== undefined
          ? { resume: validateResume(checkpoint.resume) }
          : {})
      };
      await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
      const destination = join(rootDir, `${jobId}.json`);
      const temporary = `${destination}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(saved)}\n`, { mode: 0o600 });
      await fs.rename(temporary, destination);
      return {
        checkpointId: jobId,
        stage,
        updatedAt: saved.updatedAt
      };
    },
    async load(inputJobId) {
      const jobId = assertJobId(inputJobId);
      try {
        const parsed = JSON.parse(await fs.readFile(join(rootDir, `${jobId}.json`), "utf8"));
        if (parsed.checkpointId !== jobId || !CHECKPOINT_STAGES.has(parsed.stage)) {
          throw new Error("本机检查点内容无效。");
        }
        if (parsed.result !== undefined) parsed.result = validateResult(parsed.result, jobId);
        if (parsed.resume !== undefined) parsed.resume = validateResume(parsed.resume);
        return parsed;
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    async clear(inputJobId) {
      const jobId = assertJobId(inputJobId);
      await fs.unlink(join(rootDir, `${jobId}.json`)).catch(error => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
  });
}
