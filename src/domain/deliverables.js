function normalizedType(file) {
  return String(file?.type || "").toLowerCase();
}

function extension(file) {
  const name = String(file?.name || "").toLowerCase();
  return name.includes(".") ? name.split(".").pop() : "";
}

function dataUrlType(file) {
  const match = String(file?.url || "").match(/^data:([^;,]+)/i);
  return String(match?.[1] || "").toLowerCase();
}

function hasVisibleHtml(content) {
  return String(content || "")
    .replace(/<img\b[^>]*>/gi, "image")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim().length > 0;
}

export function deliverableKind(file) {
  const type = normalizedType(file);
  const urlType = dataUrlType(file);
  const ext = extension(file);
  if (type === "richtext") return "richtext";
  if (type === "dingtalk-doc" || type === "link") return "link";
  if (type.startsWith("image") || urlType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  if (type.startsWith("video") || urlType.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  if (type.includes("pdf") || urlType === "application/pdf" || ext === "pdf") return "pdf";
  return "file";
}

export function isBrokenDeliverable(file) {
  if (!file || file.broken) return true;
  if (deliverableKind(file) === "richtext") return !hasVisibleHtml(file.content);
  const url = String(file.url || "").trim();
  return !url || url === "#";
}

export function canDownloadDeliverable(file, origin = globalThis.location?.origin) {
  const url = String(file?.url || "").trim();
  if (!url || url === "#") return false;
  if (/^(data|blob):/i.test(url) || url.startsWith("/")) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
  if (!origin) return false;
  try {
    return new URL(url, origin).origin === origin;
  } catch {
    return false;
  }
}

export function deliverableExtension(file) {
  return extension(file).toUpperCase() || (deliverableKind(file) === "link" ? "链接" : "文件");
}
