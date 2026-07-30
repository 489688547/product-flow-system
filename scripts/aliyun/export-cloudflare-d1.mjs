#!/usr/bin/env node
import { resolve } from "node:path";
import { exportCloudflareD1 } from "./d1-transfer.mjs";

const exportDir = resolve(process.argv[2] || "");
if (!process.argv[2]) {
  console.error("用法：node scripts/aliyun/export-cloudflare-d1.mjs /绝对路径/导出目录");
  process.exitCode = 1;
} else {
  exportCloudflareD1({ exportDir })
    .then(manifest => console.log(`已导出 ${manifest.databases.length} 个数据库：${exportDir}`))
    .catch(error => {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    });
}
