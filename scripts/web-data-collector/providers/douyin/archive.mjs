import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_DOUYIN_ARCHIVE_ROOT = path.join(
  os.homedir(),
  "Desktop",
  "公司数据中心",
  "抖店罗盘"
);

function archiveError(code, message) {
  const error = new Error(message);
  error.name = "DouyinArchiveError";
  error.code = code;
  error.retryable = false;
  return error;
}

function safeSegment(value, code, message) {
  const text = String(value || "").trim();
  if (!/^[-_a-zA-Z0-9]{1,160}$/.test(text)) throw archiveError(code, message);
  return text;
}

function safeFileName(value) {
  return path.basename(String(value || "report"))
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\:]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180) || "report";
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function archiveDouyinReport({
  filePath,
  rootDir = DEFAULT_DOUYIN_ARCHIVE_ROOT,
  storeId,
  resourceType,
  businessDate
} = {}) {
  const source = path.resolve(String(filePath || ""));
  const details = await stat(source).catch(() => null);
  if (!details?.isFile()) throw archiveError("DOUYIN_ARCHIVE_FILE_REQUIRED", "抖店待归档报表不是有效文件。");
  const store = safeSegment(storeId, "DOUYIN_ARCHIVE_STORE_INVALID", "抖店归档店铺标识无效。");
  const resource = safeSegment(resourceType, "DOUYIN_ARCHIVE_RESOURCE_INVALID", "抖店归档资源标识无效。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate || ""))) {
    throw archiveError("DOUYIN_ARCHIVE_DATE_INVALID", "抖店归档业务日期无效。");
  }
  const sha256 = await hashFile(source);
  const extension = path.extname(source).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const relativeArchiveKey = path.posix.join(
    "douyin-ecommerce",
    store,
    resource,
    businessDate.slice(0, 4),
    businessDate.slice(5, 7),
    businessDate,
    `${sha256}${extension}`
  );
  const root = path.resolve(rootDir);
  const archivedFilePath = path.join(root, ...relativeArchiveKey.split("/"));
  await mkdir(path.dirname(archivedFilePath), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(archivedFilePath), 0o700);
  const existing = await stat(archivedFilePath).catch(() => null);
  if (existing) {
    if (!existing.isFile() || existing.size !== details.size || await hashFile(archivedFilePath) !== sha256) {
      throw archiveError("DOUYIN_ARCHIVE_HASH_CONFLICT", "抖店相同归档键对应的文件内容不一致。");
    }
  } else {
    await copyFile(source, archivedFilePath);
    await chmod(archivedFilePath, 0o600);
    if (await hashFile(archivedFilePath) !== sha256) {
      throw archiveError("DOUYIN_ARCHIVE_COPY_HASH_MISMATCH", "抖店原始报表归档校验失败。");
    }
  }
  return {
    sha256,
    relativeArchiveKey,
    archivedFilePath,
    fileName: safeFileName(source),
    sizeBytes: details.size,
    deduplicated: Boolean(existing)
  };
}
