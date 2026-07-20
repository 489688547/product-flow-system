import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function gitCommonDir(root) {
  return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

export function resolveSharedEnvPath(root, options = {}) {
  const local = resolve(root, ".env");
  if (existsSync(local)) return local;
  const resolveCommonDir = options.resolveCommonDir || gitCommonDir;
  try {
    const shared = resolve(dirname(resolveCommonDir(root)), ".env");
    if (existsSync(shared)) return shared;
  } catch {
    // The caller reports one safe missing-env error below.
  }
  return local;
}

export function parseLocalEnv(source) {
  const values = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function loadSharedEnv(root, options = {}) {
  const envPath = options.envPath || resolveSharedEnvPath(root, options);
  if (!existsSync(envPath)) throw new Error("缺少共享 .env，请先在主项目目录配置个人令牌和平台连接。");
  return { envPath, values: parseLocalEnv(readFileSync(envPath, "utf8")) };
}
