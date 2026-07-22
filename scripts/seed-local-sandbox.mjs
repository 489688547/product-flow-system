// 本地沙箱播种脚本：为 `npm run start:sandbox`（本地 D1 模式）准备数据库。
// 1) 将全部迁移应用到本地 D1（已有本地库时自动跳过，可反复重跑）；2) 从生产库
// （只读 CLI 查询）复制当前个人令牌对应的身份行与令牌哈希行到本地库。不读取、不打印 .env 明文令牌。
// 可选 --with-state：再从生产库只读复制共享业务状态（product_flow_state 与
// product_flow_state_parts，仅这两张白名单表，绝不触碰任何凭据/令牌/审计表），
// 让沙箱打开即见到与线上一致的业务数据；沙箱中的任何修改都只写本机。
// 用法：npm run seed:sandbox [-- --with-state]（等价 node scripts/seed-local-sandbox.mjs）
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
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

function d1LocalJson(sql) {
  const out = wrangler(["d1", "execute", DB, "--local", "--config", CONFIG, "--json", "--command", sql]);
  const start = out.indexOf("[");
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results || [];
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

// 个别迁移含 ALTER TABLE RENAME，不能对已迁移的库重复执行；
// 已有本地库时跳过迁移，使 seed 可反复重跑以刷新身份与业务状态。
const alreadyMigrated = d1LocalJson(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_flow_state'"
).length > 0;
if (alreadyMigrated) {
  console.log("1/3 检测到本地库已迁移，跳过（新增迁移时需先清空 .wrangler/state 再重新播种）。");
} else {
  console.log("1/3 应用迁移到本地 D1...");
  const migrations = readdirSync(resolve(ROOT, "migrations")).filter(name => name.endsWith(".sql")).sort();
  for (const file of migrations) {
    wrangler(["d1", "execute", DB, "--local", "--config", CONFIG, "--file", resolve(ROOT, "migrations", file)]);
    console.log(`  ✓ ${file}`);
  }
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

console.log(`完成。本地沙箱身份：${member.name}（${member.role}）。`);

if (process.argv.includes("--with-state")) {
  console.log("附加：从生产库只读复制共享业务状态（仅 product_flow_state / product_flow_state_parts）...");
  const states = d1RemoteJson(
    "SELECT id, version, payload, updated_at, updated_by FROM product_flow_state"
  );
  const parts = d1RemoteJson(
    "SELECT state_id, part_key, part_index, payload, updated_at, updated_by FROM product_flow_state_parts"
  );
  // 状态里可能内嵌 base64 图片，单分片可达数百 KB，超过本地 SQLite 的单语句上限
  //（实测 50KB 可过、100KB 触发 SQLITE_TOOBIG）。服务端读取端按 part_index 顺序拼接
  // 分片（functions/api/state.js deserializeStateParts），因此把大 payload 按
  // 10_000 字符无损切片写入多行即可，不改动任何业务数据。
  const SHARD_CHARS = 10_000;
  function shardPayload(payload) {
    const text = String(payload ?? "");
    const chunks = [];
    for (let index = 0; index * SHARD_CHARS < text.length; index += 1) {
      chunks.push(text.slice(index * SHARD_CHARS, (index + 1) * SHARD_CHARS));
    }
    return chunks.length ? chunks : [""];
  }
  // 统一写入临时 SQL 文件后用 --file 一次性执行，避免 --command 参数长度上限。
  const statements = [
    ...states.map(row => `INSERT OR REPLACE INTO product_flow_state (id, version, payload, updated_at, updated_by)
      VALUES (${quote(row.id)}, ${quote(row.version)}, ${quote(row.payload)}, ${quote(row.updated_at)}, ${quote(row.updated_by)})`),
    ...parts.flatMap(row => [
      `DELETE FROM product_flow_state_parts WHERE state_id = ${quote(row.state_id)} AND part_key = ${quote(row.part_key)}`,
      ...shardPayload(row.payload).map((chunk, shardIndex) =>
        `INSERT INTO product_flow_state_parts (state_id, part_key, part_index, payload, updated_at, updated_by)
      VALUES (${quote(row.state_id)}, ${quote(row.part_key)}, ${shardIndex}, ${quote(chunk)},
        ${quote(row.updated_at)}, ${quote(row.updated_by)})`)
    ])
  ];
  const tempFile = resolve(ROOT, ".wrangler", "sandbox-state-seed.sql");
  mkdirSync(dirname(tempFile), { recursive: true });
  writeFileSync(tempFile, `${statements.join(";\n")};\n`, "utf8");
  try {
    wrangler(["d1", "execute", DB, "--local", "--config", CONFIG, "--file", tempFile]);
  } finally {
    unlinkSync(tempFile);
  }
  const shardCount = parts.reduce((total, row) => total + shardPayload(row.payload).length, 0);
  console.log(`  ✓ 已复制 ${states.length} 行状态与 ${parts.length} 个分片键（无损切为 ${shardCount} 行；凭据/令牌/审计表一律不复制）。`);
}

console.log("现在可以运行 npm run start:sandbox");
