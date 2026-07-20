import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = Number(process.env.GOODS_FLOW_API_PORT || 8160);
const webPort = Number(process.env.GOODS_FLOW_WEB_PORT || 8161);
const host = "127.0.0.1";

if (!Number.isInteger(apiPort) || !Number.isInteger(webPort) || apiPort === webPort) {
  throw new Error("GOODS_FLOW_API_PORT 和 GOODS_FLOW_WEB_PORT 必须是不同的有效端口");
}

const children = [];
let shuttingDown = false;

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    stdio: "inherit"
  });
  children.push(child);
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = code === null ? signal : `退出码 ${code}`;
    console.error(`货流测试服务意外停止：${reason}`);
    shutdown(code || 1);
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  const timeout = setTimeout(() => process.exit(exitCode), 1_000);
  timeout.unref();
  Promise.all(children.map(child => child.exitCode === null && child.signalCode === null
    ? new Promise(resolve => child.once("exit", resolve))
    : Promise.resolve()
  )).finally(() => process.exit(exitCode));
}

async function waitForOk(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Child process is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`测试服务启动超时：${url}`);
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

start(process.execPath, ["server.mjs"], { DINGTALK_PORT: String(apiPort) });
start(process.execPath, ["node_modules/vite/bin/vite.js", "--host", host, "--port", String(webPort), "--strictPort"], {
  VITE_API_TARGET: `http://${host}:${apiPort}`
});

try {
  await Promise.all([
    waitForOk(`http://${host}:${apiPort}/api/platform/v1/goods-flow/dashboard`),
    waitForOk(`http://${host}:${webPort}/`)
  ]);
  console.log(`货流测试页已就绪：http://${host}:${webPort}/#supply-overview`);
  console.log("关闭此终端窗口即可停止测试环境。");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}
