import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBranchBase } from "./check-branch-base.mjs";
import { loadSharedEnv, resolveSharedEnvPath } from "./shared-local-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const VITE_PORT = 8127;
const PAGES_PORT = 8132;
const WRANGLER_CONFIG = resolve(ROOT, "wrangler.toml");
const WRANGLER_SANDBOX_CONFIG = resolve(ROOT, "wrangler.local.toml");
const WRANGLER_BACKUP = resolve(ROOT, ".wrangler-toml.online-backup");
const SANDBOX_MARKER = "本地沙箱模式";
const children = new Set();
let stopping = false;
let runtimeTempDir = "";

// 兼容旧启动器残留：若历史沙箱进程曾被强杀，先恢复线上配置。
function restoreConfigIfSwapped() {
  if (!existsSync(WRANGLER_BACKUP)) return;
  try {
    const current = readFileSync(WRANGLER_CONFIG, "utf8");
    if (current.includes(SANDBOX_MARKER)) {
      writeFileSync(WRANGLER_CONFIG, readFileSync(WRANGLER_BACKUP, "utf8"));
    }
  } finally {
    try {
      unlinkSync(WRANGLER_BACKUP);
    } catch {
      // 备份清理由下次启动重试
    }
  }
}

function executable(name) {
  return resolve(ROOT, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
}

function startChild(name, command, args, env = process.env) {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: "inherit" });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (stopping) return;
    if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") {
      shutdown();
      return;
    }
    const detail = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`${name} stopped unexpectedly (${detail}).`);
    process.exitCode = code || 1;
    shutdown();
  });
  return child;
}

function runCommand(name, command, args, env = process.env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: "inherit" });
    children.add(child);
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (code === 0) {
        resolveRun();
        return;
      }
      const detail = signal ? `signal ${signal}` : `code ${code ?? 1}`;
      rejectRun(new Error(`${name} failed (${detail}).`));
    });
  });
}

function portOpen(port) {
  return new Promise(resolveOpen => {
    const socket = connect({ host: HOST, port });
    socket.once("connect", () => {
      socket.destroy();
      resolveOpen(true);
    });
    socket.once("error", () => resolveOpen(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolveOpen(false);
    });
  });
}

async function waitForPort(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${HOST}:${port}.`);
}

async function waitForAuthenticatedApi(secret, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let consecutiveSuccesses = 0;
  let lastFailure = "远程 API 尚未就绪";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${HOST}:${PAGES_PORT}/api/auth/session`, {
        headers: { "x-pfs-local-online-session": secret }
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.authenticated === true && body.user?.loginMode === "local-online-account") {
        consecutiveSuccesses += 1;
        if (consecutiveSuccesses >= 3) return;
      } else {
        consecutiveSuccesses = 0;
        lastFailure = body.message || `HTTP ${response.status}`;
      }
    } catch (error) {
      consecutiveSuccesses = 0;
      lastFailure = error?.message || String(error);
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`远程 API 未通过连续验证：${lastFailure}`);
}

function prepareRemoteRuntime(extraEnvironment = {}) {
  runtimeTempDir = mkdtempSync(join(tmpdir(), "product-flow-local-online-"));
  const requestSecret = randomBytes(32).toString("base64url");
  const envPath = join(runtimeTempDir, "runtime.env");
  const runtimeEnvironment = {
    ...extraEnvironment,
    LOCAL_ONLINE_REQUEST_SECRET: requestSecret
  };
  const envSource = Object.entries(runtimeEnvironment)
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join("\n");
  writeFileSync(envPath, `${envSource}\n`, { mode: 0o600 });
  const devVarsPath = join(runtimeTempDir, ".dev.vars");
  writeFileSync(devVarsPath, `${envSource}\n`, { mode: 0o600 });
  copyFileSync(WRANGLER_SANDBOX_CONFIG, join(runtimeTempDir, "wrangler.toml"));
  symlinkSync(resolve(ROOT, "functions"), join(runtimeTempDir, "functions"), "dir");
  return {
    bundlePath: join(runtimeTempDir, "index.js"),
    devVarsPath,
    envPath,
    requestSecret
  };
}

function cleanupRemoteRuntime() {
  if (!runtimeTempDir) return;
  try {
    rmSync(runtimeTempDir, { recursive: true, force: true });
  } finally {
    runtimeTempDir = "";
  }
}

function killChild(child) {
  if (!child.killed) child.kill("SIGTERM");
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) killChild(child);
  restoreConfigIfSwapped();
  cleanupRemoteRuntime();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("exit", shutdown);

async function main() {
  const branchBase = checkBranchBase(ROOT, process.env, { refresh: true });
  if (!branchBase.current) {
    throw new Error(`本地环境启动已阻止：${branchBase.reason}`);
  }
  const useLocalD1 = process.argv.includes("--local-d1") || process.env.LOCAL_D1_SANDBOX === "1";
  // 上次旧版沙箱运行若被强杀，先恢复线上配置再启动。
  restoreConfigIfSwapped();
  const sharedEnvPath = resolveSharedEnvPath(ROOT);
  const sharedEnv = loadSharedEnv(ROOT, { envPath: sharedEnvPath });
  if (!sharedEnv.values.PRODUCTION_DATA_ACCESS_TOKEN) {
    throw new Error("本地线上账号缺少 PRODUCTION_DATA_ACCESS_TOKEN。");
  }
  console.log(useLocalD1 ? "正在启动本地代码 · 本地沙箱环境（本地 D1，不连生产库）..." : "正在启动本地代码 · 线上真实环境...");
  const runtime = prepareRemoteRuntime({
    PRODUCTION_DATA_ACCESS_TOKEN: sharedEnv.values.PRODUCTION_DATA_ACCESS_TOKEN
  });
  const requestSecret = runtime.requestSecret;
  if (useLocalD1) {
    startChild("Wrangler", executable("wrangler"), [
      "pages", "dev", resolve(ROOT, "dist"),
      "--cwd", runtimeTempDir,
      "--port", String(PAGES_PORT),
      "--ip", HOST,
      "--persist-to", resolve(ROOT, ".wrangler", "state"),
      "--live-reload",
      "--show-interactive-dev-session=false"
    ]);
  } else {
    const functionsBuildArgs = [
      "pages", "functions", "build", "functions",
      "--outdir", runtimeTempDir,
      "--output-config-path", join(runtimeTempDir, "wrangler.jsonc"),
      "--project-directory", ROOT,
      "--build-output-directory", "dist"
    ];
    await runCommand("Pages Functions build", executable("wrangler"), functionsBuildArgs);
    startChild("Pages Functions watcher", executable("wrangler"), [...functionsBuildArgs, "--watch"]);
    startChild("Wrangler", executable("wrangler"), [
      "dev", runtime.bundlePath,
      "--remote",
      "--port", String(PAGES_PORT),
      "--ip", HOST,
      "--config", WRANGLER_CONFIG,
      "--env-file", sharedEnvPath,
      "--env-file", runtime.envPath,
      "--show-interactive-dev-session=false"
    ]);
  }
  await waitForPort(PAGES_PORT);
  await waitForAuthenticatedApi(requestSecret);
  startChild("Vite", executable("vite"), ["--host", HOST, "--port", String(VITE_PORT)], {
    ...process.env,
    VITE_API_TARGET: `http://${HOST}:${PAGES_PORT}`,
    VITE_LOCAL_D1_SANDBOX: useLocalD1 ? "1" : "0",
    ...(requestSecret ? { LOCAL_ONLINE_REQUEST_SECRET: requestSecret } : {})
  });
  await waitForPort(VITE_PORT);
  console.log(`请打开 http://${HOST}:${VITE_PORT}/`);
  console.log(useLocalD1
    ? "当前使用本地沙箱账号与本地数据库，写入只影响本机，可放心操作。"
    : "当前使用线上真实账号、生产数据和外部平台，所有操作立即生效。");
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
  shutdown();
});
