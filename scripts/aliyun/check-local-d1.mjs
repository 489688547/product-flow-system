#!/usr/bin/env node
import { execFile } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { DATABASES, localD1DatabasePath } from "./d1-transfer.mjs";

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
  runQuery = query,
  sqliteBin = "sqlite3"
}) {
  if (!persistDir || !isAbsolute(persistDir)) throw new Error("persistDir 必须是绝对路径。");
  const checks = [];
  for (const database of DATABASES) {
    const databasePath = localD1DatabasePath(persistDir, database);
    const stdout = await runQuery(sqliteBin, [
      databasePath,
      "PRAGMA quick_check; SELECT COUNT(*) FROM sqlite_master WHERE type = 'table';"
    ]);
    const [quickCheck, count] = stdout.trim().split(/\s+/);
    const tableCount = Number(count);
    if (quickCheck !== "ok" || !Number.isInteger(tableCount) || tableCount < 1) {
      throw new Error(`${database.name} 本地数据库校验失败。`);
    }
    checks.push({ name: database.name, tableCount, quickCheck });
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
