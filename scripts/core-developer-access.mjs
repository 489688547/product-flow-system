import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseLocalEnv } from "./shared-local-env.mjs";

export class DeveloperAccessError extends Error {
  constructor(message, code = "DEVELOPER_ACCESS_INVALID") {
    super(message);
    this.name = "DeveloperAccessError";
    this.code = code;
  }
}

export function developerAccessPath(homeDir = homedir()) {
  return join(homeDir, ".config", "product-flow-system", "developer.env");
}

function productionOrigin(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    url = null;
  }
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new DeveloperAccessError("开发权限文件中的生产 API 必须是 HTTPS Origin。");
  }
  return url.origin;
}

export async function loadDeveloperAccess({ homeDir = homedir() } = {}) {
  const path = developerAccessPath(homeDir);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new DeveloperAccessError("无法读取开发权限文件。", "DEVELOPER_ACCESS_UNREADABLE");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new DeveloperAccessError("开发权限路径必须是普通文件。");
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new DeveloperAccessError("开发权限文件必须设置为 0600。", "DEVELOPER_ACCESS_MODE_INVALID");
  }
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new DeveloperAccessError("开发权限文件必须属于当前用户。", "DEVELOPER_ACCESS_OWNER_INVALID");
  }

  let values;
  try {
    values = parseLocalEnv(await readFile(path, "utf8"));
  } catch {
    throw new DeveloperAccessError("无法解析开发权限文件。", "DEVELOPER_ACCESS_UNREADABLE");
  }
  const token = String(values.PRODUCTION_DATA_ACCESS_TOKEN || "").trim();
  if (!token) throw new DeveloperAccessError("开发权限文件缺少个人 Token。");

  return Object.freeze({
    path,
    apiUrl: productionOrigin(values.PRODUCTION_DATA_API_URL),
    token
  });
}

export function selectLocalRuntime({ access } = {}) {
  return access ? "core" : "sandbox";
}

