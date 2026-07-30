import { spawn as spawnNode } from "node:child_process";
import process from "node:process";
import { isAbsolute, resolve, sep } from "node:path";

const SENSITIVE_KEY = /cookie|token|password|credential|authorization|secret|session/i;
const SAFE_ENV = Object.freeze({
  PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  LANG: "zh_CN.UTF-8",
  LC_ALL: "zh_CN.UTF-8"
});

function runtimeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function isWithin(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function safeWorkspace(value) {
  const workspace = resolve(String(value || ""));
  if (!isAbsolute(value || "") || workspace === resolve("/")) {
    throw runtimeError("COLLECTOR_WORKSPACE_INVALID", "采集器实验工作目录无效。");
  }
  return workspace;
}

function sensitiveResult(value, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => sensitiveResult(item, seen));
  return Object.entries(value).some(([key, nested]) => (
    SENSITIVE_KEY.test(key) || sensitiveResult(nested, seen)
  ));
}

function ensureSafeResult(value) {
  if (sensitiveResult(value)) {
    throw runtimeError("COLLECTOR_RESULT_SENSITIVE", "采集器实验结果包含敏感字段。");
  }
  return value;
}

function lookupVariable(path, variables) {
  const parts = String(path || "").split(".");
  let current = variables;
  for (const part of parts) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part) || !current || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function variableValue(source, variables) {
  if (typeof source === "string") {
    const exact = source.match(/^\$\{([a-zA-Z_][a-zA-Z0-9_.]*)\}$/);
    if (exact) return structuredClone(lookupVariable(exact[1], variables));
    return source.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (_, name) => (
      lookupVariable(name, variables) === null || lookupVariable(name, variables) === undefined
        ? ""
        : String(lookupVariable(name, variables))
    ));
  }
  if (Array.isArray(source)) return source.map(item => variableValue(item, variables));
  if (source && typeof source === "object") {
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, variableValue(value, variables)])
    );
  }
  return source;
}

function killProcessTree(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process may already have exited.
    }
  }
}

function runProcess({
  executable,
  args,
  cwd,
  timeoutMs,
  maxOutputBytes,
  shell = false,
  spawn = spawnNode,
  environment = {}
}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, args, {
      cwd,
      detached: true,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...SAFE_ENV,
        COLLECTOR_RUN_ID: String(environment.runId || ""),
        COLLECTOR_TEMPLATE_ID: String(environment.templateId || "")
      }
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const append = (current, chunk) => {
      const next = Buffer.concat([current, Buffer.from(chunk)]);
      if (stdout.length + stderr.length + Buffer.byteLength(chunk) > maxOutputBytes) {
        killProcessTree(child);
        finish(
          rejectRun,
          runtimeError("COLLECTOR_OUTPUT_LIMIT_EXCEEDED", "采集器脚本输出超过模板上限。")
        );
        return current;
      }
      return next;
    };
    child.stdout?.on("data", chunk => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", chunk => {
      stderr = append(stderr, chunk);
    });
    child.once("error", error => {
      finish(
        rejectRun,
        runtimeError("COLLECTOR_SCRIPT_FAILED", `采集器脚本启动失败：${error.message}`)
      );
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        finish(
          rejectRun,
          runtimeError(
            "COLLECTOR_SCRIPT_FAILED",
            `采集器脚本执行失败：${signal || code || "unknown"}。`
          )
        );
        return;
      }
      finish(resolveRun, {
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        exitCode: code
      });
    });
    const timeout = setTimeout(() => {
      killProcessTree(child);
      finish(
        rejectRun,
        runtimeError("COLLECTOR_SCRIPT_TIMEOUT", "采集器脚本执行超时。")
      );
    }, timeoutMs);
  });
}

function conditionMatches(condition, variables) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    throw runtimeError("COLLECTOR_CONDITION_INVALID", "采集器条件无效。");
  }
  const actual = variables[String(condition.variable || "")];
  const expected = variableValue(condition.value, variables);
  if (condition.operator === "equals") return actual === expected;
  if (condition.operator === "not_equals") return actual !== expected;
  if (condition.operator === "truthy") return Boolean(actual);
  if (condition.operator === "in") return Array.isArray(expected) && expected.includes(actual);
  throw runtimeError("COLLECTOR_CONDITION_INVALID", "采集器条件运算符未登记。");
}

function remainingMilliseconds(context, step) {
  const remaining = Math.max(1, context.deadline - Date.now());
  const stepTimeout = Number(step.timeoutSeconds || 0) > 0
    ? Number(step.timeoutSeconds) * 1_000
    : remaining;
  return Math.min(remaining, stepTimeout);
}

async function executeStep(step, context) {
  if (step.type === "flow.setVariable") {
    const value = variableValue(step.value, context.variables);
    context.variables[step.name] = structuredClone(value);
    return value;
  }
  if (step.type === "flow.condition") {
    const selected = conditionMatches(step.when, context.variables) ? step.then : step.else;
    return executeSteps(selected, context);
  }
  if (step.type === "flow.loop") {
    const items = variableValue(step.items, context.variables);
    if (!Array.isArray(items) || items.length > step.maxIterations) {
      throw runtimeError("COLLECTOR_LOOP_LIMIT_EXCEEDED", "采集器循环超过模板上限。");
    }
    const results = [];
    for (const item of items) {
      context.variables[step.itemVariable] = structuredClone(item);
      results.push(await executeSteps(step.steps, context));
    }
    delete context.variables[step.itemVariable];
    return results;
  }
  if (step.type === "browser.javascript") {
    if (typeof context.browser?.evaluate !== "function") {
      throw runtimeError("COLLECTOR_BROWSER_UNAVAILABLE", "采集器浏览器执行边界不可用。");
    }
    const timeoutMs = remainingMilliseconds(context, step);
    let timeout;
    try {
      return ensureSafeResult(await Promise.race([
        context.browser.evaluate(step.code, {
          variables: structuredClone(context.variables),
          timeoutMs
        }),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(runtimeError("COLLECTOR_SCRIPT_TIMEOUT", "采集器页面脚本执行超时。")),
            timeoutMs
          );
        })
      ]));
    } finally {
      clearTimeout(timeout);
    }
  }
  if (step.type === "browser.open") {
    if (typeof context.browser?.open !== "function") {
      throw runtimeError("COLLECTOR_BROWSER_UNAVAILABLE", "采集器浏览器打开页面能力不可用。");
    }
    return ensureSafeResult(await context.browser.open(step.url, {
      timeoutMs: remainingMilliseconds(context, step),
      variables: structuredClone(context.variables)
    }));
  }
  if (step.type === "browser.click") {
    if (typeof context.browser?.click !== "function") {
      throw runtimeError("COLLECTOR_BROWSER_UNAVAILABLE", "采集器浏览器点击能力不可用。");
    }
    return ensureSafeResult(await context.browser.click(step.selectors, {
      timeoutMs: remainingMilliseconds(context, step),
      variables: structuredClone(context.variables)
    }));
  }
  if (step.type === "browser.download") {
    if (typeof context.browser?.download !== "function") {
      throw runtimeError("COLLECTOR_BROWSER_UNAVAILABLE", "采集器浏览器下载能力不可用。");
    }
    return ensureSafeResult(await context.browser.download({
      selectors: step.selectors,
      filePattern: step.filePattern || "",
      timeoutMs: remainingMilliseconds(context, step),
      variables: structuredClone(context.variables)
    }));
  }
  if (step.type === "browser.wait") {
    if (typeof context.browser?.wait === "function") {
      return ensureSafeResult(await context.browser.wait({
        milliseconds: step.milliseconds,
        selectors: step.selectors || [],
        timeoutMs: remainingMilliseconds(context, step)
      }));
    }
    await new Promise(resolveWait => setTimeout(resolveWait, step.milliseconds));
    return { waitedMilliseconds: step.milliseconds };
  }
  if (step.type === "local.command") {
    const command = variableValue(step.command, context.variables);
    return runProcess({
      executable: command[0],
      args: command.slice(1),
      cwd: context.workspace,
      timeoutMs: remainingMilliseconds(context, step),
      maxOutputBytes: context.limits.maxOutputBytes,
      shell: step.shell === true,
      spawn: context.spawn,
      environment: context.environment
    });
  }
  if (step.type === "local.python") {
    const scriptPath = resolve(context.workspace, step.script);
    if (!isWithin(scriptPath, context.workspace)) {
      throw runtimeError("COLLECTOR_WORKSPACE_INVALID", "采集器 Python 脚本超出工作目录。");
    }
    return runProcess({
      executable: context.pythonBinary,
      args: [scriptPath, ...variableValue(step.args, context.variables)],
      cwd: context.workspace,
      timeoutMs: remainingMilliseconds(context, step),
      maxOutputBytes: context.limits.maxOutputBytes,
      spawn: context.spawn,
      environment: context.environment
    });
  }
  if (step.type === "file.parse") {
    const parser = context.parsers?.[step.parser];
    if (typeof parser !== "function") {
      throw runtimeError("COLLECTOR_PARSER_NOT_REGISTERED", "采集器文件解析器未登记。");
    }
    const input = variableValue(step.input, context.variables);
    const absoluteInput = resolve(context.workspace, String(input || ""));
    if (!isWithin(absoluteInput, context.workspace)) {
      throw runtimeError("COLLECTOR_WORKSPACE_INVALID", "采集器解析文件超出工作目录。");
    }
    return ensureSafeResult(await parser({
      input,
      absoluteInput,
      workspace: context.workspace,
      variables: structuredClone(context.variables)
    }));
  }
  throw runtimeError("COLLECTOR_STEP_NOT_SUPPORTED", `采集器步骤尚未支持：${step.type}。`);
}

async function executeSteps(steps, context) {
  const outputs = {};
  for (const step of steps) {
    if (Date.now() >= context.deadline) {
      throw runtimeError("COLLECTOR_SCRIPT_TIMEOUT", "采集器实验运行超过总时限。");
    }
    const output = await executeStep(step, context);
    ensureSafeResult(output);
    outputs[step.id] = structuredClone(output);
    context.variables[step.id] = structuredClone(output);
  }
  return outputs;
}

export async function executeExperimentalRun({
  bundle,
  browser,
  workspace: inputWorkspace,
  pythonBinary = "/usr/bin/python3",
  spawn = spawnNode,
  parsers = {}
}) {
  if (bundle?.template?.mode !== "experimental") {
    throw runtimeError("COLLECTOR_TEMPLATE_ACTION_DENIED", "只有实验模板可以进入实验执行器。");
  }
  const workspace = safeWorkspace(inputWorkspace);
  const startedAt = new Date().toISOString();
  const variables = {};
  const context = {
    browser,
    parsers,
    workspace,
    pythonBinary,
    spawn,
    variables,
    limits: bundle.template.limits,
    deadline: Date.now() + bundle.template.timeoutSeconds * 1_000,
    environment: {
      runId: bundle.runId,
      templateId: bundle.templateId
    }
  };
  const outputs = await executeSteps(bundle.template.steps, context);
  return {
    runId: bundle.runId,
    templateId: bundle.templateId,
    version: bundle.version,
    status: "completed",
    trustLevel: "untrusted",
    startedAt,
    completedAt: new Date().toISOString(),
    outputs,
    variables
  };
}
