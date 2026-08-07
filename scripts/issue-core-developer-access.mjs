#!/usr/bin/env node
import { createHash, randomBytes as secureRandomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createD1Database } from "../server/aliyun/sqlite-d1.mjs";

const CAPABILITIES = Object.freeze(["read", "write", "core_developer"]);

export class CoreDeveloperIssuanceError extends Error {
  constructor(message, code = "CORE_DEVELOPER_ISSUANCE_FAILED") {
    super(message);
    this.name = "CoreDeveloperIssuanceError";
    this.code = code;
  }
}

function safeOrigin(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new CoreDeveloperIssuanceError("生产 API 必须是 HTTPS Origin。", "CORE_DEVELOPER_API_INVALID");
  }
  return url.origin;
}

function inside(path, root) {
  const offset = relative(resolve(root), resolve(path));
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

async function assertExternalOutput(outputPath, repositoryRoots) {
  if (!isAbsolute(outputPath)) {
    throw new CoreDeveloperIssuanceError("输出文件必须使用绝对路径。", "CORE_DEVELOPER_OUTPUT_INVALID");
  }
  const target = resolve(outputPath);
  const roots = repositoryRoots.map(root => resolve(root));
  if (roots.some(root => inside(target, root))) {
    throw new CoreDeveloperIssuanceError("开发权限文件不得写入 Git 仓库。", "CORE_DEVELOPER_OUTPUT_FORBIDDEN");
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const parent = await realpath(dirname(target));
  if (roots.some(root => inside(parent, root))) {
    throw new CoreDeveloperIssuanceError("开发权限文件不得经由链接写入 Git 仓库。", "CORE_DEVELOPER_OUTPUT_FORBIDDEN");
  }
  try {
    await lstat(target);
    throw new CoreDeveloperIssuanceError("输出文件已存在。", "CORE_DEVELOPER_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof CoreDeveloperIssuanceError) throw error;
    if (error?.code !== "ENOENT") {
      throw new CoreDeveloperIssuanceError("无法检查输出文件。", "CORE_DEVELOPER_OUTPUT_INVALID");
    }
  }
  return target;
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS production_data_access_tokens (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, union_id TEXT NOT NULL, name TEXT NOT NULL,
    capabilities TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, last_used_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS production_data_audit (
    id TEXT PRIMARY KEY, action TEXT NOT NULL, source_environment TEXT NOT NULL,
    user_id TEXT NOT NULL, union_id TEXT, name TEXT NOT NULL, reason TEXT NOT NULL,
    snapshot_id TEXT, before_version TEXT, before_updated_at TEXT,
    after_version TEXT, after_updated_at TEXT, status TEXT NOT NULL,
    request_id TEXT NOT NULL, created_at TEXT NOT NULL
  )`).run();
}

function parseCapabilities(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function issueCoreDeveloperAccess({
  db,
  userId,
  outputPath,
  apiUrl,
  expiresAt = null,
  now = new Date(),
  randomBytes = secureRandomBytes,
  repositoryRoots = discoverRepositoryRoots(),
  createId = randomUUID
}) {
  if (!db) throw new CoreDeveloperIssuanceError("缺少控制数据库。", "CORE_DEVELOPER_STORAGE_REQUIRED");
  const stableUserId = String(userId || "").trim();
  if (!stableUserId) throw new CoreDeveloperIssuanceError("缺少稳定钉钉 userId。", "CORE_DEVELOPER_USER_REQUIRED");
  const origin = safeOrigin(apiUrl);
  const target = await assertExternalOutput(String(outputPath || ""), repositoryRoots);
  await ensureTables(db);

  const identity = await db.prepare(`SELECT corp_id, user_id, union_id, name, department, title, role, active
    FROM product_flow_org_members WHERE user_id = ?`).bind(stableUserId).first();
  if (!identity || !identity.active || !String(identity.union_id || "").trim() || !String(identity.name || "").trim()) {
    throw new CoreDeveloperIssuanceError("钉钉身份不存在、未启用或缺少稳定 unionId。", "CORE_DEVELOPER_IDENTITY_INVALID");
  }
  const existing = await db.prepare(`SELECT token_hash, capabilities, expires_at, revoked_at
    FROM production_data_access_tokens WHERE user_id = ?`).bind(stableUserId).all();
  const nowTime = now.getTime();
  const duplicate = (existing?.results || []).some(row =>
    !row.revoked_at
    && (!row.expires_at || Date.parse(row.expires_at) > nowTime)
    && parseCapabilities(row.capabilities).includes("core_developer")
  );
  if (duplicate) {
    throw new CoreDeveloperIssuanceError("该成员已有有效核心开发者 Token。", "CORE_DEVELOPER_TOKEN_EXISTS");
  }

  const rawToken = `pfs_dev_${Buffer.from(randomBytes(32)).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const fingerprint = tokenHash.slice(0, 12);
  const createdAt = now.toISOString();
  const normalizedExpiry = expiresAt ? new Date(expiresAt).toISOString() : null;
  const temporary = `${target}.${process.pid}.${createId()}.tmp`;
  const source = [
    `PRODUCTION_DATA_API_URL=${origin}`,
    `PRODUCTION_DATA_ACCESS_TOKEN=${rawToken}`,
    ""
  ].join("\n");

  await writeFile(temporary, source, { mode: 0o600, flag: "wx" });
  try {
    const auditId = `audit_${createId()}`;
    const requestId = `req_${createId()}`;
    await db.batch([
      db.prepare(`INSERT INTO production_data_access_tokens
        (token_hash, user_id, union_id, name, capabilities, created_at, expires_at, revoked_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`).bind(
        tokenHash,
        identity.user_id,
        identity.union_id,
        identity.name,
        JSON.stringify(CAPABILITIES),
        createdAt,
        normalizedExpiry
      ),
      db.prepare(`INSERT INTO production_data_audit
        (id, action, source_environment, user_id, union_id, name, reason, snapshot_id,
          before_version, before_updated_at, after_version, after_updated_at, status, request_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`).bind(
        auditId,
        "issue_core_developer_access",
        "operations",
        identity.user_id,
        identity.union_id,
        identity.name,
        `fingerprint:${fingerprint}`,
        "succeeded",
        requestId,
        createdAt
      )
    ]);
    try {
      await rename(temporary, target);
    } catch (error) {
      await db.prepare("UPDATE production_data_access_tokens SET revoked_at = ? WHERE token_hash = ?")
        .bind(new Date().toISOString(), tokenHash).run().catch(() => {});
      throw error;
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (error instanceof CoreDeveloperIssuanceError) throw error;
    throw new CoreDeveloperIssuanceError(error?.message || "核心开发者权限签发失败。");
  }

  return Object.freeze({ path: target, fingerprint, expiresAt: normalizedExpiry });
}

export function discoverRepositoryRoots(cwd = process.cwd()) {
  const roots = new Set();
  for (const args of [["rev-parse", "--show-toplevel"], ["rev-parse", "--path-format=absolute", "--git-common-dir"]]) {
    try {
      roots.add(execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    } catch {
      // The production image intentionally has no .git directory.
    }
  }
  return [...roots].filter(Boolean).map(root => resolve(root));
}

function cliOptions(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new CoreDeveloperIssuanceError("参数格式无效。", "CORE_DEVELOPER_ARGUMENT_INVALID");
    }
    values[name.slice(2)] = value;
  }
  return values;
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  if (!options.database || !options["user-id"] || !options.output || !options["api-url"]) {
    throw new CoreDeveloperIssuanceError(
      "用法：node scripts/issue-core-developer-access.mjs --database /绝对路径/control.sqlite --user-id ID --output /仓库外/developer.env --api-url https://deshan-tiyes.cn",
      "CORE_DEVELOPER_ARGUMENT_REQUIRED"
    );
  }
  const db = createD1Database({ file: resolve(options.database) });
  try {
    const result = await issueCoreDeveloperAccess({
      db,
      userId: options["user-id"],
      outputPath: options.output,
      apiUrl: options["api-url"],
      expiresAt: options["expires-at"] || null
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await db.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
