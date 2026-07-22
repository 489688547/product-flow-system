import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
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

function swapToSandboxConfig() {
  writeFileSync(WRANGLER_BACKUP, readFileSync(WRANGLER_CONFIG, "utf8"));
  writeFileSync(WRANGLER_CONFIG, readFileSync(WRANGLER_SANDBOX_CONFIG, "utf8"));
}

// 沙箱模式临时改写 wrangler.toml；无论正常退出还是上次被强杀，都要恢复线上配置。
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

function killChild(child) {
  if (!child.killed) child.kill("SIGTERM");
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) killChild(child);
  restoreConfigIfSwapped();
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
  // 上次沙箱运行若被强杀，先恢复线上配置再启动。
  restoreConfigIfSwapped();
  if (useLocalD1) {
    // 沙箱模式：Pages 不支持 --config 指定自定义路径，临时将沙箱配置（本地 D1）
    // 换入 wrangler.toml，退出时在 shutdown() 中恢复原配置。
    swapToSandboxConfig();
  }
  const sharedEnvPath = resolveSharedEnvPath(ROOT);
  const sharedEnv = loadSharedEnv(ROOT, { envPath: sharedEnvPath });
  const wranglerEnv = {
    ...process.env,
    ...sharedEnv.values,
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true"
  };
  console.log(useLocalD1 ? "正在启动本地代码 · 本地沙箱环境（本地 D1，不连生产库）..." : "正在启动本地代码 · 线上真实环境...");
  startChild("Wrangler", executable("wrangler"), [
    "pages", "dev",
    "--port", String(PAGES_PORT),
    "--ip", HOST,
    "--live-reload"
  ], wranglerEnv);
  await waitForPort(PAGES_PORT);
  startChild("Vite", executable("vite"), ["--host", HOST, "--port", String(VITE_PORT)], {
    ...process.env,
    VITE_API_TARGET: `http://${HOST}:${PAGES_PORT}`
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
