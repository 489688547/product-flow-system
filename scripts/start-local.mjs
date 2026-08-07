#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeveloperAccess, selectLocalRuntime } from "./core-developer-access.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function launchLocalRuntime({ spawnChild = spawn } = {}) {
  const access = await loadDeveloperAccess();
  const runtime = selectLocalRuntime({ access });
  const script = runtime === "core" ? "start-core-developer.mjs" : "start-local-sandbox.mjs";
  const child = spawnChild(process.execPath, [resolve(ROOT, "scripts", script)], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit"
  });
  const forward = signal => {
    if (!child.killed) child.kill(signal);
  };
  const forwardInterrupt = () => forward("SIGINT");
  const forwardTerminate = () => forward("SIGTERM");
  process.once("SIGINT", forwardInterrupt);
  process.once("SIGTERM", forwardTerminate);
  child.once("error", error => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.removeListener("SIGINT", forwardInterrupt);
    process.removeListener("SIGTERM", forwardTerminate);
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
  return { access, runtime, child };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launchLocalRuntime().catch(error => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
