import { copyFile, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appendManifestEvent,
  archiveSourceFile,
  ensureArchiveLayout,
  inspectFileStability,
  loadLocalManifest
} from "./archive.mjs";
import { readKuaimaiExport } from "./core.mjs";

const SUPPORTED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

function resourceFromName(fileName) {
  const name = String(fileName).toLowerCase();
  if (/售后|退款/.test(name)) return "aftersales";
  if (/采购/.test(name)) return "purchase_orders";
  if (/库存流水|出入库|进销存/.test(name)) return "inventory_movements";
  if (/库存|盘点/.test(name)) return "inventory_snapshot";
  if (/供应商/.test(name)) return "suppliers";
  if (/仓库/.test(name)) return "warehouses";
  if (/店铺/.test(name)) return "shops";
  if (/sku|规格/.test(name)) return "skus";
  if (/商品|产品/.test(name)) return "products";
  if (/销售主题|订单商品|明细/.test(name)) return "order_items";
  if (/订单|order/.test(name)) return "orders";
  return "";
}

async function identifyAndRead(filePath, resourceType = "") {
  const preferred = resourceType || resourceFromName(path.basename(filePath));
  if (preferred) return { resourceType: preferred, parsed: await readKuaimaiExport(filePath, { resourceType: preferred }) };
  const candidates = ["orders", "order_items", "products", "skus", "inventory_snapshot", "inventory_movements", "suppliers", "purchase_orders", "aftersales", "shops", "warehouses"];
  let lastError;
  for (const candidate of candidates) {
    try {
      return { resourceType: candidate, parsed: await readKuaimaiExport(filePath, { resourceType: candidate }) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function safeRename(source, targetDirectory, prefix = "") {
  const target = path.join(targetDirectory, `${prefix}${path.basename(source)}`);
  try {
    await rename(source, target);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await copyFile(source, target);
  }
  return target;
}

async function writeReport(layout, hash, report) {
  const reportPath = path.join(layout.reports, `${hash.slice(0, 16)}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return reportPath;
}

export async function scanWaitingDirectory({ root, upload, resourceType = "" }) {
  const layout = await ensureArchiveLayout(root);
  const statePath = path.join(layout.root, ".scan-state.json");
  const signatures = await readJson(statePath, {});
  const manifest = await loadLocalManifest(layout.manifest);
  const names = (await readdir(layout.waiting)).filter(name => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase())).sort();
  const result = { discovered: names.length, waiting: 0, processed: 0, failed: 0, duplicates: 0 };
  const nextSignatures = {};
  for (const name of names) {
    const sourcePath = path.join(layout.waiting, name);
    const stability = await inspectFileStability(sourcePath, signatures[name]);
    nextSignatures[name] = stability.signature;
    if (!stability.stable) {
      result.waiting += 1;
      continue;
    }
    let archived;
    try {
      const identified = await identifyAndRead(sourcePath, resourceType);
      archived = await archiveSourceFile(sourcePath, { root: layout.root, resourceType: identified.resourceType });
      const existing = manifest.get(archived.contentHash);
      if (existing?.status === "processed") {
        result.duplicates += 1;
        await safeRename(sourcePath, layout.processed, `${archived.contentHash.slice(0, 12)}__`);
        continue;
      }
      await appendManifestEvent(layout.manifest, {
        contentHash: archived.contentHash,
        fileName: name,
        relativePath: archived.relativePath,
        sizeBytes: archived.sizeBytes,
        resourceType: identified.resourceType,
        sourceModifiedAt: stability.modifiedAt,
        archivedAt: new Date().toISOString(),
        status: "archived"
      });
      identified.parsed.archive = {
        platformId: "kuaimai",
        resourceType: identified.resourceType,
        contentHash: archived.contentHash,
        fileName: name,
        sizeBytes: archived.sizeBytes,
        relativePath: archived.relativePath,
        storageType: "local_desktop",
        status: "archived",
        archivedAt: new Date().toISOString()
      };
      const uploaded = await upload(identified.parsed);
      await appendManifestEvent(layout.manifest, {
        contentHash: archived.contentHash,
        status: "processed",
        batchId: uploaded?.batchId || identified.parsed.batch.id,
        processedAt: new Date().toISOString()
      });
      await safeRename(sourcePath, layout.processed, `${archived.contentHash.slice(0, 12)}__`);
      await writeReport(layout, archived.contentHash, {
        status: "processed",
        contentHash: archived.contentHash,
        resourceType: identified.resourceType,
        rowCount: identified.parsed.batch.rowCount,
        issueCount: identified.parsed.issues.length,
        batchId: uploaded?.batchId || identified.parsed.batch.id
      });
      result.processed += 1;
    } catch (error) {
      const fallbackHash = archived?.contentHash || "unknown";
      if (archived) await appendManifestEvent(layout.manifest, {
        contentHash: archived.contentHash,
        status: "failed",
        errorCode: error.code || "KUAIMAI_ARCHIVE_PROCESS_FAILED",
        processedAt: new Date().toISOString()
      });
      await safeRename(sourcePath, layout.failed, `${Date.now()}__`);
      await writeReport(layout, fallbackHash === "unknown" ? `${Date.now()}`.padEnd(64, "0") : fallbackHash, {
        status: "failed",
        fileName: name,
        errorCode: error.code || "KUAIMAI_ARCHIVE_PROCESS_FAILED",
        message: String(error.message || "处理失败").slice(0, 500)
      });
      result.failed += 1;
    }
  }
  await writeFile(statePath, `${JSON.stringify(nextSignatures, null, 2)}\n`, { mode: 0o600 });
  if (!names.length) result.status = "waiting_for_export";
  return result;
}

export async function archiveExistingFile(filePath, { root, resourceType = "", upload = null, onValidated = null } = {}) {
  const layout = await ensureArchiveLayout(root);
  const identified = await identifyAndRead(filePath, resourceType);
  if (onValidated) await onValidated({ resourceType: identified.resourceType, rowCount: identified.parsed.batch.rowCount });
  return archiveExistingParsedFile(filePath, identified, { layout, upload });
}

async function archiveExistingParsedFile(filePath, identified, { layout, upload }) {
  const archived = await archiveSourceFile(filePath, { root: layout.root, resourceType: identified.resourceType });
  await appendManifestEvent(layout.manifest, {
    contentHash: archived.contentHash,
    fileName: path.basename(filePath),
    relativePath: archived.relativePath,
    sizeBytes: archived.sizeBytes,
    resourceType: identified.resourceType,
    sourceModifiedAt: (await stat(filePath)).mtime.toISOString(),
    archivedAt: new Date().toISOString(),
    status: "archived"
  });
  identified.parsed.archive = {
    platformId: "kuaimai",
    resourceType: identified.resourceType,
    contentHash: archived.contentHash,
    fileName: path.basename(filePath),
    sizeBytes: archived.sizeBytes,
    relativePath: archived.relativePath,
    storageType: "local_desktop",
    status: "archived",
    archivedAt: new Date().toISOString()
  };
  if (!upload) return { ...archived, resourceType: identified.resourceType, rowCount: identified.parsed.batch.rowCount, status: "archived" };
  const uploaded = await upload(identified.parsed);
  await appendManifestEvent(layout.manifest, {
    contentHash: archived.contentHash,
    status: "processed",
    batchId: uploaded?.batchId || identified.parsed.batch.id,
    processedAt: new Date().toISOString()
  });
  return { ...archived, resourceType: identified.resourceType, rowCount: identified.parsed.batch.rowCount, status: "processed", batchId: uploaded?.batchId || identified.parsed.batch.id };
}

export async function archiveExistingRawFile(filePath, { root, resourceType } = {}) {
  if (!resourceType) {
    const error = new Error("仅归档模式必须明确指定资源类型。");
    error.code = "KUAIMAI_ARCHIVE_RESOURCE_REQUIRED";
    throw error;
  }
  const layout = await ensureArchiveLayout(root);
  const archived = await archiveSourceFile(filePath, { root: layout.root, resourceType });
  await appendManifestEvent(layout.manifest, {
    contentHash: archived.contentHash,
    fileName: path.basename(filePath),
    relativePath: archived.relativePath,
    sizeBytes: archived.sizeBytes,
    resourceType,
    sourceModifiedAt: (await stat(filePath)).mtime.toISOString(),
    archivedAt: new Date().toISOString(),
    status: "archived"
  });
  return { ...archived, resourceType, status: "archived" };
}

export async function syncLocalArchiveManifest({ root, upload }) {
  const layout = await ensureArchiveLayout(root);
  const manifest = await loadLocalManifest(layout.manifest);
  const results = [];
  for (const item of manifest.values()) {
    if (!item.relativePath || !item.resourceType || !item.fileName) continue;
    results.push(await upload({
      platformId: "kuaimai",
      resourceType: item.resourceType,
      contentHash: item.contentHash,
      fileName: item.fileName,
      sizeBytes: item.sizeBytes || 0,
      relativePath: item.relativePath,
      storageType: "local_desktop",
      status: item.status || "archived",
      archivedAt: item.archivedAt,
      processedAt: item.processedAt || null,
      errorCode: item.errorCode || null
    }));
  }
  return { archives: results.length, results };
}
