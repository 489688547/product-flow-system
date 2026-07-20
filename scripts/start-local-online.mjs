import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const VITE_PORT = 8127;
const PAGES_PORT = 8132;
const ENV_FILE = resolve(ROOT, ".env");
const children = new Set();
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
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("exit", shutdown);

async function main() {
  if (!existsSync(ENV_FILE)) {
    throw new Error("缺少本地 .env，请先配置个人令牌和平台连接。");
  }
  console.log("正在启动本地代码 · 线上真实环境...");
  startChild("Wrangler", executable("wrangler"), [
    "pages", "dev",
    "--port", String(PAGES_PORT),
    "--ip", HOST,
    "--live-reload"
  ]);
  await waitForPort(PAGES_PORT);
  startChild("Vite", executable("vite"), ["--host", HOST, "--port", String(VITE_PORT)], {
    ...process.env,
    VITE_API_TARGET: `http://${HOST}:${PAGES_PORT}`
  });
  await waitForPort(VITE_PORT);
  console.log(`请打开 http://${HOST}:${VITE_PORT}/`);
  console.log("当前使用线上真实账号、生产数据和外部平台，所有操作立即生效。");
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
  shutdown();
});
