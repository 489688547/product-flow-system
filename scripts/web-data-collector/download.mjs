import { stat } from "node:fs/promises";
import path from "node:path";

function downloadError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function resolveSafeDownload({ directory, fileName, stabilityDelayMs = 750 }) {
  const name = String(fileName || "");
  if (!name || name !== path.basename(name) || name.includes("/") || name.includes("\\")) {
    throw downloadError("WEB_COLLECTION_DOWNLOAD_NAME_INVALID", "下载文件名无效。");
  }
  if (![".xlsx", ".xls", ".csv"].includes(path.extname(name).toLowerCase())) {
    throw downloadError("WEB_COLLECTION_DOWNLOAD_TYPE_INVALID", "下载文件类型不支持。");
  }
  const root = path.resolve(directory);
  const candidate = path.resolve(root, name);
  if (path.dirname(candidate) !== root) throw downloadError("WEB_COLLECTION_DOWNLOAD_NAME_INVALID", "下载文件超出允许目录。");
  let first;
  try {
    first = await stat(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") throw downloadError("WEB_COLLECTION_DOWNLOAD_NOT_FOUND", "下载文件尚未出现。");
    throw error;
  }
  if (!first.isFile() || first.size <= 0) throw downloadError("WEB_COLLECTION_DOWNLOAD_INCOMPLETE", "下载文件尚未完成。");
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Number(stabilityDelayMs) || 0)));
  const second = await stat(candidate);
  if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) {
    throw downloadError("WEB_COLLECTION_DOWNLOAD_INCOMPLETE", "下载文件仍在写入。");
  }
  return candidate;
}
