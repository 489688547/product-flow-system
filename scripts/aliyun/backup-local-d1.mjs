#!/usr/bin/env node
import { resolve } from "node:path";
import { backupLocalD1 } from "./d1-transfer.mjs";

const backupDir = resolve(process.argv[2] || "");
const persistDir = resolve(process.argv[3] || "");
if (!process.argv[2] || !process.argv[3]) {
  console.error("用法：node scripts/aliyun/backup-local-d1.mjs /绝对路径/备份目录 /绝对路径/持久化目录");
  process.exitCode = 1;
} else {
  backupLocalD1({
    backupDir,
    persistDir,
    ossUri: process.env.OSS_BACKUP_URI || ""
  })
    .then(manifest => console.log(`已备份 ${manifest.databases.length} 个数据库：${backupDir}`))
    .catch(error => {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    });
}
