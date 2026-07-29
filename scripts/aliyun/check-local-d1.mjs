#!/usr/bin/env node
import { execFile } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { DATABASES } from "./d1-transfer.mjs";

const execFileAsync = promisify(execFile);

async function query(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout;
}

export async function checkLocalD1({
  persistDir,
  configPath = resolve("deploy/aliyun/wrangler.toml"),
  runQuery = query,
  wranglerBin = "npx"
}) {
  if (!persistDir || !isAbsolute(persistDir)) throw new Error("persistDir 必须是绝对路径。");
  if (!configPath || !isAbsolute(configPath)) throw new Error("configPath 必须是绝对路径。");
  const checks = [];
  for (const database of DATABASES) {
    const stdout = await runQuery(wranglerBin, [
      ...(wranglerBin === "npx" ? ["wrangler"] : []),
      "d1",
      "execute",
      database.name,
      "--local",
      "--config",
      configPath,
      "--persist-to",
      persistDir,
      "--command",
      "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table';",
      "--json"
    ]);
    const payload = JSON.parse(stdout);
    const result = Array.isArray(payload) ? payload[0] : payload;
    const tableCount = Number(result?.results?.[0]?.table_count);
    if (result?.success !== true || !Number.isInteger(tableCount) || tableCount < 1) {
      throw new Error(`${database.name} 本地数据库校验失败。`);
    }
    checks.push({ name: database.name, tableCount });
  }
  return checks;
}

const persistDir = process.argv[2] ? resolve(process.argv[2]) : "";
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!persistDir) {
    console.error("用法：node scripts/aliyun/check-local-d1.mjs /绝对路径/持久化目录");
    process.exitCode = 1;
  } else {
    checkLocalD1({ persistDir })
      .then(checks => {
        for (const check of checks) console.log(`${check.name}: ${check.tableCount} tables`);
      })
      .catch(error => {
        console.error(error?.message || String(error));
        process.exitCode = 1;
      });
  }
}
