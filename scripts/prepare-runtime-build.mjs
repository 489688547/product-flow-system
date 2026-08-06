import { execFileSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const source = await readFile(path.join(dist, "index.html"), "utf8");
const releaseCommit = String(
  process.env.GITHUB_SHA
  || process.env.CF_PAGES_COMMIT_SHA
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })
).trim().toLowerCase();
if (!/^[0-9a-f]{7,40}$/.test(releaseCommit)) {
  throw new Error("无法确定发布 commit。");
}

const apiOrigin = String(process.env.VITE_PFS_API_ORIGIN || "").trim();
if (apiOrigin) {
  let parsed;
  try {
    parsed = new URL(apiOrigin);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("VITE_PFS_API_ORIGIN 必须是 HTTPS Origin。");
  }
}

const releaseMeta = `<meta name="pfs-release-commit" content="${releaseCommit}">`;
const entry = source.includes('name="pfs-release-commit"')
  ? source.replace(/<meta\s+name="pfs-release-commit"[^>]*>/, releaseMeta)
  : source.replace("</head>", `    ${releaseMeta}\n  </head>`);

await writeFile(path.join(dist, "index.html"), entry);
await copyFile(path.join(root, "_headers"), path.join(dist, "_headers"));
await copyFile(path.join(root, "_redirects"), path.join(dist, "_redirects"));

console.log("Prepared runtime static build output in dist.");
