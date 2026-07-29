#!/usr/bin/env node
import { resolve } from "node:path";
import { importLocalD1 } from "./d1-transfer.mjs";

const exportDir = resolve(process.argv[2] || "");
const persistDir = resolve(process.argv[3] || "");
if (!process.argv[2] || !process.argv[3]) {
  console.error("用法：node scripts/aliyun/import-local-d1.mjs /绝对路径/导出目录 /绝对路径/持久化目录");
  process.exitCode = 1;
} else {
  importLocalD1({ exportDir, persistDir })
    .then(result => console.log(`已导入 ${result.databases.length} 个数据库：${persistDir}`))
    .catch(error => {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    });
}
