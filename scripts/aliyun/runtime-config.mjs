import { isAbsolute } from "node:path";
import { DATABASES, localD1DatabasePath } from "./d1-transfer.mjs";

const DEFAULTS = Object.freeze({
  PFS_RUNTIME_HOST: "127.0.0.1",
  PFS_RUNTIME_PORT: "8080",
  PFS_WRANGLER_PERSIST_DIR: "/var/lib/product-flow/wrangler",
  PFS_RUNTIME_ENV_FILE: "/run/pfs/runtime.env",
  PFS_ASSETS_DIR: "/app/dist",
  PFS_FUNCTIONS_BUNDLE: "/app/dist-server/index.js"
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

function runtimeName(value) {
  const name = String(value || "production").trim();
  if (!new Set(["production", "test"]).has(name)) {
    throw new Error("PFS_RUNTIME_NAME 只能是 production 或 test。");
  }
  return name;
}

function httpsOrigin(value, name, { required = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw new Error(`${name} 必须配置 HTTPS Origin。`);
    return "";
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} 必须配置 HTTPS Origin。`);
  }
  return url.origin;
}

export function validateRuntimeEnvironment(env = {}) {
  const localOnline = String(env.LOCAL_ONLINE_ACCOUNT_MODE || "").trim().toLowerCase();
  if (localOnline && !["0", "false"].includes(localOnline)) {
    throw new Error("公网 ECS 运行时禁止启用 LOCAL_ONLINE_ACCOUNT_MODE。");
  }
  const name = runtimeName(env.PFS_RUNTIME_NAME);
  const publicAppOrigin = httpsOrigin(env.PFS_PUBLIC_APP_ORIGIN, "PFS_PUBLIC_APP_ORIGIN", {
    required: name === "test"
  });
  const publicApiOrigin = httpsOrigin(
    env.PFS_PUBLIC_API_ORIGIN,
    "PFS_PUBLIC_API_ORIGIN",
    { required: true }
  );
  const allowedBrowserOrigin = httpsOrigin(
    env.PFS_ALLOWED_BROWSER_ORIGIN,
    "PFS_ALLOWED_BROWSER_ORIGIN",
    { required: name === "test" }
  );
  if (name === "test" && publicAppOrigin !== allowedBrowserOrigin) {
    throw new Error("测试运行时的公开应用 Origin 与允许浏览器 Origin 必须一致。");
  }
  const persistDir = absolutePath(env, "PFS_WRANGLER_PERSIST_DIR");
  return Object.freeze({
    runtimeName: name,
    host: runtimeHost(env.PFS_RUNTIME_HOST),
    port: runtimePort(env.PFS_RUNTIME_PORT),
    persistDir,
    envFile: absolutePath(env, "PFS_RUNTIME_ENV_FILE"),
    assetsDir: absolutePath(env, "PFS_ASSETS_DIR"),
    bundlePath: absolutePath(env, "PFS_FUNCTIONS_BUNDLE"),
    publicApiOrigin,
    productDatabasePath: localD1DatabasePath(persistDir, DATABASES[0]),
    demoDatabasePath: localD1DatabasePath(persistDir, DATABASES[1]),
    publicAppOrigin,
    allowedBrowserOrigin
  });
}
