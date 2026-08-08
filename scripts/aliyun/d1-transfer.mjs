import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export const DATABASES = Object.freeze([
  Object.freeze({
    binding: "PRODUCT_FLOW_DB",
    name: "product-flow-system",
    file: "product-flow-system.sql",
    backupFile: "product-flow-system.sqlite"
  }),
  Object.freeze({
    binding: "DEMO_FLOW_DB",
    name: "product-flow-system-display",
    file: "product-flow-system-display.sql",
    backupFile: "product-flow-system-display.sqlite"
  })
]);

const IMPORT_MARKER = ".pfs-import-complete.json";
const MINIFLARE_D1_NAMESPACE = "miniflare-D1DatabaseObject";
const SQLITE_QUICK_CHECK_SCRIPT = [
  "import sqlite3, sys",
  "database = sqlite3.connect(sys.argv[1])",
  "checkpoint = database.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()",
  "if checkpoint and checkpoint[0] != 0: raise RuntimeError('SQLite WAL checkpoint busy: ' + str(checkpoint))",
  "result = database.execute('PRAGMA quick_check').fetchone()[0]",
  "database.close()",
  "if result != 'ok': raise RuntimeError('SQLite quick_check failed: ' + str(result))"
].join("\n");

function requiredAbsolutePath(value, name) {
  const path = resolve(String(value || ""));
  if (!value || !isAbsolute(String(value))) throw new Error(`${name} 必须是绝对路径。`);
  return path;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export function localD1DatabasePath(persistDir, database) {
  const persistence = requiredAbsolutePath(persistDir, "persistDir");
  if (!database?.binding) throw new Error("database.binding 不能为空。");
  const key = createHash("sha256").update(MINIFLARE_D1_NAMESPACE).digest();
  const nameHmac = createHmac("sha256", key)
    .update(database.binding)
    .digest()
    .subarray(0, 16);
  const hmac = createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16);
  const objectId = Buffer.concat([nameHmac, hmac]).toString("hex");
  return join(
    persistence,
    "v3",
    "d1",
    MINIFLARE_D1_NAMESPACE,
    `${objectId}.sqlite`
  );
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolvePromise();
      reject(new Error(`${command} 执行失败（code=${code ?? "null"}, signal=${signal ?? "none"}）。`));
    });
  });
}

async function verifiedManifest(exportDir) {
  const manifestPath = join(exportDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.databases)) {
    throw new Error("D1 导出清单格式无效。");
  }
  for (const database of DATABASES) {
    const entry = manifest.databases.find(item => item.name === database.name);
    if (!entry || entry.file !== database.file) {
      throw new Error(`D1 导出清单缺少 ${database.name}。`);
    }
    const actual = await sha256(join(exportDir, entry.file));
    if (actual !== entry.sha256) {
      throw new Error(`${database.name} 导出文件 SHA-256 校验失败。`);
    }
  }
  return manifest;
}

export async function importLocalD1({
  exportDir,
  persistDir,
  configPath = resolve("deploy/aliyun/wrangler.toml"),
  run = runCommand,
  wranglerBin = "npx",
  now = () => new Date().toISOString()
}) {
  const source = requiredAbsolutePath(exportDir, "exportDir");
  const destination = requiredAbsolutePath(persistDir, "persistDir");
  const config = requiredAbsolutePath(configPath, "configPath");
  const marker = join(destination, IMPORT_MARKER);
  if (await exists(marker)) {
    throw new Error(`目标目录已经完成过导入：${marker}`);
  }
  const manifest = await verifiedManifest(source);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const database of DATABASES) {
    await run(wranglerBin, [
      ...(wranglerBin === "npx" ? ["wrangler"] : []),
      "d1",
      "execute",
      database.name,
      "--local",
      "--config",
      config,
      "--persist-to",
      destination,
      "--file",
      join(source, database.file),
      "--yes"
    ]);
  }
  const result = {
    schemaVersion: 1,
    importedAt: now(),
    sourceCreatedAt: manifest.createdAt,
    databases: manifest.databases.map(({ name, file, bytes, sha256: hash }) => ({
      name,
      file,
      bytes,
      sha256: hash
    }))
  };
  await atomicJson(marker, result);
  return result;
}

function validateOssUri(value) {
  const uri = String(value || "").trim();
  if (!uri) return "";
  if (!/^oss:\/\/[a-z0-9][a-z0-9-]{1,61}[a-z0-9](?:\/.*)?\/$/.test(uri)) {
    throw new Error("OSS_BACKUP_URI 必须是以 / 结尾的私有 Bucket 地址，例如 oss://bucket/product-flow/。");
  }
  return uri;
}

export async function retainOnlyCurrentBackup({ backupDir, ossUri, manifest }) {
  const directory = requiredAbsolutePath(backupDir, "backupDir");
  if (!validateOssUri(ossUri)) throw new Error("OSS 上传成功证明不能为空。");
  const complete = DATABASES.every(database =>
    manifest?.databases?.some(entry =>
      entry.name === database.name && entry.file === database.backupFile
    )
  );
  if (!complete) throw new Error("备份清单不完整，拒绝清理本地快照。");

  const backupRoot = dirname(directory);
  const currentName = basename(directory);
  if (!currentName || join(backupRoot, currentName) !== directory) {
    throw new Error("当前备份目录必须是备份根目录的直接子目录。");
  }
  const entries = await readdir(backupRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name !== currentName && entry.isDirectory()) {
      await rm(join(backupRoot, entry.name), { recursive: true, force: true });
    }
  }
}

export async function backupLocalD1({
  backupDir,
  persistDir,
  ossUri = "",
  run = runCommand,
  ossutilBin = "ossutil",
  sqliteBin = "sqlite3",
  pythonBin = "python3",
  keepLocalBackups = null,
  now = () => new Date().toISOString()
}) {
  const ossDestination = validateOssUri(ossUri);
  const directory = requiredAbsolutePath(backupDir, "backupDir");
  const persistence = requiredAbsolutePath(persistDir, "persistDir");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const items = [];
  for (const database of DATABASES) {
    const source = localD1DatabasePath(persistence, database);
    const output = join(directory, database.backupFile);
    if (!(await exists(source))) {
      throw new Error(`${database.name} 本地 SQLite 文件不存在：${source}`);
    }
    await run(sqliteBin, [
      source,
      ".timeout 30000",
      `.backup ${JSON.stringify(output)}`
    ]);
    await run(pythonBin, ["-c", SQLITE_QUICK_CHECK_SCRIPT, output]);
    await Promise.all([
      rm(`${output}-shm`, { force: true }),
      rm(`${output}-wal`, { force: true })
    ]);
    const metadata = await stat(output);
    if (metadata.size === 0) throw new Error(`${database.name} SQLite 备份为空。`);
    items.push({
      binding: database.binding,
      name: database.name,
      file: database.backupFile,
      bytes: metadata.size,
      sha256: await sha256(output)
    });
  }
  const manifest = { schemaVersion: 1, createdAt: now(), source: "aliyun-ecs-local-d1", databases: items };
  await atomicJson(join(directory, "manifest.json"), manifest);
  if (ossDestination) {
    const snapshotDestination = `${ossDestination}${basename(directory)}/`;
    await run(ossutilBin, ["cp", directory, snapshotDestination, "--recursive", "--force"]);
    if (keepLocalBackups === 1) {
      await retainOnlyCurrentBackup({ backupDir: directory, ossUri: ossDestination, manifest });
    } else if (keepLocalBackups !== null) {
      throw new Error("keepLocalBackups 当前只支持 1。");
    }
  }
  return manifest;
}
