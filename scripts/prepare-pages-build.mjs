import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const entry = await readFile(path.join(dist, "index.html"), "utf8");

await writeFile(path.join(dist, "cloudflare-entry.html"), entry);
await copyFile(path.join(root, "_headers"), path.join(dist, "_headers"));
await copyFile(path.join(root, "_redirects"), path.join(dist, "_redirects"));

console.log("Prepared complete Cloudflare Pages build output in dist.");
