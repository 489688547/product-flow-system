# ERP Collection API v1

## Purpose

`POST /api/platform/v1/erp-collection/ingest` accepts preflighted official ERP export rows through the shared data-acquisition boundary. The first provider is Kuaimai. Provider files are read locally; credentials, cookies, verification codes and browser sessions never enter the request.

## Authentication and authorization

- Requires the existing authenticated organization session; local loopback uses the governed server-side personal token flow.
- Rejects read-only identities.
- Write access is limited to 总经办、数据中心/数据部、供应链和财务.
- Requires the `PRODUCT_FLOW_DB` D1 binding and an `Idempotency-Key` header.

## Request

JSON object with:

- `batch`: provider, registered resource type, source filename, SHA-256 file hash, schema version, source range, source row count, status and collection time.
- `records`: at most 500 normalized records with stable source key, source timestamps, shop/warehouse references, row SHA-256 and the allowed provider field object.
- `issues`: at most 500 preflight quality issues.

Orders and order items require a valid business occurrence timestamp. Kuaimai uses order creation time in Asia/Shanghai. Secret-like keys and buyer, recipient, mobile, address, waybill, identity and free-text remark fields are rejected. The local collector removes those columns before hashing and upload, even when the provider masks their values.

## Response

HTTP `201` returns `data.batchId`, normalized batch status and `counts` for inserted, updated, unchanged and issue rows. Repeating the same idempotent chunk or unchanged source row does not create another fact.

## Errors

- `AUTH_REQUIRED`, `AUTH_USER_INACTIVE`, `AUTH_FORBIDDEN`: session or role failure.
- `ERP_COLLECTION_IDEMPOTENCY_REQUIRED`: missing idempotency key.
- `ERP_COLLECTION_DB_UNAVAILABLE`: D1 binding unavailable.
- `ERP_COLLECTION_*`: invalid platform, resource, hash, source key, timestamp, secret field or chunk size.
- `ERP_COLLECTION_INGEST_FAILED`: unexpected storage failure; response and logs must not expose source rows or credentials.

## Compatibility and deprecation

The route is additive under `/api/platform/v1`. Resource types and payload validation are registry controlled. New allowed provider fields remain inside `payload`; personal or secret fields never do. Breaking standard-field changes require a new schema version or route version. No legacy Kuaimai API route is removed.

## Capacity and retention

D1 stores queryable facts, batch metadata and quality issues; it is not the long-term binary-file archive. A verified 15-day Kuaimai order-item sample contains 157,217 rows and approximately 339.84 MiB of serialized records, so full raw history must use NAS/R2 before D1 receives only normalized facts and aggregates.

## Observability

Audit by batch ID, provider, resource type, file hash, range, row count, status, actor and timestamps. Log stable error codes and counts only; never log raw rows, customer data, cookies, tokens or credentials.

## Contract tests

- `tests/kuaimai-erp-collection-domain.test.mjs`
- `tests/kuaimai-erp-collection-api.test.mjs`
- `tests/kuaimai-erp-collection-cli.test.mjs`
- `tests/kuaimai-erp-collection-migration.test.mjs`
