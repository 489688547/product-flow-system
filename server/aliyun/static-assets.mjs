import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
});

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

function safePath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return "";
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return "";
  const candidate = resolve(root, `.${decoded}`);
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : "";
}

async function existingFile(path) {
  try {
    const metadata = await stat(path);
    return metadata.isFile() ? path : "";
  } catch {
    return "";
  }
}

export function createStaticAssetBinding({ root }) {
  const assetRoot = resolve(String(root || ""));
  const indexPath = resolve(assetRoot, "index.html");
  return Object.freeze({
    async fetch(request) {
      if (!["GET", "HEAD"].includes(request.method)) return notFound();
      const url = new URL(request.url);
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return notFound();
      const requestedPath = url.pathname === "/" ? indexPath : safePath(assetRoot, url.pathname);
      const directFile = requestedPath ? await existingFile(requestedPath) : "";
      const file = directFile || (!extname(url.pathname) ? await existingFile(indexPath) : "");
      if (!file) return notFound();
      const immutable = url.pathname.startsWith("/assets/");
      const headers = {
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
        "content-type": CONTENT_TYPES[extname(file).toLowerCase()] || "application/octet-stream",
        "x-content-type-options": "nosniff"
      };
      return new Response(request.method === "HEAD" ? null : await readFile(file), { headers });
    }
  });
}
