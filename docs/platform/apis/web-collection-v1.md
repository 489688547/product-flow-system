# Web Collection API v1

## Purpose

`/api/platform/v1/web-collection` is the control plane for the company Mac web-data collector. It stores runner health, deterministic jobs, stage runs, resource cursors and notification dedupe records. Provider facts continue to use their governed ingest APIs; the control plane never stores browser sessions, page contents or arbitrary automation instructions.

## Authentication and authorization

- `POST /runners` requires an active executive company session or the existing server-only production personal token resolved to an active executive identity.
- The runner token is returned once, stored only in macOS Keychain and sent as `Authorization: Bearer`. D1 stores only SHA-256.
- Runner actions on `POST /jobs` require an active `company_web_collection` runner token.
- User action `POST /jobs` with `action=trigger` requires an active non-readonly company session in 总经办、数据中心 or 运营.
- `GET /jobs` requires a company session in 总经办、数据中心、运营、供应链 or 财务.
- Every route requires the formal control database. Job creation persists the server-resolved target environment and version; browser requests and runners cannot submit a binding or database ID.

## Provider and task contract

The server accepts only code-registered provider and resource IDs. Kuaimai currently schedules `orders`, `order_items` and `sales_items`: the first two are trade exports, while `sales_items` is the rich 《销售主题分析-按订单商品明细》 source used for refund- and cost-aware sales facts. A plan item contains `providerId`, `resourceType`, `businessDate`, `rangeKind`, an optional fixed Shanghai-time range, `scheduleVersion`, `selectorVersion` and the derived `idempotencyKey`. Requests containing a URL, origin, selector, script, credentials, cookie or token field are rejected.

Runner actions are:

- `heartbeat`: update version, Chrome status, current job and last-seen time.
- `ensure_plan`: idempotently create 1–100 deterministic jobs.
- `claim`: lease one queued or expired-lease job for 60–900 seconds.
- `transition`: perform one legal state transition with safe stage and error summary.
- `complete`: atomically append the success run, mark the job successful and upsert its resource cursor.
- `record_notification`: persist one deduplicated macOS notification result.

User action is:

- `trigger`: enqueue a fixed Kuaimai daily job for `orders`, `order_items` or `sales_items` and `businessDate`. `force=false` is idempotent and never resets an existing job. `force=true` may requeue `waiting_human`, `failed`, `schema_changed` or `success` after the user confirms login; queued or running work is not duplicated. The request cannot select a URL, selector, credential or arbitrary resource.

## States, leases and idempotency

States are `queued`, `claimed`, `opening`, `waiting_human`, `exporting`, `downloading`, `validating`, `ingesting`, `success`, `failed` and `schema_changed`. Only the owning runner can change a claimed job. A lease expires after at most 15 minutes; the next runner cycle may reclaim it. Job idempotency includes `providerId:resourceType:businessDate:scheduleVersion` plus the server-owned target environment and version. Only `complete` from `ingesting` advances `(providerId, resourceType)` cursor. Provider facts are projected to the persisted target business database; a stale display version is rejected.

## Responses

Responses use `{ data, meta }` and `cache-control: no-store`. The list response contains safe runner, job, cursor and notification fields. It excludes runner-token hashes, absolute paths, URLs, selectors, page bodies and file contents.

## Errors

- `WEB_COLLECTION_STORAGE_UNAVAILABLE`: D1 binding or table unavailable, retryable.
- `WEB_COLLECTION_RUNNER_TOKEN_REQUIRED` / `WEB_COLLECTION_RUNNER_TOKEN_INVALID`: missing or invalid Keychain token.
- `WEB_COLLECTION_RUNNER_REGISTER_DENIED` / `WEB_COLLECTION_VIEW_DENIED`: authorization failure.
- `WEB_COLLECTION_TRIGGER_DENIED`: the company session cannot enqueue or retry collection.
- `WEB_COLLECTION_TRIGGER_INVALID`: the requested provider, resource or business date is outside the fixed user-trigger contract.
- `WEB_COLLECTION_JOB_INVALID`: provider, resource, date, range, key or forbidden instruction field is invalid.
- `WEB_COLLECTION_BUSINESS_DATE_MISMATCH`: the downloaded file's parsed first or last business date differs from the job date; the file is not ingested and the cursor does not advance.
- `WEB_COLLECTION_JOB_NOT_FOUND` / `WEB_COLLECTION_JOB_OWNER_MISMATCH`: missing or wrong runner job.
- `WEB_COLLECTION_STATE_CONFLICT` / `WEB_COLLECTION_TRANSITION_INVALID`: stale or illegal state update.
- `WEB_COLLECTION_RUN_INVALID` / `WEB_COLLECTION_NOTIFICATION_INVALID`: invalid completion or notification metadata.

## Compatibility, capacity and rollback

This is an additive v1 API. New providers add code adapters and registered resource IDs without changing the shared task schema. The migration adds five metadata tables and does not mutate ERP fact or archive tables. D1 stores small operational metadata only; binary exports remain in the local archive. Rollback disables the generic LaunchAgent and job creation while retaining jobs, runs, cursors and notifications for audit; the existing Kuaimai file scanner remains available.

## Observability and contract tests

Record runner ID, provider, resource, business date, task stage, attempt, safe error code, batch/archive ID, row count and timestamps. Never log raw page or source rows. Contract coverage lives in `tests/web-collection-schedule.test.mjs`, `tests/web-collection-migration.test.mjs` and `tests/web-collection-api.test.mjs`.
