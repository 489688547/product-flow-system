import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBranchBase } from "./check-branch-base.mjs";
import { loadSharedEnv, resolveSharedEnvPath } from "./shared-local-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const VITE_PORT = 8127;
const API_PORT = 8132;
const children = new Set();
let runtimeTempDir = "";
let stopping = false;

function executable(name) {
  return resolve(ROOT, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
}

function startChild(name, command, args, env = process.env) {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: "inherit" });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (stopping) return;
    if (code !== 0 && !["SIGINT", "SIGTERM"].includes(signal)) {
      console.error(`${name} stopped unexpectedly (${signal || `code ${code ?? 1}`}).`);
      process.exitCode = code || 1;
    }
    shutdown();
  });
  return child;
}

function portOpen(port) {
  return new Promise(resolveOpen => {
    const socket = connect({ host: HOST, port });
    socket.once("connect", () => { socket.destroy(); resolveOpen(true); });
    socket.once("error", () => resolveOpen(false));
    socket.setTimeout(500, () => { socket.destroy(); resolveOpen(false); });
  });
}

async function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${HOST}:${port}.`);
}

async function waitForSandboxApi(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "本地 API 尚未就绪";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${HOST}:${API_PORT}/api/auth/session`);
      const body = await response.json().catch(() => ({}));
      if ([200, 401].includes(response.status) && body.authenticated === false) return;
      lastFailure = body.message || `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error?.message || String(error);
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`本地沙箱 API 未就绪：${lastFailure}`);
}

function sandboxEnvironment(values = {}) {
  const blocked = new Set([
    "PRODUCTION_DATA_ACCESS_TOKEN",
    "PRODUCTION_DATA_API_URL",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID"
  ]);
  return Object.fromEntries([
    ...Object.entries(values).filter(([name, value]) =>
      !blocked.has(name) && !name.startsWith("LOCAL_ONLINE_") && String(value || "").trim()
    ),
    ["LOCAL_ONLINE_ACCOUNT_MODE", "0"],
    ["RUNTIME_ENV", "development"]
  ]);
}

function prepareSandboxRuntime(values) {
  runtimeTempDir = mkdtempSync(join(tmpdir(), "product-flow-local-sandbox-"));
  const source = Object.entries(sandboxEnvironment(values))
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join("\n");
  writeFileSync(join(runtimeTempDir, ".dev.vars"), `${source}\n`, { mode: 0o600 });
  symlinkSync(resolve(ROOT, "wrangler.toml"), join(runtimeTempDir, "wrangler.toml"), "file");
  symlinkSync(resolve(ROOT, "functions"), join(runtimeTempDir, "functions"), "dir");
  symlinkSync(resolve(ROOT, "dist"), join(runtimeTempDir, "dist"), "dir");
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
  if (runtimeTempDir) rmSync(runtimeTempDir, { recursive: true, force: true });
  runtimeTempDir = "";
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("exit", shutdown);

async function main() {
  const branchBase = checkBranchBase(ROOT, process.env, { refresh: true });
  if (!branchBase.current) throw new Error(`本地环境启动已阻止：${branchBase.reason}`);
  if (!existsSync(resolve(ROOT, "dist", "index.html"))) {
    throw new Error("缺少 dist/index.html；请先运行 npm run build。");
  }
  const sharedEnv = loadSharedEnv(ROOT, { envPath: resolveSharedEnvPath(ROOT) });
  prepareSandboxRuntime(sharedEnv.values);
  console.log("正在启动本地代码 · 本地 SQLite 沙箱；不会连接 Cloudflare 或生产数据库...");
  startChild("Wrangler local", executable("wrangler"), [
    "pages", "dev", resolve(ROOT, "dist"),
    "--cwd", runtimeTempDir,
    "--port", String(API_PORT),
    "--ip", HOST,
    "--persist-to", resolve(ROOT, ".wrangler", "state"),
    "--show-interactive-dev-session=false"
  ]);
  await waitForPort(API_PORT);
  await waitForSandboxApi();
  startChild("Vite", executable("vite"), ["--host", HOST, "--port", String(VITE_PORT)], {
    ...process.env,
    VITE_API_TARGET: `http://${HOST}:${API_PORT}`
  });
  await waitForPort(VITE_PORT);
  console.log(`请打开 http://${HOST}:${VITE_PORT}/；共享验收请使用 https://test.deshan-tiyes.cn。`);
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
  shutdown();
});
