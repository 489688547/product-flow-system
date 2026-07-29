import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  buildPagesDevArgs,
  runtimeWorkingDirectory,
  validateRuntimeEnvironment
} from "./runtime-config.mjs";

function requirePath(path, label) {
  if (!existsSync(path)) throw new Error(`${label}不存在：${path}`);
}

export function startAliyunRuntime(env = process.env, spawnImpl = spawn) {
  const config = validateRuntimeEnvironment(env);
  requirePath(config.envFile, "运行时环境文件");
  requirePath(config.configPath, "Wrangler 配置");
  requirePath(config.assetsDir, "静态资源目录");
  requirePath(config.wranglerBin, "Wrangler 可执行文件");
  mkdirSync(config.persistDir, { recursive: true, mode: 0o700 });

  const child = spawnImpl(config.wranglerBin, buildPagesDevArgs(config), {
    cwd: runtimeWorkingDirectory(config),
    stdio: "inherit",
    env: process.env
  });
  const forward = signal => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", forward);
  process.once("SIGTERM", forward);
  child.once("exit", (code, signal) => {
    process.removeListener("SIGINT", forward);
    process.removeListener("SIGTERM", forward);
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
  return child;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    startAliyunRuntime();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
