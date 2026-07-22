import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveSafeDownload } from "../scripts/web-data-collector/download.mjs";

test("download resolver accepts only a stable basename under the configured directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "web-collector-download-"));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "orders.xlsx"), "fixture");

  assert.equal(await resolveSafeDownload({ directory, fileName: "orders.xlsx", stabilityDelayMs: 1 }), path.join(directory, "orders.xlsx"));
  await assert.rejects(() => resolveSafeDownload({ directory, fileName: "../orders.xlsx", stabilityDelayMs: 1 }), error => error?.code === "WEB_COLLECTION_DOWNLOAD_NAME_INVALID");
  await assert.rejects(() => resolveSafeDownload({ directory, fileName: "/tmp/orders.xlsx", stabilityDelayMs: 1 }), error => error?.code === "WEB_COLLECTION_DOWNLOAD_NAME_INVALID");
});
