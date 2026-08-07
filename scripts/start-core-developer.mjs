#!/usr/bin/env node
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBranchBase } from "./check-branch-base.mjs";
import { loadDeveloperAccess } from "./core-developer-access.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const VITE_PORT = 8127;

function executable(name) {
  return resolve(ROOT, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
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

export async function verifyCoreDeveloperAccess(access, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(new URL("/api/auth/session", access.apiUrl), {
    headers: { "x-pfs-core-developer-token": access.token }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.authenticated !== true || body.user?.loginMode !== "local-online-account") {
    throw new Error(body.message || `个人开发权限验证失败（HTTP ${response.status}）。`);
  }
  return body.user;
}

export async function launchCoreDeveloper({ spawnChild = spawn, fetchImpl = fetch } = {}) {
  const branchBase = checkBranchBase(ROOT, process.env, { refresh: true });
  if (!branchBase.current) throw new Error(`本地环境启动已阻止：${branchBase.reason}`);
  const access = await loadDeveloperAccess();
  if (!access) throw new Error("缺少核心开发者个人文件，请使用 npm run start:sandbox。 ");
  const user = await verifyCoreDeveloperAccess(access, { fetchImpl });
  process.stdout.write(`身份验证通过：${user.name || user.userId}；正在连接 ECS 生产 API。\n`);

  const child = spawnChild(executable("vite"), ["--host", HOST, "--port", String(VITE_PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_API_TARGET: access.apiUrl,
      PFS_CORE_DEVELOPER_TOKEN: access.token
    },
    stdio: "inherit"
  });
  const stop = signal => { if (!child.killed) child.kill(signal); };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  child.once("error", error => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
  child.once("exit", code => { process.exitCode = code ?? 1; });
  await waitForPort(VITE_PORT);
  process.stdout.write(`请打开 http://${HOST}:${VITE_PORT}/；浏览器不会收到个人 Token。\n`);
  return { child, user };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launchCoreDeveloper().catch(error => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
