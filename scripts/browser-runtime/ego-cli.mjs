import { spawn as spawnNode } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INPUT_LIMIT_BYTES = 64 * 1024;
const SENSITIVE_FIELD = /cookie|token|password|credential|authorization|selector|script|\burl\b|database|binding/i;
const SAFE_ENV_FIELDS = Object.freeze([
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TMPDIR",
  "USER",
  "__CF_USER_TEXT_ENCODING"
]);
const RESULT_FIELDS = Object.freeze({
  downloaded: new Set(["kind", "jobId", "filePath", "safeFileName", "pageType", "reportVersion"]),
  captured: new Set(["kind", "jobId", "resourceType", "facts", "pageType", "selectorVersion"]),
  waiting_human: new Set(["kind", "jobId", "errorCode", "safeSummary", "stage"]),
  failed: new Set(["kind", "jobId", "errorCode", "safeSummary", "stage"]),
  schema_changed: new Set(["kind", "jobId", "errorCode", "safeSummary", "stage"]),
  download_capability_check: new Set(["kind", "jobId", "safeSummary"]),
  parsed: new Set(["kind", "jobId", "safeFileName", "fileHash", "archiveId", "rowCount"]),
  pending_upload: new Set(["kind", "jobId", "safeFileName", "fileHash", "archiveId", "rowCount"])
});

function egoError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function validateEgoExecutable(value) {
  const executable = String(value || "").trim();
  if (!executable || !isAbsolute(executable)) {
    throw egoError("EGO_EXECUTABLE_INVALID", "Ego 可执行文件必须使用绝对路径。");
  }
  return executable;
}

function validateModuleUrl(value, moduleRoot) {
  let modulePath;
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "file:") throw new Error("protocol");
    modulePath = fileURLToPath(parsed);
  } catch {
    throw egoError("EGO_MODULE_INVALID", "Ego 任务模块地址无效。");
  }
  const root = resolve(String(moduleRoot || ""));
  const candidate = resolve(modulePath);
  const pathFromRoot = relative(root, candidate);
  if (!root || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw egoError("EGO_MODULE_INVALID", "Ego 任务模块不在登记目录内。");
  }
  return new URL(String(value)).href;
}

function validateSafeValue(value, depth = 0) {
  if (depth > 6) throw egoError("EGO_INPUT_INVALID", "Ego 任务输入嵌套过深。");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw egoError("EGO_INPUT_INVALID", "Ego 任务输入包含无效数字。");
    return;
  }
  if (typeof value === "string") {
    if (value.length > 2_000 || /^https?:\/\//i.test(value)) {
      throw egoError("EGO_INPUT_INVALID", "Ego 任务输入包含未登记地址或超长文本。");
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw egoError("EGO_INPUT_INVALID", "Ego 任务输入数组过长。");
    for (const item of value) validateSafeValue(item, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") {
    throw egoError("EGO_INPUT_INVALID", "Ego 任务输入类型无效。");
  }
  const entries = Object.entries(value);
  if (entries.length > 40 || entries.some(([key]) => SENSITIVE_FIELD.test(key))) {
    throw egoError("EGO_INPUT_INVALID", "Ego 任务输入包含敏感或未登记字段。");
  }
  for (const [, item] of entries) validateSafeValue(item, depth + 1);
}

function encodeInput(input) {
  validateSafeValue(input);
  const json = JSON.stringify(input);
  if (!json || Buffer.byteLength(json) > INPUT_LIMIT_BYTES) {
    throw egoError("EGO_INPUT_INVALID", "Ego 任务输入超过大小限制。");
  }
  return Buffer.from(json).toString("base64url");
}

function childEnvironment(source, encodedInput) {
  const environment = {};
  for (const field of SAFE_ENV_FIELDS) {
    if (source[field] !== undefined) environment[field] = source[field];
  }
  environment.EC_EGO_TASK_B64 = encodedInput;
  return environment;
}

export function buildEgoBootstrap(moduleUrl) {
  const encodedModuleUrl = JSON.stringify(String(moduleUrl || ""));
  return `const input = JSON.parse(Buffer.from(process.env.EC_EGO_TASK_B64, "base64url").toString("utf8"));\n`
    + `const taskModule = await import(${encodedModuleUrl});\n`
    + "const helpers = Object.freeze({ listTaskSpaces, useOrCreateTaskSpace, claimTaskSpace, handOffTaskSpace, listTabs, switchTab, openOrReuseTab, gotoAndWait, pageInfo, js, cdp, wait, completeTaskSpace });\n"
    + "const result = await taskModule.executeEgoCliTask(input, helpers);\n"
    + "cliLog(JSON.stringify(result));\n";
}

function stopChild(child) {
  if (!child) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill?.("SIGKILL");
  } catch {
    try {
      child.kill?.("SIGKILL");
    } catch {
      // The process may already have exited.
    }
  }
}

function validateResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw egoError("EGO_PROTOCOL_INVALID", "Ego 未返回登记结果。");
  }
  const allowed = RESULT_FIELDS[value.kind];
  if (!allowed || Object.keys(value).some(field => !allowed.has(field) || SENSITIVE_FIELD.test(field))) {
    throw egoError("EGO_PROTOCOL_INVALID", "Ego 返回了未登记字段或结果类型。");
  }
  validateSafeValue(value);
  return structuredClone(value);
}

function parseSingleResult(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length !== 1) throw egoError("EGO_PROTOCOL_INVALID", "Ego 输出必须只有一条 JSON 结果。");
  try {
    return validateResult(JSON.parse(lines[0]));
  } catch (error) {
    if (error?.code === "EGO_PROTOCOL_INVALID") throw error;
    throw egoError("EGO_PROTOCOL_INVALID", "Ego 输出不是合法 JSON 结果。");
  }
}

export function createEgoCliRunner({
  executable,
  moduleRoot,
  spawn = spawnNode,
  timeoutMs = 120_000,
  maxOutputBytes = 1_048_576,
  environment = process.env
}) {
  const binary = validateEgoExecutable(executable);
  if (!isAbsolute(String(moduleRoot || ""))) {
    throw egoError("EGO_MODULE_INVALID", "Ego 任务模块目录必须使用绝对路径。");
  }
  const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 120_000);
  const safeOutputLimit = Math.max(1, Number(maxOutputBytes) || 1_048_576);

  return Object.freeze({
    async run({ moduleUrl, input }) {
      const safeModuleUrl = validateModuleUrl(moduleUrl, moduleRoot);
      const encodedInput = encodeInput(input);
      return new Promise((resolveRun, rejectRun) => {
        let child;
        let stdout = Buffer.alloc(0);
        let stderrBytes = 0;
        let settled = false;
        let timer;

        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          callback(value);
        };
        const overflow = chunk => stdout.length + stderrBytes + Buffer.byteLength(chunk) > safeOutputLimit;
        try {
          child = spawn(binary, ["nodejs"], {
            detached: true,
            stdio: ["pipe", "pipe", "pipe"],
            env: childEnvironment(environment, encodedInput)
          });
        } catch {
          throw egoError("EGO_PROCESS_FAILED", "Ego 进程无法启动。");
        }
        child.stdout?.on("data", chunk => {
          if (overflow(chunk)) {
            stopChild(child);
            finish(rejectRun, egoError("EGO_OUTPUT_LIMIT_EXCEEDED", "Ego 输出超过安全上限。"));
            return;
          }
          stdout = Buffer.concat([stdout, Buffer.from(chunk)]);
        });
        child.stderr?.on("data", chunk => {
          if (overflow(chunk)) {
            stopChild(child);
            finish(rejectRun, egoError("EGO_OUTPUT_LIMIT_EXCEEDED", "Ego 输出超过安全上限。"));
            return;
          }
          stderrBytes += Buffer.byteLength(chunk);
        });
        child.once("error", () => {
          finish(rejectRun, egoError("EGO_PROCESS_FAILED", "Ego 进程无法启动。"));
        });
        child.once("close", code => {
          if (settled) return;
          if (code !== 0) {
            finish(rejectRun, egoError("EGO_PROCESS_FAILED", "Ego 进程执行失败。"));
            return;
          }
          try {
            finish(resolveRun, parseSingleResult(stdout.toString("utf8")));
          } catch (error) {
            finish(rejectRun, error);
          }
        });
        timer = setTimeout(() => {
          stopChild(child);
          finish(rejectRun, egoError("EGO_TIMEOUT", "Ego 进程执行超时。"));
        }, safeTimeoutMs);
        child.stdin.end(buildEgoBootstrap(safeModuleUrl));
      });
    }
  });
}
