import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function moduleUnderTest() {
  return import("../scripts/web-data-collector/local-inbox.mjs").catch(() => ({}));
}

const tempRoot = () => mkdtemp(join(tmpdir(), "unified-collector-"));

test("browser downloads and local inbox scans share one serial archive boundary", async () => {
  const { createLocalArchiveCoordinator } = await moduleUnderTest();
  assert.equal(typeof createLocalArchiveCoordinator, "function", "createLocalArchiveCoordinator must be implemented");

  let releaseBrowser;
  let announceBrowserStarted;
  const browserStarted = new Promise(resolve => { announceBrowserStarted = resolve; });
  let active = 0;
  let peak = 0;
  const coordinator = createLocalArchiveCoordinator({ root: await tempRoot(), now: () => 0 });
  const browser = coordinator.runBrowserArchive(async () => {
    active += 1;
    peak = Math.max(peak, active);
    announceBrowserStarted();
    await new Promise(resolve => { releaseBrowser = resolve; });
    active -= 1;
    return "browser-complete";
  });
  const inbox = coordinator.runInboxScan(async () => {
    active += 1;
    peak = Math.max(peak, active);
    active -= 1;
    return { processed: 1 };
  });

  await browserStarted;
  assert.equal(active, 1);
  releaseBrowser();
  assert.equal(await browser, "browser-complete");
  assert.deepEqual(await inbox, {
    status: "completed",
    result: { processed: 1 }
  });
  assert.equal(peak, 1);
});

test("local inbox scan runs immediately and then at most once every 15 minutes", async () => {
  const { createLocalArchiveCoordinator } = await moduleUnderTest();
  assert.equal(typeof createLocalArchiveCoordinator, "function", "createLocalArchiveCoordinator must be implemented");

  let now = 0;
  let calls = 0;
  const coordinator = createLocalArchiveCoordinator({
    root: await tempRoot(),
    now: () => now,
    intervalMs: 15 * 60 * 1_000
  });
  const scan = async () => ({ discovered: ++calls });

  assert.deepEqual(await coordinator.runInboxScan(scan), {
    status: "completed",
    result: { discovered: 1 }
  });
  now = 14 * 60 * 1_000;
  assert.deepEqual(await coordinator.runInboxScan(scan), {
    status: "skipped",
    reason: "interval"
  });
  now = 15 * 60 * 1_000;
  assert.deepEqual(await coordinator.runInboxScan(scan), {
    status: "completed",
    result: { discovered: 2 }
  });
});

test("a failed local scan returns only a stable safe error and does not stop later scans", async () => {
  const { createLocalArchiveCoordinator } = await moduleUnderTest();
  assert.equal(typeof createLocalArchiveCoordinator, "function", "createLocalArchiveCoordinator must be implemented");

  let now = 0;
  const coordinator = createLocalArchiveCoordinator({ root: await tempRoot(), now: () => now, intervalMs: 900_000 });
  const failed = await coordinator.runInboxScan(async () => {
    throw Object.assign(new Error("/Users/company/Desktop/private/report.xlsx"), {
      code: "KUAIMAI_UPLOAD_TIMEOUT"
    });
  });

  assert.deepEqual(failed, {
    status: "failed",
    errorCode: "KUAIMAI_UPLOAD_TIMEOUT"
  });
  assert.doesNotMatch(JSON.stringify(failed), /Users|Desktop|report\.xlsx/);

  now = 900_000;
  assert.deepEqual(await coordinator.runInboxScan(async () => ({ status: "waiting_for_export" })), {
    status: "completed",
    result: { status: "waiting_for_export" }
  });
});

test("two collector processes cannot mutate the same local archive concurrently", async () => {
  const { createLocalArchiveCoordinator } = await moduleUnderTest();
  const root = await tempRoot();
  const first = createLocalArchiveCoordinator({ root, now: () => 0 });
  const second = createLocalArchiveCoordinator({ root, now: () => 0 });
  let release;
  let announceStarted;
  const started = new Promise(resolve => { announceStarted = resolve; });
  const browserArchive = first.runBrowserArchive(async () => {
    announceStarted();
    await new Promise(resolve => { release = resolve; });
    return "done";
  });
  await started;
  let scanCalls = 0;

  assert.deepEqual(await second.runInboxScan(async () => {
    scanCalls += 1;
  }), {
    status: "skipped",
    reason: "external_lock"
  });
  assert.equal(scanCalls, 0);
  release();
  assert.equal(await browserArchive, "done");
});

test("shutdown drain waits for the active archive operation", async () => {
  const { createLocalArchiveCoordinator } = await moduleUnderTest();
  const coordinator = createLocalArchiveCoordinator({ root: await tempRoot(), now: () => 0 });
  let release;
  let announceStarted;
  const started = new Promise(resolve => { announceStarted = resolve; });
  let finished = false;
  const operation = coordinator.runBrowserArchive(async () => {
    announceStarted();
    await new Promise(resolve => { release = resolve; });
  });
  await started;
  const drained = coordinator.drain().then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  await operation;
  await drained;
  assert.equal(finished, true);
});
