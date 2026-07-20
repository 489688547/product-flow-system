import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const releaseAssets = path.join(root, "assets");

await rm(releaseAssets, { recursive: true, force: true });
await mkdir(releaseAssets, { recursive: true });
await cp(path.join(dist, "assets"), releaseAssets, { recursive: true });
await copyFile(path.join(dist, "404.html"), path.join(root, "404.html"));
await copyFile(path.join(dist, "cloudflare-entry.html"), path.join(root, "cloudflare-entry.html"));
await copyFile(path.join(dist, "_headers"), path.join(root, "_headers"));
await copyFile(path.join(dist, "_redirects"), path.join(root, "_redirects"));

console.log("Prepared Cloudflare Pages release files in the repository root.");
