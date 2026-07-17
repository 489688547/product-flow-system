import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { MAX_CHUNK_BYTES, findOversizedChunks } from "./build-chunks.mjs";

const assetsDirectory = resolve(process.cwd(), "dist/assets");
const entries = await readdir(assetsDirectory);
const files = await Promise.all(entries.map(async name => ({
  name,
  size: (await stat(resolve(assetsDirectory, name))).size
})));
const oversizedChunks = findOversizedChunks(files);

if (oversizedChunks.length) {
  for (const file of oversizedChunks) {
    console.error(`${file.name}: ${file.size.toLocaleString()} bytes exceeds ${MAX_CHUNK_BYTES.toLocaleString()} bytes`);
  }
  process.exitCode = 1;
} else {
  console.log(`All production JavaScript chunks are within ${MAX_CHUNK_BYTES.toLocaleString()} bytes.`);
}
