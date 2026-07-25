import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function checkpointModule() {
  return import("../scripts/web-data-collector/checkpoints.mjs").catch(() => ({}));
}

async function diagnosticModule() {
  return import("../scripts/web-data-collector/diagnostics.mjs").catch(() => ({}));
}

test("checkpoint store atomically persists a resumable local result", async () => {
  const { createCheckpointStore } = await checkpointModule();
  assert.equal(typeof createCheckpointStore, "function", "createCheckpointStore must be implemented");
  const rootDir = await mkdtemp(join(tmpdir(), "web-checkpoint-"));
  const store = createCheckpointStore({
    rootDir,
    now: () => new Date("2026-07-25T09:00:00.000Z")
  });

  const safe = await store.save("job-1", {
    stage: "downloaded",
    result: {
      kind: "downloaded",
      jobId: "job-1",
      filePath: "/managed/downloads/report.xlsx",
      safeFileName: "report.xlsx",
      pageType: "shop_compass_product",
      reportVersion: "douyin-product-v2"
    }
  });
  const loaded = await store.load("job-1");

  assert.equal(safe.stage, "downloaded");
  assert.equal(safe.checkpointId, "job-1");
  assert.doesNotMatch(JSON.stringify(safe), /managed|Downloads|Users\//i);
  assert.equal(loaded.result.filePath, "/managed/downloads/report.xlsx");
  assert.deepEqual(await readdir(rootDir), ["job-1.json"]);
  await store.clear("job-1");
  assert.deepEqual(await readdir(rootDir), []);
});

test("checkpoint store rejects arbitrary jobs, stages and sensitive browser data", async () => {
  const { createCheckpointStore } = await checkpointModule();
  assert.equal(typeof createCheckpointStore, "function", "createCheckpointStore must be implemented");
  const rootDir = await mkdtemp(join(tmpdir(), "web-checkpoint-"));
  const store = createCheckpointStore({ rootDir });

  await assert.rejects(store.save("../job", { stage: "downloaded" }), /任务/);
  await assert.rejects(store.save("job-1", { stage: "arbitrary" }), /阶段/);
  await assert.rejects(store.save("job-1", {
    stage: "downloaded",
    result: { kind: "downloaded", jobId: "job-1", cookie: "secret" }
  }), /敏感|字段/);
});

test("local diagnostics are encrypted, page-scoped and deleted after seven days", async () => {
  const { createLocalDiagnosticStore } = await diagnosticModule();
  assert.equal(typeof createLocalDiagnosticStore, "function", "createLocalDiagnosticStore must be implemented");
  const rootDir = await mkdtemp(join(tmpdir(), "web-diagnostic-"));
  let now = new Date("2026-07-25T09:00:00.000Z");
  const store = createLocalDiagnosticStore({
    rootDir,
    encryptionKey: Buffer.alloc(32, 7),
    now: () => now
  });

  await assert.rejects(store.write({
    jobId: "job-1",
    pageType: "arbitrary_page",
    errorCode: "DOUYIN_PAGE_SCHEMA_CHANGED",
    artifact: Buffer.from("customer-secret")
  }), /页面/);
  const saved = await store.write({
    jobId: "job-1",
    pageType: "shop_compass_product",
    errorCode: "DOUYIN_PAGE_SCHEMA_CHANGED",
    safeSummary: "页面结构变化。",
    artifact: Buffer.from("customer-secret")
  });
  const fileName = (await readdir(rootDir))[0];
  const encrypted = await readFile(join(rootDir, fileName));

  assert.match(saved.diagnosticId, /^diag_[a-f0-9]{24}$/);
  assert.deepEqual(Object.keys(saved).sort(), ["createdAt", "diagnosticId", "errorCode"]);
  assert.equal(encrypted.includes(Buffer.from("customer-secret")), false);
  assert.equal((await store.readForLocalSupport(saved.diagnosticId)).artifact.toString(), "customer-secret");

  now = new Date("2026-08-02T09:00:01.000Z");
  assert.equal((await store.cleanup()).deleted, 1);
  assert.deepEqual(await readdir(rootDir), []);
});
