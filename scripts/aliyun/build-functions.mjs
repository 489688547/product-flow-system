import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function buildAliyunFunctions({
  projectDir = process.cwd(),
  outDir = resolve(projectDir, "dist-server"),
  run = execFileAsync
} = {}) {
  const root = resolve(projectDir);
  const output = resolve(outDir);
  const wrangler = join(root, "node_modules", ".bin", "wrangler");
  await mkdir(output, { recursive: true, mode: 0o755 });
  await run(wrangler, [
    "pages", "functions", "build", join(root, "functions"),
    "--outdir", output,
    "--output-config-path", join(output, "config.json"),
    "--output-routes-path", join(output, "routes.json"),
    "--compatibility-date", "2026-07-18"
  ], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  return Object.freeze({
    bundlePath: join(output, "index.js"),
    configPath: join(output, "config.json"),
    routesPath: join(output, "routes.json")
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  buildAliyunFunctions().catch(error => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
