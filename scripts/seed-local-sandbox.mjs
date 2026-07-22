// 本地沙箱播种脚本：为 `npm run start:sandbox`（本地 D1 模式）准备数据库。
// 1) 将全部迁移应用到本地 D1；2) 从生产库（只读 CLI 查询）复制当前个人令牌对应的
// 身份行与令牌哈希行到本地库。不读取、不打印 .env 明文令牌。
// 用法：node scripts/seed-local-sandbox.mjs
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = "wrangler.local.toml";
const DB = "product-flow-system";

function wrangler(args, { input } = {}) {
  const bin = resolve(ROOT, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  const result = spawnSync(bin, args, { cwd: ROOT, input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(" ")} 失败：\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function d1Local(sql) {
  wrangler(["d1", "execute", DB, "--local", "--config", CONFIG, "--command", sql]);
}

function d1RemoteJson(sql) {
  const out = wrangler(["d1", "execute", DB, "--remote", "--json", "--command", sql]);
  const start = out.indexOf("[");
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results || [];
}

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

console.log("1/3 应用迁移到本地 D1...");
const migrations = readdirSync(resolve(ROOT, "migrations")).filter(name => name.endsWith(".sql")).sort();
for (const file of migrations) {
  wrangler(["d1", "execute", DB, "--local", "--config", CONFIG, "--file", resolve(ROOT, "migrations", file)]);
  console.log(`  ✓ ${file}`);
}

console.log("2/3 从生产库只读复制身份与令牌哈希...");
const tokens = d1RemoteJson(
  "SELECT token_hash, user_id, union_id, name, capabilities, created_at FROM production_data_access_tokens WHERE revoked_at IS NULL"
);
if (!tokens.length) throw new Error("生产库中没有有效的生产数据个人令牌。");
const token = tokens[0];
const members = d1RemoteJson(
  `SELECT corp_id, user_id, union_id, name, department, title, role, active FROM product_flow_org_members WHERE user_id = '${token.user_id}'`
);
if (!members.length) throw new Error(`生产库中找不到 user_id=${token.user_id} 的组织成员。`);
const member = members[0];

console.log("3/3 写入本地库...");
d1Local(`CREATE TABLE IF NOT EXISTS product_flow_org_members (
  corp_id TEXT NOT NULL, user_id TEXT NOT NULL, union_id TEXT, name TEXT NOT NULL,
  department TEXT, title TEXT, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL, PRIMARY KEY (corp_id, user_id)
)`);
d1Local(`INSERT OR REPLACE INTO product_flow_org_members (corp_id, user_id, union_id, name, department, title, role, active, synced_at)
  VALUES (${quote(member.corp_id)}, ${quote(member.user_id)}, ${quote(member.union_id)}, ${quote(member.name)},
    ${quote(member.department)}, ${quote(member.title)}, ${quote(member.role)}, ${Number(member.active) || 0}, ${quote(new Date().toISOString())})`);
d1Local(`INSERT OR REPLACE INTO production_data_access_tokens (token_hash, user_id, union_id, name, capabilities, created_at, expires_at, revoked_at, last_used_at)
  VALUES (${quote(token.token_hash)}, ${quote(token.user_id)}, ${quote(token.union_id)}, ${quote(token.name)},
    ${quote(token.capabilities)}, ${quote(token.created_at)}, NULL, NULL, NULL)`);

console.log(`完成。本地沙箱身份：${member.name}（${member.role}）。现在可以运行 npm run start:sandbox`);
