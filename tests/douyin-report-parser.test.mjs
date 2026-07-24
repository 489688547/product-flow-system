import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  detectDouyinReport,
  readDouyinReport
} from "../scripts/web-data-collector/providers/douyin/parser.mjs";
import {
  DEFAULT_DOUYIN_ARCHIVE_ROOT,
  archiveDouyinReport
} from "../scripts/web-data-collector/providers/douyin/archive.mjs";
import { createDouyinProcessor } from "../scripts/web-data-collector/providers/douyin/index.mjs";

const fixtureRoot = new URL("./fixtures/douyin/", import.meta.url);

function fixture(name) {
  return new URL(name, fixtureRoot);
}

test("report signatures distinguish all four official resource families", async () => {
  const cases = [
    ["store-daily.csv", "store_daily"],
    ["product-daily.csv", "product_daily"],
    ["live-daily.csv", "live_daily"],
    ["video-daily.csv", "video_daily"]
  ];
  for (const [fileName, resourceType] of cases) {
    const [header] = (await readFile(fixture(fileName), "utf8")).trim().split(/\r?\n/);
    const detected = detectDouyinReport({ fileName, headers: header.split(",") });
    assert.equal(detected.resourceType, resourceType);
    assert.match(detected.reportVersion, /^douyin-/);
  }
});

test("product report maps only registered standard facts and strips sensitive source columns", async () => {
  const parsed = await readDouyinReport(fixture("product-daily.csv"), {
    resourceType: "product_daily",
    businessDate: "2026-07-23",
    storeId: "store-a"
  });

  assert.equal(parsed.sourceRowCount, 1);
  assert.equal(parsed.rejectedCount, 0);
  assert.equal(parsed.coverage > 0.7, true);
  assert.equal(parsed.confidence, "high");
  assert.deepEqual(parsed.facts, [{
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    businessDate: "2026-07-23",
    sourceVersion: parsed.reportVersion,
    productId: "product-001",
    skuId: "sku-001",
    productName: "测试商品",
    skuName: "默认规格",
    merchantCode: "TY-001",
    exposureUsers: 1000,
    clickUsers: 120,
    transactionBuyers: 20,
    transactionOrderCount: 22,
    transactionQuantity: 25,
    transactionAmount: 888,
    userPaymentAmount: 860,
    refundOrderCount: 2,
    refundQuantity: 2,
    refundAmount: 50
  }]);
  assert.equal(JSON.stringify(parsed).includes("should-not-survive@example.com"), false);
  assert.equal(JSON.stringify(parsed).includes("登录邮箱"), false);
});

test("store, live and video reports normalize amounts, durations and Shanghai timestamps", async () => {
  const store = await readDouyinReport(fixture("store-daily.csv"), {
    resourceType: "store_daily",
    businessDate: "2026-07-23",
    storeId: "store-a"
  });
  const live = await readDouyinReport(fixture("live-daily.csv"), {
    resourceType: "live_daily",
    businessDate: "2026-07-23",
    storeId: "store-a"
  });
  const video = await readDouyinReport(fixture("video-daily.csv"), {
    resourceType: "video_daily",
    businessDate: "2026-07-23",
    storeId: "store-a"
  });

  assert.equal(store.facts[0].transactionAmount, 1234.5);
  assert.equal(store.facts[0].refundAmountByPaymentDate, 34.5);
  assert.equal(live.facts[0].durationSeconds, 9000);
  assert.equal(live.facts[0].startedAt, "2026-07-23T10:00:00+08:00");
  assert.equal(video.facts[0].publishedAt, "2026-07-22T09:00:00+08:00");
  assert.equal(video.facts[0].playCount, 1000);
});

test("wrong business date and missing required columns fail before upload", async () => {
  await assert.rejects(
    () => readDouyinReport(fixture("store-daily.csv"), {
      resourceType: "store_daily",
      businessDate: "2026-07-22",
      storeId: "store-a"
    }),
    error => error?.code === "DOUYIN_STORE_DATE_RANGE_NOT_APPLIED"
  );

  const root = await mkdtemp(join(tmpdir(), "douyin-report-invalid-"));
  const invalid = join(root, "invalid.csv");
  await writeFile(invalid, "日期,商品名称,成交金额\n2026-07-23,无ID商品,1\n", "utf8");
  await assert.rejects(
    () => readDouyinReport(invalid, {
      resourceType: "product_daily",
      businessDate: "2026-07-23",
      storeId: "store-a"
    }),
    error => error?.code === "DOUYIN_REQUIRED_FIELDS_MISSING"
  );
});

test("duplicate stable detail identities fail before a batch can report the wrong row count", async () => {
  const root = await mkdtemp(join(tmpdir(), "douyin-report-duplicate-"));
  const duplicate = join(root, "duplicate.csv");
  await writeFile(
    duplicate,
    "日期,商品ID,SKU ID,商品名称,成交金额\n"
      + "2026-07-23,product-001,sku-001,测试商品,1\n"
      + "2026-07-23,product-001,sku-001,测试商品,2\n",
    "utf8"
  );

  await assert.rejects(
    () => readDouyinReport(duplicate, {
      resourceType: "product_daily",
      businessDate: "2026-07-23",
      storeId: "store-a"
    }),
    error => error?.code === "DOUYIN_REPORT_DUPLICATE_ID"
  );
});

test("raw archive is private, content-addressed and never returns an absolute key", async () => {
  assert.match(DEFAULT_DOUYIN_ARCHIVE_ROOT, /抖店罗盘$/);
  const root = await mkdtemp(join(tmpdir(), "douyin-archive-"));
  const source = join(root, "商品明细.csv");
  await writeFile(source, await readFile(fixture("product-daily.csv")));

  const first = await archiveDouyinReport({
    filePath: source,
    rootDir: join(root, "archive"),
    storeId: "store-a",
    resourceType: "product_daily",
    businessDate: "2026-07-23"
  });
  const second = await archiveDouyinReport({
    filePath: source,
    rootDir: join(root, "archive"),
    storeId: "store-a",
    resourceType: "product_daily",
    businessDate: "2026-07-23"
  });

  assert.equal(first.sha256, second.sha256);
  assert.equal(first.relativeArchiveKey, second.relativeArchiveKey);
  assert.equal(first.relativeArchiveKey.includes(root), false);
  assert.match(first.relativeArchiveKey, /^douyin-ecommerce\/store-a\/product_daily\/2026\/07\/2026-07-23\//);
  assert.equal(first.fileName, basename(source));
  assert.equal((await stat(first.archivedFilePath)).mode & 0o077, 0);
});

test("processor archives, parses and uploads bounded chunks with one final completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "douyin-processor-"));
  const source = join(root, "product.csv");
  await writeFile(source, await readFile(fixture("product-daily.csv")));
  const uploads = [];
  const processor = createDouyinProcessor({
    archiveRoot: join(root, "archive"),
    uploadFactChunk: async input => {
      uploads.push(input);
      return {
        batchId: input.batchId,
        status: input.complete ? "completed" : "staging",
        completedCount: input.complete ? input.expectedCount : null
      };
    }
  });

  const result = await processor.process({
    job: {
      id: "job-1",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "product_daily",
      businessDate: "2026-07-23"
    },
    result: {
      kind: "downloaded",
      filePath: source,
      reportVersion: "douyin-product-v1"
    }
  });

  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].complete, false);
  assert.equal(uploads[1].complete, true);
  assert.equal(uploads[1].facts.length, 0);
  assert.equal(uploads[1].expectedCount, 1);
  assert.equal(result.rowCount, 1);
  assert.equal(result.confidence, "high");
  assert.equal(JSON.stringify(result).includes(root), false);
});
