import { execFileSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const source = await readFile(path.join(dist, "index.html"), "utf8");
const releaseCommit = String(
  process.env.CF_PAGES_COMMIT_SHA
  || process.env.GITHUB_SHA
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })
).trim().toLowerCase();
if (!/^[0-9a-f]{7,40}$/.test(releaseCommit)) {
  throw new Error("无法确定 Pages 发布 commit。");
}
const releaseMeta = `<meta name="pfs-release-commit" content="${releaseCommit}">`;
const entry = source.includes('name="pfs-release-commit"')
  ? source.replace(/<meta\s+name="pfs-release-commit"[^>]*>/, releaseMeta)
  : source.replace("</head>", `    ${releaseMeta}\n  </head>`);

await writeFile(path.join(dist, "index.html"), entry);
await writeFile(path.join(dist, "cloudflare-entry.html"), entry);
await copyFile(path.join(root, "_headers"), path.join(dist, "_headers"));
await copyFile(path.join(root, "_redirects"), path.join(dist, "_redirects"));
await copyFile(path.join(root, "public", "_routes.json"), path.join(dist, "_routes.json"));

console.log("Prepared complete Cloudflare Pages build output in dist.");
