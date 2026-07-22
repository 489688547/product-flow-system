import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  constants,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  statfs
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ARCHIVE_FOLDERS = {
  waiting: "待导入",
  archive: "原始归档",
  processed: "已处理",
  failed: "失败文件",
  reports: "处理报告"
};

export const DEFAULT_ARCHIVE_ROOT = path.join(os.homedir(), "Desktop", "公司数据中心", "快麦ERP");

function archiveError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function safeFileName(fileName) {
  const cleaned = path.basename(String(fileName || "export"))
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\:]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return cleaned || "export";
}

function safeResourceType(resourceType) {
  const value = String(resourceType || "unknown").trim();
  if (!/^[a-z][a-z0-9_]{1,48}$/.test(value)) {
    throw archiveError("KUAIMAI_ARCHIVE_RESOURCE_INVALID", "归档资源类型不合法。");
  }
  return value;
}

function yearMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw archiveError("KUAIMAI_ARCHIVE_DATE_INVALID", "归档时间不合法。");
  return date.toISOString().slice(0, 7);
}

async function ensurePrivateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}

export async function ensureArchiveLayout(root = DEFAULT_ARCHIVE_ROOT) {
  const resolvedRoot = path.resolve(root);
  const layout = {
    root: resolvedRoot,
    ...Object.fromEntries(Object.entries(ARCHIVE_FOLDERS).map(([key, folder]) => [key, path.join(resolvedRoot, folder)])),
    manifest: path.join(resolvedRoot, "manifest.jsonl")
  };
  await ensurePrivateDirectory(layout.root);
  for (const key of Object.keys(ARCHIVE_FOLDERS)) await ensurePrivateDirectory(layout[key]);
  return layout;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function inspectFileStability(filePath, previousSignature = null) {
  const details = await stat(filePath);
  if (!details.isFile()) throw archiveError("KUAIMAI_ARCHIVE_FILE_REQUIRED", "待归档路径不是文件。");
  const signature = `${details.size}:${Math.trunc(details.mtimeMs)}`;
  return {
    stable: Boolean(previousSignature && previousSignature === signature),
    signature,
    sizeBytes: details.size,
    modifiedAt: details.mtime.toISOString()
  };
}

async function assertDiskCapacity(directory, sourceBytes, reserveBytes) {
  const disk = await statfs(directory);
  const availableBytes = Number(disk.bavail) * Number(disk.bsize);
  const requiredBytes = sourceBytes + reserveBytes;
  if (availableBytes < requiredBytes) {
    throw archiveError("KUAIMAI_ARCHIVE_DISK_SPACE_LOW", "本地磁盘空间不足，已停止归档。", { availableBytes, requiredBytes });
  }
}

async function cloneOrCopy(sourcePath, targetPath) {
  try {
    await copyFile(sourcePath, targetPath, constants.COPYFILE_FICLONE);
    return "clone";
  } catch (error) {
    if (!["ENOTSUP", "EINVAL", "EXDEV", "ENOSYS"].includes(error?.code)) throw error;
    await copyFile(sourcePath, targetPath);
    return "copy";
  }
}

export async function archiveSourceFile(sourcePath, {
  root = DEFAULT_ARCHIVE_ROOT,
  resourceType,
  archivedAt = new Date().toISOString(),
  reserveBytes = 1024 ** 3
} = {}) {
  const source = path.resolve(sourcePath);
  const sourceStat = await stat(source);
  if (!sourceStat.isFile()) throw archiveError("KUAIMAI_ARCHIVE_FILE_REQUIRED", "待归档路径不是文件。");
  const layout = await ensureArchiveLayout(root);
  const type = safeResourceType(resourceType);
  const contentHash = await hashFile(source);
  const relativePath = path.posix.join(
    ARCHIVE_FOLDERS.archive,
    type,
    yearMonth(archivedAt),
    `${contentHash}__${safeFileName(source)}`
  );
  const absolutePath = path.join(layout.root, ...relativePath.split("/"));
  await ensurePrivateDirectory(path.dirname(absolutePath));
  try {
    const existing = await stat(absolutePath);
    if (!existing.isFile() || existing.size !== sourceStat.size || await hashFile(absolutePath) !== contentHash) {
      throw archiveError("KUAIMAI_ARCHIVE_HASH_CONFLICT", "相同归档路径已存在但内容不一致，已停止处理。");
    }
    return { contentHash, relativePath, absolutePath, sizeBytes: sourceStat.size, deduplicated: true, copyMethod: "existing" };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await assertDiskCapacity(path.dirname(absolutePath), sourceStat.size, reserveBytes);
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  let copyMethod;
  try {
    copyMethod = await cloneOrCopy(source, temporaryPath);
    await chmod(temporaryPath, 0o600);
    const copiedHash = await hashFile(temporaryPath);
    if (copiedHash !== contentHash) throw archiveError("KUAIMAI_ARCHIVE_COPY_HASH_MISMATCH", "归档副本校验失败，来源文件保持不变。");
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return { contentHash, relativePath, absolutePath, sizeBytes: sourceStat.size, deduplicated: false, copyMethod };
}

export async function appendManifestEvent(manifestPath, event) {
  const contentHash = String(event?.contentHash || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) {
    throw archiveError("KUAIMAI_ARCHIVE_HASH_INVALID", "manifest 事件缺少有效 SHA-256。");
  }
  const safeEvent = { ...event, contentHash, sourcePath: undefined, absolutePath: undefined };
  const handle = await open(manifestPath, "a", 0o600);
  try {
    await handle.appendFile(`${JSON.stringify(safeEvent)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  await chmod(manifestPath, 0o600);
}

export async function loadLocalManifest(manifestPath) {
  let contents;
  try {
    contents = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  const state = new Map();
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw archiveError("KUAIMAI_ARCHIVE_MANIFEST_INVALID", `manifest 第 ${index + 1} 行不是有效 JSON。`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(event.contentHash || ""))) {
      throw archiveError("KUAIMAI_ARCHIVE_MANIFEST_INVALID", `manifest 第 ${index + 1} 行缺少有效哈希。`);
    }
    state.set(event.contentHash, { ...(state.get(event.contentHash) || {}), ...event });
  }
  return state;
}

