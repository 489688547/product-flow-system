import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync
} from "node:fs";
import { isAbsolute, join } from "node:path";

const DEFAULTS = Object.freeze({
  PFS_RUNTIME_HOST: "127.0.0.1",
  PFS_RUNTIME_PORT: "8080",
  PFS_WRANGLER_PERSIST_DIR: "/var/lib/product-flow/wrangler",
  PFS_RUNTIME_ENV_FILE: "/run/pfs/runtime.env",
  PFS_WRANGLER_CONFIG: "/app/deploy/aliyun/wrangler.toml",
  PFS_RUNTIME_WORK_DIR: "/var/lib/product-flow/runtime",
  PFS_ASSETS_DIR: "/app/dist",
  PFS_FUNCTIONS_DIR: "/app/functions",
  PFS_WRANGLER_BIN: "/app/node_modules/.bin/wrangler"
});

function absolutePath(env, name) {
  const value = String(env[name] || DEFAULTS[name] || "").trim();
  if (!value || !isAbsolute(value)) {
    throw new Error(`${name} 必须是绝对路径。`);
  }
  return value;
}

function runtimePort(value) {
  const port = Number.parseInt(String(value || DEFAULTS.PFS_RUNTIME_PORT), 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("PFS_RUNTIME_PORT 必须是 1024 到 65535 的整数。");
  }
  return port;
}

function runtimeHost(value) {
  const host = String(value || DEFAULTS.PFS_RUNTIME_HOST).trim();
  if (!["127.0.0.1", "0.0.0.0"].includes(host)) {
    throw new Error("PFS_RUNTIME_HOST 只能是 127.0.0.1 或 0.0.0.0。");
  }
  return host;
}

export function validateRuntimeEnvironment(env = {}) {
  const localOnline = String(env.LOCAL_ONLINE_ACCOUNT_MODE || "").trim().toLowerCase();
  if (localOnline && !["0", "false"].includes(localOnline)) {
    throw new Error("公网 ECS 运行时禁止启用 LOCAL_ONLINE_ACCOUNT_MODE。");
  }
  return Object.freeze({
    host: runtimeHost(env.PFS_RUNTIME_HOST),
    port: runtimePort(env.PFS_RUNTIME_PORT),
    persistDir: absolutePath(env, "PFS_WRANGLER_PERSIST_DIR"),
    envFile: absolutePath(env, "PFS_RUNTIME_ENV_FILE"),
    configPath: absolutePath(env, "PFS_WRANGLER_CONFIG"),
    workDir: absolutePath(env, "PFS_RUNTIME_WORK_DIR"),
    assetsDir: absolutePath(env, "PFS_ASSETS_DIR"),
    functionsDir: absolutePath(env, "PFS_FUNCTIONS_DIR"),
    wranglerBin: absolutePath(env, "PFS_WRANGLER_BIN")
  });
}

export function buildPagesDevArgs(config) {
  return [
    "pages", "dev", join(config.workDir, "dist"),
    "--ip", config.host,
    "--port", String(config.port),
    "--persist-to", config.persistDir,
    "--env-file", config.envFile,
    "--show-interactive-dev-session=false",
    "--log-level", "info"
  ];
}

export function runtimeWorkingDirectory(config) {
  return config.workDir;
}

function ensureDirectorySymlink(linkPath, targetPath) {
  try {
    const stat = lstatSync(linkPath);
    if (!stat.isSymbolicLink()) {
      throw new Error(`运行时路径必须是符号链接：${linkPath}`);
    }
    if (readlinkSync(linkPath) === targetPath) return;
    unlinkSync(linkPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  symlinkSync(targetPath, linkPath, "dir");
}

export function prepareRuntimeWorkspace(config) {
  mkdirSync(config.workDir, { recursive: true, mode: 0o700 });
  copyFileSync(config.configPath, join(config.workDir, "wrangler.toml"));
  chmodSync(join(config.workDir, "wrangler.toml"), 0o600);
  ensureDirectorySymlink(join(config.workDir, "dist"), config.assetsDir);
  ensureDirectorySymlink(join(config.workDir, "functions"), config.functionsDir);
}
