// Applies all migrations to the two local SQLite bindings. It never reads production data.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = "wrangler.toml";
const DATABASES = ["product-flow-system-local", "product-flow-system-display-local"];

function wrangler(args) {
  const bin = resolve(ROOT, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  const result = spawnSync(bin, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`本地 SQLite 初始化失败：${result.stderr || result.stdout}`);
  return result.stdout;
}

if (process.argv.includes("--with-state")) {
  throw new Error("已取消从生产库复制状态；共享数据验收请使用 https://test.deshan-tiyes.cn。");
}

const migrations = readdirSync(resolve(ROOT, "migrations")).filter(name => name.endsWith(".sql")).sort();
for (const database of DATABASES) {
  const existing = wrangler([
    "d1", "execute", database, "--local", "--config", CONFIG, "--json",
    "--command", "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_flow_state'"
  ]);
  const migrated = existing.includes("product_flow_state");
  if (migrated) {
    console.log(`${database} 已初始化；跳过已有迁移。`);
    continue;
  }
  for (const file of migrations) {
    wrangler(["d1", "execute", database, "--local", "--config", CONFIG, "--file", resolve(ROOT, "migrations", file)]);
  }
  console.log(`${database} 本地迁移完成。`);
}

console.log("本地 SQLite 沙箱已就绪；运行 npm start 后使用钉钉登录。生产与测试数据不会复制到本机。");
