import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PAGE_TYPES = new Set([
  "shop_compass_overview",
  "shop_compass_product",
  "shop_compass_live",
  "shop_compass_video"
]);
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function diagnosticPath(rootDir, diagnosticId) {
  if (!/^diag_[a-f0-9]{24}$/.test(String(diagnosticId || ""))) {
    throw new Error("本机诊断编号无效。");
  }
  return join(rootDir, `${diagnosticId}.enc`);
}

function encrypt(payload, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.from(JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64")
  }));
}

function decrypt(contents, key) {
  const envelope = JSON.parse(contents.toString("utf8"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8"));
}

export function createLocalDiagnosticStore({
  rootDir,
  encryptionKey,
  now = () => new Date()
}) {
  const key = Buffer.from(encryptionKey || []);
  if (key.length !== 32) throw new Error("本机诊断加密密钥无效。");

  const readPayload = async diagnosticId => decrypt(
    await readFile(diagnosticPath(rootDir, diagnosticId)),
    key
  );

  return Object.freeze({
    async write(input = {}) {
      if (!PAGE_TYPES.has(input.pageType)) throw new Error("本机诊断页面未登记。");
      if (!/^[-_a-zA-Z0-9]{1,128}$/.test(String(input.jobId || ""))) {
        throw new Error("本机诊断任务标识无效。");
      }
      if (!/^[A-Z0-9_]{3,80}$/.test(String(input.errorCode || ""))) {
        throw new Error("本机诊断错误码无效。");
      }
      const diagnosticId = `diag_${randomBytes(12).toString("hex")}`;
      const createdAt = now().toISOString();
      const artifact = Buffer.isBuffer(input.artifact)
        ? input.artifact
        : Buffer.from(input.artifact || "");
      const payload = {
        diagnosticId,
        createdAt,
        jobId: input.jobId,
        pageType: input.pageType,
        errorCode: input.errorCode,
        safeSummary: String(input.safeSummary || "").slice(0, 240),
        artifact: artifact.toString("base64")
      };
      await mkdir(rootDir, { recursive: true, mode: 0o700 });
      await writeFile(diagnosticPath(rootDir, diagnosticId), encrypt(payload, key), { mode: 0o600 });
      return { diagnosticId, errorCode: payload.errorCode, createdAt };
    },
    async readForLocalSupport(diagnosticId) {
      const payload = await readPayload(diagnosticId);
      return { ...payload, artifact: Buffer.from(payload.artifact, "base64") };
    },
    async cleanup() {
      const files = await readdir(rootDir).catch(error => {
        if (error?.code === "ENOENT") return [];
        throw error;
      });
      let deleted = 0;
      for (const file of files.filter(value => /^diag_[a-f0-9]{24}\.enc$/.test(value))) {
        const diagnosticId = file.slice(0, -4);
        try {
          const payload = await readPayload(diagnosticId);
          if (now().valueOf() - Date.parse(payload.createdAt) <= RETENTION_MS) continue;
          await unlink(diagnosticPath(rootDir, diagnosticId));
          deleted += 1;
        } catch {
          // An unreadable file is left for explicit local support review.
        }
      }
      return { deleted };
    }
  });
}
