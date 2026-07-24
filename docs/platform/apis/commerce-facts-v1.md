# Commerce Facts API v1

## Purpose

`/api/platform/v1/commerce-facts` is the shared read boundary for normalized store, product, live, and video operating facts. `/api/platform/v1/commerce-facts/ingest` is the controlled company-runner write boundary. Business Apps never call Douyin pages, the Chrome extension, or provider adapters directly.

## Authentication and authorization

- Read requests require an active company session and the existing business-data view permission.
- Ingest requests additionally require an active registered runner, a live task lease/grant, and an exact match to the server-owned collection job.
- The job owns provider, store, resource, business date, target data environment, and target environment version.
- Browser, runner, file, and request payloads cannot select a binding or database ID.

## Ingest

```http
POST /api/platform/v1/commerce-facts/ingest
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "jobId": "douyin-ecommerce:store-1:product_daily:2026-07-23:v1",
  "leaseToken": "one-time-runner-lease",
  "batchId": "batch-sha256",
  "providerId": "douyin-ecommerce",
  "storeId": "store-1",
  "resourceType": "product_daily",
  "businessDate": "2026-07-23",
  "schemaVersion": "douyin-product-v1",
  "chunkIndex": 0,
  "complete": false,
  "expectedCount": null,
  "facts": []
}
```

Chunks contain at most 500 normalized rows. The final request sets `complete: true` and supplies `expectedCount`. The service verifies the staged row count before atomically marking the batch completed and superseding the previous completed batch for the same provider, store, resource, and business date.

The response never returns credentials, leases after use, raw provider rows, file paths, or page content:

```json
{
  "ok": true,
  "batchId": "batch-sha256",
  "status": "staging",
  "acceptedCount": 500,
  "completedCount": null
}
```

## Read

```http
GET /api/platform/v1/commerce-facts?from=2026-07-01&to=2026-07-23&providerId=douyin-ecommerce&storeId=store-1&resourceType=product_daily
```

Optional resource identifiers are `productId`, `skuId`, `liveSessionId`, and `videoId`. `from`, `to`, `providerId`, `storeId`, and `resourceType` are required. Date selection only sets client conditions; clients issue this request only after the user clicks query or refresh.

```json
{
  "facts": [],
  "quality": {
    "source": "douyin-ecommerce",
    "latestDate": null,
    "lastSuccessfulSyncAt": null,
    "lastTrustedBusinessDate": null,
    "coverage": null,
    "confidence": null,
    "status": "unavailable",
    "errorCode": null
  }
}
```

Missing metrics and quality fields are `null`, never synthetic zero. Derived rates are recomputed from atomic numerators and denominators; a missing or zero denominator returns `null`. Only facts belonging to a completed batch are visible.

## Errors

- `AUTH_REQUIRED` — no active company session.
- `FORBIDDEN` — missing view or runner permission.
- `INVALID_REQUEST` — unsupported filter, field, resource, or size.
- `COLLECTION_JOB_MISMATCH` — payload does not match the leased server job.
- `DATA_ENVIRONMENT_VERSION_STALE` — the job target version is no longer current.
- `COMMERCE_BATCH_INCOMPLETE` — final row count differs from `expectedCount`.
- `COMMERCE_FACT_SCHEMA_INVALID` — a fact contains an unknown, sensitive, or invalid field.
- `INTERNAL_ERROR` — safe server error; provider rows and secrets are never included.

All errors use the shared JSON error envelope and safe request correlation ID. Retryability is declared by the stable code; schema and environment-version errors are not retried automatically.

## Compatibility and deprecation

v1 accepts only provider/resource schemas registered in code. Unknown schemas fail closed. Additive response fields are compatible; removing or changing field meaning requires a new schema version and migration. Kuaimai sales and ERP routes remain unchanged.

## Observability

The control database records job, run, attempt, stage, row count, safe error code, retryability, target environment, and target version. It never records facts, raw rows, full page content, credentials, Cookie, Token, verification codes, or absolute paths. The business database records immutable fact batches, source/report version, content hash, coverage, confidence, and completed/superseded state.

## Display data behavior

`commerce_fact_batches` uses `copy`. The four commerce fact tables use `transform_sales`; additive business values are transformed by the display rule and rates are recalculated from transformed atomic facts. Control-plane jobs, runners, cursors, notifications, leases, and audit stay `skip`.
