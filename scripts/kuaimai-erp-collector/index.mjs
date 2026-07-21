#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { uploadErpCollection } from "./api.mjs";
import { readKuaimaiExport } from "./core.mjs";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

export async function runCollector(argv = process.argv.slice(2)) {
  const command = argv[0] || "preflight";
  const filePath = argv[1];
  if (!filePath) throw new Error("用法：npm run collect:kuaimai -- preflight|upload <导出文件> --resource orders");
  const resourceType = argument("--resource", "orders");
  const parsed = await readKuaimaiExport(resolve(filePath), { resourceType });
  if (command === "preflight") {
    return {
      ready: true,
      batch: parsed.batch,
      headers: parsed.headers,
      issueCount: parsed.issues.length,
      issues: parsed.issues.slice(0, 20),
      preview: parsed.preview
    };
  }
  if (command === "upload") {
    return uploadErpCollection(parsed, { baseUrl: argument("--base-url", process.env.KUAIMAI_ERP_BASE_URL || "http://127.0.0.1:8132") });
  }
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCollector().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.code ? `${error.code}: ` : ""}${error.message}\n`);
    if (error.details) process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    process.exitCode = 1;
  });
}
