import { spawn as spawnNode } from "node:child_process";
import { mkdir as mkdirNode } from "node:fs/promises";
import { readFile as readFileNode } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

const MANAGED_PROVIDERS = new Set(["douyin-ecommerce", "kuaimai", "qianchuan"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const CHROME_BINARY = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function personalChromeRoots() {
  const home = homedir();
  return [
    join(home, "Library", "Application Support", "Google", "Chrome"),
    join(home, "Library", "Application Support", "Chromium"),
    join(home, ".config", "google-chrome"),
    join(home, ".config", "chromium")
  ].map(value => resolve(value));
}

function isWithin(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

export function normalizeLoopbackEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("Chrome 调试地址无效。");
  }
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (endpoint.protocol !== "http:" || !loopbackHosts.has(endpoint.hostname) || !endpoint.port) {
    throw new Error("Chrome 调试端口只允许绑定本机。");
  }
  endpoint.username = "";
  endpoint.password = "";
  endpoint.pathname = "";
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString().replace(/\/$/, "");
}

export function managedChromeProfile({ providerId, storeId, rootDir }) {
  const provider = String(providerId || "").trim();
  const store = String(storeId || "").trim();
  if (!MANAGED_PROVIDERS.has(provider)) throw new Error("未登记的 Chrome Provider。");
  if (!SAFE_ID.test(store)) throw new Error("Chrome 店铺标识无效。");
  if (!isAbsolute(rootDir || "")) throw new Error("Chrome 托管 Profile 根目录无效。");
  const resolvedRoot = resolve(rootDir);
  if (personalChromeRoots().some(personalRoot => isWithin(resolvedRoot, personalRoot))) {
    throw new Error("禁止使用个人 Chrome 默认 Profile。");
  }
  const profileDir = resolve(resolvedRoot, provider, store);
  if (!isWithin(profileDir, resolvedRoot)) throw new Error("Chrome 店铺 Profile 路径无效。");
  return {
    providerId: provider,
    storeId: store,
    profileKey: `${provider}:${store}`,
    profileDir
  };
}

export async function readDevToolsActivePort(profileDir, options = {}) {
  const readFile = options.readFile || readFileNode;
  const content = await readFile(join(profileDir, "DevToolsActivePort"), "utf8");
  const [portLine, browserPath = ""] = String(content).trim().split(/\r?\n/);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Chrome 调试端口文件无效。");
  }
  if (browserPath && !browserPath.startsWith("/devtools/browser/")) {
    throw new Error("Chrome 调试端口文件无效。");
  }
  return {
    port,
    endpoint: `http://127.0.0.1:${port}`,
    browserPath
  };
}

export async function managedEndpointReady(endpoint, fetchImpl = fetch) {
  const safeEndpoint = normalizeLoopbackEndpoint(endpoint);
  try {
    return (await fetchImpl(`${safeEndpoint}/json/version`)).ok;
  } catch {
    return false;
  }
}

function launchVisibleChrome(profileDir, options = {}) {
  const process = (options.spawn || spawnNode)(options.binary || CHROME_BINARY, [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${Number.isInteger(options.port) ? options.port : 0}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check"
  ], { detached: true, stdio: "ignore" });
  process.unref();
  return process;
}

export async function ensureManagedChrome(profile, options = {}) {
  if (!profile?.profileDir || !profile?.profileKey) {
    throw new Error("Chrome 托管 Profile 未登记。");
  }
  const readActivePort = options.readActivePort || readDevToolsActivePort;
  const endpointReady = options.endpointReady || managedEndpointReady;
  const now = options.now || (() => new Date());
  try {
    const active = await readActivePort(profile.profileDir);
    if (await endpointReady(active.endpoint)) {
      return {
        ...profile,
        endpoint: normalizeLoopbackEndpoint(active.endpoint),
        online: true,
        reused: true,
        lastSeenAt: now().toISOString()
      };
    }
  } catch {
    // A missing or stale DevToolsActivePort is the normal launch path.
  }

  await (options.mkdir || mkdirNode)(profile.profileDir, { recursive: true });
  launchVisibleChrome(profile.profileDir, options);
  const wait = options.wait || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const attempts = Number.isInteger(options.attempts) ? options.attempts : 40;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(250);
    try {
      const active = await readActivePort(profile.profileDir);
      if (!await endpointReady(active.endpoint)) continue;
      return {
        ...profile,
        endpoint: normalizeLoopbackEndpoint(active.endpoint),
        online: true,
        reused: false,
        lastSeenAt: now().toISOString()
      };
    } catch {
      // Chrome writes DevToolsActivePort after its profile is ready.
    }
  }
  throw new Error("无法启动公司 Mac 的专用 Chrome 采集窗口。");
}

export function safeManagedChromeStatus(profile = {}) {
  return {
    providerId: String(profile.providerId || ""),
    storeId: String(profile.storeId || ""),
    profileKey: String(profile.profileKey || ""),
    online: profile.online === true,
    lastSeenAt: profile.lastSeenAt || null
  };
}
