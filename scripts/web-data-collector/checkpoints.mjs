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
