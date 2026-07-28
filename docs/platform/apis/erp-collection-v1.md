# ERP Collection API v1

## Purpose

`POST /api/platform/v1/erp-collection/ingest` accepts preflighted official ERP export indexes through the shared data-acquisition boundary. High-volume Kuaimai sales exports use `POST /api/platform/v1/erp-collection/sales-facts`, which accepts locally aggregated standard facts without copying thousands of detail indexes into D1. Provider files remain in the company Mac archive; credentials, cookies, verification codes, browser sessions and full raw rows never enter the request. Archive runtime status and the explicit decision not to project a file are separate facts: operational failures never become an intentional skip.

## Authentication and authorization

- Manual calls require the existing authenticated organization session. The installed collector uses a fixed-scope `kuaimai_erp_ingest` token created by an executive session; plaintext is returned once and stored only in macOS Keychain, while D1 stores its SHA-256 hash.
- Rejects read-only identities.
- Write access is limited to 总经办、数据中心/数据部、供应链和财务.
- The same authorized departments may record or revoke an archive ingestion decision. The collector token cannot set that decision.
- Requires the formal control D1 plus the middleware-selected business D1 and an `Idempotency-Key` header. The control batch persists the server-resolved target environment and version; client payloads cannot choose a binding or database ID.

## Request

JSON object with:

- `batch`: provider, registered resource type, source filename, SHA-256 file hash, schema version, source range, source row count, status and collection time.
- `archive`: optional local archive manifest with file hash, safe filename, byte size, relative path, runner and status. Absolute paths are ignored.
- `records`: at most 500 normalized records with stable source key, source timestamps, shop/warehouse references, row SHA-256 and the whitelisted minimum standard index.
- `issues`: at most 500 preflight quality issues.

`PATCH /api/platform/v1/erp-collection/archives` receives `archiveId`, `expectedVersion`,
`ingestionDecision` and an optional `ingestionReasonCode`. `ingestionDecision` is `pending` or
`skipped`. A skipped archive requires exactly one registered reason:

- `TIME_BASIS_MISSING`
- `DETAIL_STORAGE_DEFERRED`
- `UNSUPPORTED_REPORT_GRAIN`

Only an `archived` runtime record can be skipped. `processing`, `failed` and `processed` cannot be hidden behind a
skip decision. Returning a skipped record to `pending` clears the reason, actor and decision timestamp. The route
uses optimistic versions and records the server-resolved organization actor; file names never determine a decision.

`sales-facts` receives the same `batch` and optional `archive`, aggregated `facts`, and safe `issues`; it does not accept or persist raw detail records. Uploads are chunked at 1,000 facts per pack with idempotency keys `batch.id:projected-sales:N`. A multi-pack upload declares `chunk: { index, total }` (at most 50 packs) on every pack; the first pack also carries `replaceDates` with the batch's complete date list, so the date rewrite happens exactly once and later packs insert idempotently without deleting. The legacy single-pack full upload (no `chunk`, up to 5,000 facts, dates derived from the facts) remains accepted for older runners. The local trusted adapter must first verify the whole file, ignore only explicit provider summary rows, redact personal fields, and aggregate by `69码 × 创建日 × 平台`. The server validates every fact again and atomically replaces only the exact completed business dates.

Orders, order items and rich sales items require a valid business occurrence timestamp. Kuaimai uses order creation time in Asia/Shanghai. `sales_items` comes from 《销售主题分析-按订单商品明细》 and only writes facts after the whole batch is completed. Quantity, net sales, net cost and gross profit use the governed formulas in `docs/product/data-definitions.md`; unmapped product codes become safe quality exceptions rather than guessed mappings.

`inventory_snapshot` accepts current official inventory exports only. The whole local file must be validated before the
first request; every row needs a stable SKU identity, warehouse identity and a registered official quantity column.
Before storing control records, the server normalizes the official `实际总库存` and `实际可用数` columns to
`quantity` and `sellableQuantity`; both fields must survive the minimum-index allowlist so replay projects the
official quantities rather than zero values.
The normalized `purchasePrice` minimum index projects to inventory `unitCost`; an absent source cost remains unknown
and must not be replaced with zero.
The projection date is the batch collection day in Asia/Shanghai, while row-level ERP modification time remains
`sourceUpdatedAt`. Missing product identity remains `null`; the writer never derives a product from a warehouse/SKU
source key. A partial snapshot is rejected before upload and again after the final server response.
The Kuaimai adapter uses the official warehouse-inventory export. Kuaimai may label its OOXML workbook with a `.csv`
suffix, so the company Mac detects the ZIP/OOXML signature before choosing a parser.
It projects only after the whole file has passed local validation and the collection batch requests `completed`.
While projection is running, the control batch/archive remain `pending/processing`; they advance to
`completed/processed` only after the business projection succeeds. The server requires one snapshot date and unique
`SKU × warehouse` rows, writes staging rows in D1 batches of at most 50 statements, and atomically replaces the target
date only after all staging rows are present. A failed staging chunk leaves the last trusted live snapshot unchanged
and the control state replayable. Source-record idempotency compares both the provider row hash and the normalized
minimum-index payload; when an allowlist upgrade preserves a newly governed field, replaying the same file updates the
stored index and projection instead of treating the row as unchanged. Replaying the same collection batch uses the
same projection ID and remains idempotent.

Secret-like keys and buyer, recipient, mobile, address, waybill, identity and free-text remark fields are rejected. The local collector removes those columns before hashing and upload, even when the provider masks their values. The server repeats the allowlist normalization before persistence as defense in depth.

## Response

HTTP `201` returns `data.archiveId`, `data.batchId` and normalized batch status. The standard ingest route also returns
`counts`. A completed `inventory_snapshot` additionally returns
`projection.inventoryDaily` and `projection.inventoryQuality` with
`sourceRows`, `projectedRows`, `snapshotDate`, `quantityCoverage`, `skuCoverage`, `warehouseCoverage`, `sourceUpdatedAt`,
`complete` and `confidence`. `sales-facts` returns `projection.sourceRecords`,
`projection.storedSourceRecords=0`, fact row count and projected dates. Repeating the same file hash or idempotency
key replaces the same exact dates and does not accumulate duplicate facts.

Archive metadata, runner authorization and collection batch control stay in the formal control database. Standard business projections use the target environment persisted on the control job. Display-target sales facts pass through the shared two-times transformation; a stale display version fails before projection writes.

`POST /api/platform/v1/erp-collection/runners` creates the one-time fixed-scope token and requires either an executive company session or the existing server-only production personal token resolved to an active executive identity. The personal token is used only during installation and never enters LaunchAgent configuration. `GET /api/platform/v1/erp-collection/archives` returns safe archive and batch metadata to authorized company users; it never returns an absolute local path. Before returning the list, the server marks `processing` records whose last update is more than 24 hours old as `failed` with `ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT`. That recovery preserves the local file, linked batch and all previously trusted business facts. Each archive row also carries `businessDateStart` and `businessDateEnd`, resolved through a read-only left join on `erp_collection_batches`; the archive table itself stores no business date, so the batch is the only way to trace a file to the day it feeds. Archives without a batch keep both fields `null` and must never be associated with a business day by guessing. Both fields are additive and optional, so existing consumers stay compatible.

## Errors

- `AUTH_REQUIRED`, `AUTH_USER_INACTIVE`, `AUTH_FORBIDDEN`: session or role failure.
- `ERP_COLLECTION_IDEMPOTENCY_REQUIRED`: missing idempotency key.
- `ERP_COLLECTION_DB_UNAVAILABLE`: D1 binding unavailable.
- `ERP_COLLECTION_*`: invalid platform, resource, hash, source key, timestamp, secret field or chunk size.
- `ERP_COLLECTION_SALES_FACTS_EMPTY`: a completed rich sales batch did not produce any trusted aggregate facts.
- `ERP_COLLECTION_SALES_FACT_INVALID` / `ERP_COLLECTION_SALES_FACTS_TOO_LARGE`: an aggregate fact lacks a valid 69 code/date, exceeds the 1,000-row pack (5,000 for the legacy single-pack format) or the 50-pack batch bound.
- `ERP_COLLECTION_SALES_FACTS_DATES_REQUIRED` / `ERP_COLLECTION_SALES_FACTS_DATES_INVALID`: a multi-pack first pack misses the full rewrite date list, or a later pack illegally carries one.
- `ERP_COLLECTION_BATCH_PARTIAL`: a sales export or current inventory snapshot still has blocking validation errors and cannot be reported as synchronized.
- `ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT`: the archive remained in `processing` for more than 24 hours and was stopped without changing trusted facts.
- `ERP_COLLECTION_ARCHIVE_NOT_FOUND`: the explicit archive decision targets an unknown ID.
- `ERP_COLLECTION_ARCHIVE_DECISION_INVALID` / `ERP_COLLECTION_ARCHIVE_REASON_INVALID`: the decision, expected version or controlled reason is invalid.
- `ERP_COLLECTION_ARCHIVE_STATE_CONFLICT` / `ERP_COLLECTION_ARCHIVE_VERSION_CONFLICT`: the runtime state cannot accept a skip decision, or the read version is stale.
- `GOODS_FLOW_INVENTORY_SNAPSHOT_INVALID`: a completed inventory snapshot is empty, mixes snapshot dates, lacks a stable SKU/warehouse identity, or contains duplicate `SKU × warehouse` rows.
- `ERP_COLLECTION_INGEST_FAILED`: unexpected storage failure; response and logs must not expose source rows or credentials.

## Compatibility and deprecation

The route is additive under `/api/platform/v1`. Resource types and payload validation are registry controlled. New allowed provider fields remain inside `payload`; personal or secret fields never do. Breaking standard-field changes require a new schema version or route version. No legacy Kuaimai API route is removed.

## Capacity and retention

D1 stores archive metadata, necessary minimum query indexes, business projections, batch metadata and quality issues; it is not the binary-file archive. Archive decisions add only a controlled code, actor, timestamp and integer version to each index row. High-volume daily sales files keep no per-detail D1 source index: the local archive remains trace evidence while D1 stores only the aggregate facts and counts. A verified 15-day Kuaimai order-item sample contains 157,217 rows and approximately 339.84 MiB of serialized records, so full raw history stays under `~/Desktop/公司数据中心/快麦ERP/` until a governed NAS/R2 location is available.

## Observability

Audit by batch ID, provider, resource type, file hash, range, row count, status, actor and timestamps. Inventory projection observability also records the safe projection ID, snapshot date, staging chunk count and projected row count. Log stable error codes and counts only; never log raw rows, customer data, cookies, tokens or credentials.

## Contract tests

- `tests/kuaimai-erp-collection-domain.test.mjs`
- `tests/kuaimai-erp-collection-api.test.mjs`
- `tests/kuaimai-erp-sales-facts-api.test.mjs`
- `tests/kuaimai-erp-collection-cli.test.mjs`
- `tests/kuaimai-erp-collection-migration.test.mjs`
- `tests/kuaimai-erp-local-archive.test.mjs`
- `tests/kuaimai-erp-local-archive-api.test.mjs`
- `tests/goods-flow-inventory-storage.test.mjs`
