# Kuaimai ERP History Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user requires inline execution without subagents.

**Goal:** Collect Kuaimai ERP export history through the logged-in browser, ingest it idempotently into governed D1 storage, and provide a reusable project Skill.

**Architecture:** Chrome produces official exports only. A local streaming parser creates bounded batches; an authenticated Pages Function stores batch metadata, raw JSON rows and issues, then later projects verified resources into existing sales, catalog and goods-flow models.

**Tech Stack:** Node.js ESM, native Web APIs, Cloudflare Pages Functions, D1 SQL, Node test runner, project-local Agent Skill.

## Global Constraints

- Order business date is Kuaimai order creation time in Asia/Shanghai.
- Include both recent and archived orders for full history.
- Never persist credentials, Cookie, OTP, browser session or unmasked customer PII.
- Preserve provider values in raw records; normal operating reports exclude Other/Unknown.
- Every provider, D1 and environment change updates the integration registry and environment capability manifest.
- All code uses failing tests first; no subagents are used.

---

### Task 1: Persisted collection contract

**Files:**
- Create: `migrations/0007_kuaimai_erp_collection.sql`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Create: `tests/kuaimai-erp-collection-migration.test.mjs`

**Interfaces:**
- Produces tables `erp_collection_batches`, `erp_source_records`, `erp_collection_issues`.
- Enforces unique batch hashes and unique `(resource_type, source_key)` current records.

- [ ] Write a migration test that extracts required tables, columns, unique indexes and foreign keys.
- [ ] Run `node --test tests/kuaimai-erp-collection-migration.test.mjs`; expect failure because migration is absent.
- [ ] Add the minimal additive migration and update both executable platform manifests.
- [ ] Run the focused test and `npm run generate:platform-manifests`; expect pass.
- [ ] Commit only Task 1 files with `feat(data): add ERP collection storage contract`.

### Task 2: Domain normalization and ingest API

**Files:**
- Create: `src/domain/kuaimaiErpCollection.js`
- Create: `functions/api/platform/v1/erp-collection/_shared/authorization.js`
- Create: `functions/api/platform/v1/erp-collection/_shared/storage.js`
- Create: `functions/api/platform/v1/erp-collection/ingest.js`
- Create: `tests/kuaimai-erp-collection-domain.test.mjs`
- Create: `tests/kuaimai-erp-collection-api.test.mjs`
- Create: `tests/helpers/kuaimai-erp-d1-mock.mjs`

**Interfaces:**
- `normalizeErpCollectionBatch(input)` returns bounded canonical batch metadata or throws a stable validation error.
- `normalizeErpSourceRecord(resourceType, row, mapping)` returns `{sourceKey, occurredAt, modifiedAt, shopId, warehouseId, payload, contentHash}`.
- `POST /api/platform/v1/erp-collection/ingest` accepts at most 500 records and requires an `Idempotency-Key`.

- [ ] Write domain tests for creation-time timezone handling, stable keys, unknown resources, PII keys and missing required fields.
- [ ] Run the domain test; expect module-not-found failure.
- [ ] Implement the minimal pure domain module and rerun until green.
- [ ] Write API tests for session, role, D1, idempotency, duplicate rows, partial issues and safe errors.
- [ ] Run the API test; expect route-not-found failure.
- [ ] Implement authorization, storage and route with prepared statements and batches of at most 50 statements.
- [ ] Run both focused tests; expect pass.
- [ ] Commit Task 2 files with `feat(data): ingest Kuaimai ERP batches`.

### Task 3: File preflight and upload CLI

**Files:**
- Create: `scripts/kuaimai-erp-collector/core.mjs`
- Create: `scripts/kuaimai-erp-collector/api.mjs`
- Create: `scripts/kuaimai-erp-collector/index.mjs`
- Create: `tests/fixtures/kuaimai/orders-sample.csv`
- Create: `tests/kuaimai-erp-collection-cli.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `inspectKuaimaiExport(file, options)` returns headers, rows, resource type, range, hash and issues without uploading.
- `buildUploadChunks(preflight, size = 500)` returns deterministic idempotent request bodies.
- `npm run collect:kuaimai -- --check --resource orders <file>` never performs a network write.

- [ ] Write a fixture-driven test for CSV/XLSX streaming, header aliases, deterministic hashes, chunking and dry-run behavior.
- [ ] Run the test; expect module-not-found failure.
- [ ] Implement the minimal core and CLI, reusing `src/domain/xlsxLite.js`.
- [ ] Run the focused test; expect pass with no external writes.
- [ ] Commit Task 3 files with `feat(data): add Kuaimai export collector`.

### Task 4: Project Skill and durable rules

**Files:**
- Create: `.agents/skills/kuaimai-erp-data-collection/SKILL.md`
- Create: `.agents/skills/kuaimai-erp-data-collection/references/export-map.md`
- Create: `tests/kuaimai-erp-collection-skill.test.mjs`
- Modify: `PRODUCT.md`
- Modify: `docs/product/data-definitions.md`
- Modify: `docs/platform/integrations.md`

**Interfaces:**
- Skill triggers on Kuaimai history, ERP export, order backfill, stock snapshot and reconciliation requests.
- Skill requires integration routing, creation-time scope, recent plus archive coverage, dry-run, idempotent import and production verification.

- [ ] Write a deterministic contract test that fails while the Skill is absent and verifies trigger metadata and mandatory safety/coverage gates.
- [ ] Run it and confirm expected failure.
- [ ] Write the minimal Skill and export reference; update durable product/platform rules.
- [ ] Run the Skill test and governance checks; expect pass.
- [ ] Commit Task 4 files with `docs(skill): add Kuaimai ERP collection workflow`.

### Task 5: Real order export and historical backfill

**Files:**
- Modify mappings only when the real export headers differ from the tested aliases.
- Do not commit exported company data.

**Interfaces:**
- Input is Kuaimai order and order-detail exports covering recent and archived ranges.
- Output is production batch IDs, row counts, date coverage, duplicate counts and issues.

- [ ] Use the logged-in Chrome to export one bounded order-detail sample using order creation time.
- [ ] Run CLI `--check`; compare file row count, earliest/latest creation time and required headers with Kuaimai.
- [ ] Add a failing fixture test for each newly observed header alias, then update mapping and rerun.
- [ ] Import the bounded sample through the governed production route and verify idempotency by retrying it once.
- [ ] Export history in monthly or smaller ranges, including archived orders, and import each verified batch.
- [ ] Query coverage through the read endpoint and reconcile total orders/items against export totals.
- [ ] Record actual evidence in `docs/features/kuaimai-erp-history/tasks.md` without customer data.

### Task 6: Remaining ERP resources

**Files:**
- Extend domain mappings, fixtures and projections one resource at a time.

**Interfaces:**
- Resource sequence: products/SKUs, inventory snapshot, inventory movements, suppliers, purchase documents, aftersales, shops/warehouses, finance exports.

- [ ] For each resource, export a bounded sample and write a failing fixture test for its real headers.
- [ ] Add only the required mapping and projection into existing product catalog or goods-flow models.
- [ ] Verify a repeated sample is idempotent before starting full history.
- [ ] Backfill historical facts and establish a daily current-inventory snapshot.
- [ ] Run the full Definition of Done and production readiness checks for `kuaimai`, `erp-file-import`, `cloudflare-d1`, and `cloudflare-pages`.
