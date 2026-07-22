# ERP Collection API v1

## Purpose

`POST /api/platform/v1/erp-collection/ingest` accepts preflighted official ERP export indexes through the shared data-acquisition boundary. The first provider is Kuaimai. Provider files remain in the company Mac archive; credentials, cookies, verification codes, browser sessions and full raw rows never enter the request.

## Authentication and authorization

- Manual calls require the existing authenticated organization session. The installed collector uses a fixed-scope `kuaimai_erp_ingest` token created by an executive session; plaintext is returned once and stored only in macOS Keychain, while D1 stores its SHA-256 hash.
- Rejects read-only identities.
- Write access is limited to 总经办、数据中心/数据部、供应链和财务.
- Requires the `PRODUCT_FLOW_DB` D1 binding and an `Idempotency-Key` header.

## Request

JSON object with:

- `batch`: provider, registered resource type, source filename, SHA-256 file hash, schema version, source range, source row count, status and collection time.
- `archive`: optional local archive manifest with file hash, safe filename, byte size, relative path, runner and status. Absolute paths are ignored.
- `records`: at most 500 normalized records with stable source key, source timestamps, shop/warehouse references, row SHA-256 and the whitelisted minimum standard index.
- `issues`: at most 500 preflight quality issues.

Orders and order items require a valid business occurrence timestamp. Kuaimai uses order creation time in Asia/Shanghai. Secret-like keys and buyer, recipient, mobile, address, waybill, identity and free-text remark fields are rejected. The local collector removes those columns before hashing and upload, even when the provider masks their values.

## Response

HTTP `201` returns `data.archiveId`, `data.batchId`, normalized batch status and `counts` for inserted, updated, unchanged and issue rows. Repeating the same file hash, idempotent chunk or unchanged source row does not create another fact.

`POST /api/platform/v1/erp-collection/runners` creates the one-time fixed-scope token and requires either an executive company session or the existing server-only production personal token resolved to an active executive identity. The personal token is used only during installation and never enters LaunchAgent configuration. `GET /api/platform/v1/erp-collection/archives` returns safe archive and batch metadata to authorized company users; it never returns an absolute local path.

## Errors

- `AUTH_REQUIRED`, `AUTH_USER_INACTIVE`, `AUTH_FORBIDDEN`: session or role failure.
- `ERP_COLLECTION_IDEMPOTENCY_REQUIRED`: missing idempotency key.
- `ERP_COLLECTION_DB_UNAVAILABLE`: D1 binding unavailable.
- `ERP_COLLECTION_*`: invalid platform, resource, hash, source key, timestamp, secret field or chunk size.
- `ERP_COLLECTION_INGEST_FAILED`: unexpected storage failure; response and logs must not expose source rows or credentials.

## Compatibility and deprecation

The route is additive under `/api/platform/v1`. Resource types and payload validation are registry controlled. New allowed provider fields remain inside `payload`; personal or secret fields never do. Breaking standard-field changes require a new schema version or route version. No legacy Kuaimai API route is removed.

## Capacity and retention

D1 stores archive metadata, minimum query indexes, business projections, batch metadata and quality issues; it is not the binary-file archive. A verified 15-day Kuaimai order-item sample contains 157,217 rows and approximately 339.84 MiB of serialized records, so full raw history stays under `~/Desktop/公司数据中心/快麦ERP/` until a governed NAS/R2 location is available.

## Observability

Audit by batch ID, provider, resource type, file hash, range, row count, status, actor and timestamps. Log stable error codes and counts only; never log raw rows, customer data, cookies, tokens or credentials.

## Contract tests

- `tests/kuaimai-erp-collection-domain.test.mjs`
- `tests/kuaimai-erp-collection-api.test.mjs`
- `tests/kuaimai-erp-collection-cli.test.mjs`
- `tests/kuaimai-erp-collection-migration.test.mjs`
- `tests/kuaimai-erp-local-archive.test.mjs`
- `tests/kuaimai-erp-local-archive-api.test.mjs`
