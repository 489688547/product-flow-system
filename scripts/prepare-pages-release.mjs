import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const releaseAssets = path.join(root, "assets");

await rm(releaseAssets, { recursive: true, force: true });
await mkdir(releaseAssets, { recursive: true });
await cp(path.join(dist, "assets"), releaseAssets, { recursive: true });
await cp(path.join(dist, "404.html"), path.join(root, "404.html"));

const entry = await readFile(path.join(dist, "index.html"), "utf8");
await writeFile(path.join(root, "cloudflare-entry.html"), entry);
await writeFile(path.join(root, "_redirects"), "/ /cloudflare-entry.html 200\n");

console.log("Prepared Cloudflare Pages release files in the repository root.");
