# 抖店罗盘经营数据采集实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared company Chrome collector to acquire yesterday's Douyin store, product, live, and video operating facts from official reports and expose trusted completed batches through D1.

**Architecture:** Keep the retired credential-login flow retired and add a fixed, pre-authenticated Chrome adapter under provider ID `douyin-ecommerce`. The MV3 extension produces either an official download or a strictly typed `store_daily` capture; the local runner archives/parses it and writes immutable fact batches to the server-selected business database, while reads expose only completed batches and recomputed rates.

**Tech Stack:** React 18, Node.js ESM, Chrome MV3, Cloudflare Pages Functions, Cloudflare D1/SQLite, `node:test`, Vite.

## Global Constraints

- Daily target is yesterday at `05:00` in `Asia/Shanghai`.
- Initial resources are exactly `store_daily`, `product_daily`, `live_daily`, and `video_daily`.
- Official XLSX/CSV download is required for product, live, and video; only store daily may use fixed whitelisted page metrics.
- Do not store credentials, Cookie, Token, verification codes, full HTML/text, screenshots, network responses, absolute paths, or customer personal information.
- Do not use internal unpublished Douyin APIs, WebRequest interception, Debugger, Native Messaging, or automated captcha/slider/scan handling.
- Missing values remain `null`; rates and averages are recomputed from atomic numerators and denominators.
- Raw files remain on the company Mac; D1 stores standard facts, data quality, task/run metadata, and safe audit only.
- Business routes receive `businessDatabase(context)`; browsers, runners, and payloads cannot choose bindings or database IDs.
- Every new table declares a display-data policy; incomplete batches are never queryable.
- Keep Kuaimai behavior backward compatible and keep Qianchuan unavailable and separate.
- Do not start historical backfill in this release.
- Execute inline with `superpowers:executing-plans`; do not dispatch subagents because the user explicitly prefers inline work.

---

## File Map

**Governance and durable contracts**

- Modify `docs/platform/integration-registry.json`: change only the new pre-authenticated Douyin collection capability to `integrating`, preserving retired credential login in lifecycle notes.
- Modify `docs/platform/environment-capabilities.json`: declare business fact tables, control-plane migration, and no new secret.
- Modify `docs/platform/display-data-catalog.json` or the repository's actual catalog source: register batch metadata as `copy` and four fact tables as `transform_sales`.
- Create `docs/platform/commerce-facts-api.md`: document auth, request/response, errors, compatibility, observability, and display behavior.
- Create `docs/decisions/2026-07-24-douyin-preauthenticated-chrome-collection.md`: record the retired-login boundary.

**Control plane**

- Modify `src/domain/webCollection.js`: store-scoped keys, Douyin errors, result kinds.
- Modify `functions/api/platform/v1/web-collection/_shared/storage.js`: provider resources, `storeId`, daily jobs/cursors, target environment persistence.
- Modify `chrome-extension/company-data-collector/providers/registry.js`: allow and validate `storeId`.
- Create `migrations/0013_douyin_commerce_facts.sql`: store-scoped control schema and immutable commerce batches/facts.

**Facts**

- Create `src/domain/commerceFacts.js`: schemas, normalization, derived rates, quality.
- Create `functions/api/platform/v1/commerce-facts/_shared/storage.js`: batch staging/completion and completed-batch query using an explicit DB parameter.
- Create `functions/api/platform/v1/commerce-facts/ingest.js`: authenticated runner ingest route.
- Create `functions/api/platform/v1/commerce-facts/index.js`: authenticated business read route.

**Local collector**

- Create `scripts/web-data-collector/providers/douyin/index.mjs`: resource registry and processor.
- Create `scripts/web-data-collector/providers/douyin/parser.mjs`: XLSX/CSV recognition and standard mapping.
- Create `scripts/web-data-collector/providers/douyin/archive.mjs`: safe raw archive and content hash.
- Modify `scripts/web-data-collector/providers/index.mjs`: register Douyin.
- Modify `scripts/web-data-collector/orchestrator.mjs`: provider processor interface and `downloaded`/`captured` results.
- Modify `scripts/web-data-collector/index.mjs`: route provider results without Kuaimai-only branches.

**Chrome extension**

- Create `chrome-extension/company-data-collector/providers/douyin.js`: fixed origins/pages/actions and safe metric schema.
- Create `chrome-extension/company-data-collector/providers/executors/douyin.js`: page interaction executor.
- Create `chrome-extension/company-data-collector/providers/executors/kuaimai.js`: move existing Kuaimai-specific content behavior without changing it.
- Modify `chrome-extension/company-data-collector/content-script.js`: provider executor dispatch only.
- Modify `chrome-extension/company-data-collector/service-worker.js`: support downloaded and safe captured results.
- Modify `chrome-extension/company-data-collector/manifest.json`: fixed Douyin/Compass HTTPS hosts and scripts only.

**App**

- Modify `src/state/webCollectionApi.js`: generic trigger signature.
- Modify `src/domain/dataCenterConnectors.js`: Douyin Chrome official-report readiness.
- Modify `src/features/data-center/connections/DataConnectionsWorkspace.jsx`: truthful adapter state.
- Modify `src/features/data-center/DataGovernanceWorkspaces.jsx`: Douyin resources and recovery copy.

**Tests**

- Modify `tests/web-collection-schedule.test.mjs`, `tests/web-collection-api.test.mjs`, `tests/web-collection-migration.test.mjs`.
- Create `tests/commerce-facts-domain.test.mjs`, `tests/commerce-facts-api.test.mjs`, `tests/douyin-report-parser.test.mjs`, `tests/douyin-extension-adapter.test.mjs`.
- Modify `tests/web-data-collector-runtime.test.mjs`, `tests/web-data-collector-bridge.test.mjs`, `tests/chrome-collector-extension.test.mjs`.
- Modify `react-tests/data-access-hub.test.mjs`, `react-tests/data-sync-recovery.test.mjs`.

---

### Task 1: Lock Governance and Lifecycle Boundaries

**Files:**
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: repository display-data catalog source identified by `rg "transform_sales" docs src scripts`
- Create: `docs/platform/commerce-facts-api.md`
- Modify: `docs/features/douyin-compass-collection/tasks.md`
- Test: `tests/integration-registry.test.mjs`
- Test: `tests/environment-capabilities.test.mjs`

**Interfaces:**
- Consumes: ADR decision that credential login remains retired.
- Produces: registered `douyin-ecommerce` collection lifecycle, table display policies, generated platform manifests.

- [ ] **Step 1: Write failing lifecycle and table-policy assertions**

Add assertions that the registry entry identifies `preauthenticated_chrome_official_report`, status `integrating`, fixed resources, and lifecycle notes containing `credential login retired`. Add assertions that `commerce_fact_batches` is `copy` and the four facts tables are `transform_sales`.

```js
assert.equal(douyin.status, 'integrating')
assert.equal(douyin.capabilities.collectionMode, 'preauthenticated_chrome_official_report')
assert.deepEqual(douyin.capabilities.resources, [
  'store_daily',
  'product_daily',
  'live_daily',
  'video_daily',
])
assert.equal(displayPolicies.commerce_fact_batches, 'copy')
for (const table of COMMERCE_FACT_TABLES) {
  assert.equal(displayPolicies[table], 'transform_sales')
}
```

- [ ] **Step 2: Run governance tests and confirm failure**

Run:

```bash
node --test tests/integration-registry.test.mjs tests/environment-capabilities.test.mjs
npm run check:governance
```

Expected: FAIL because Douyin is still retired/file-only and commerce tables are unregistered.

- [ ] **Step 3: Update durable registries and API contract**

Record:

```json
{
  "status": "integrating",
  "capabilities": {
    "collectionMode": "preauthenticated_chrome_official_report",
    "resources": ["store_daily", "product_daily", "live_daily", "video_daily"],
    "credentialLogin": "retired",
    "manualFileImport": "fallback"
  }
}
```

The API document must define:

```text
POST /api/platform/v1/commerce-facts/ingest
GET  /api/platform/v1/commerce-facts
Auth: active company session; ingest additionally requires active runner lease and matching job grant
Write target: job.target_data_environment + job.target_data_environment_version
Errors: AUTH_REQUIRED, FORBIDDEN, INVALID_REQUEST, COLLECTION_JOB_MISMATCH,
        DATA_ENVIRONMENT_VERSION_STALE, COMMERCE_BATCH_INCOMPLETE,
        COMMERCE_FACT_SCHEMA_INVALID, INTERNAL_ERROR
```

Run:

```bash
npm run generate:platform-manifests
```

- [ ] **Step 4: Run registry and governance checks**

Run:

```bash
node --test tests/integration-registry.test.mjs tests/environment-capabilities.test.mjs
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/platform docs/decisions docs/features/douyin-compass-collection tests/integration-registry.test.mjs tests/environment-capabilities.test.mjs
git commit -m "docs: register Douyin Chrome collection"
```

---

### Task 2: Add Store-Scoped Collection Jobs and Cursors

**Files:**
- Modify: `src/domain/webCollection.js`
- Modify: `functions/api/platform/v1/web-collection/_shared/storage.js`
- Modify: `chrome-extension/company-data-collector/providers/registry.js`
- Create: `migrations/0013_douyin_commerce_facts.sql`
- Modify: `tests/web-collection-schedule.test.mjs`
- Modify: `tests/web-collection-api.test.mjs`
- Modify: `tests/web-collection-migration.test.mjs`

**Interfaces:**
- Consumes: provider ID and resources from Task 1.
- Produces:
  - `webCollectionJobKey({ providerId, storeId, resourceType, businessDate, scheduleVersion }) -> string`
  - normalized task field `storeId: string`
  - cursor uniqueness `(provider_id, store_id, resource_type)`.

- [ ] **Step 1: Write failing store isolation tests**

```js
assert.notEqual(
  webCollectionJobKey({
    providerId: 'douyin-ecommerce',
    storeId: 'store-a',
    resourceType: 'product_daily',
    businessDate: '2026-07-23',
    scheduleVersion: 'v1',
  }),
  webCollectionJobKey({
    providerId: 'douyin-ecommerce',
    storeId: 'store-b',
    resourceType: 'product_daily',
    businessDate: '2026-07-23',
    scheduleVersion: 'v1',
  }),
)
assert.equal(normalizeProjectedTask({ ...task, storeId: 'store-a' }).storeId, 'store-a')
assert.throws(() => normalizeProjectedTask({ ...task, storeId: 'store-a', url: 'https://evil.invalid' }))
```

Add a migration test verifying `web_collection_cursors` has `store_id` and a unique index across provider/store/resource, plus five commerce batch/fact tables.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test tests/web-collection-schedule.test.mjs tests/web-collection-api.test.mjs tests/web-collection-migration.test.mjs tests/chrome-collector-extension.test.mjs
```

Expected: FAIL on identical keys, rejected `storeId`, and missing migration tables.

- [ ] **Step 3: Implement store-scoped control contracts**

Use backward-compatible key behavior:

```js
export function webCollectionJobKey(input) {
  const parts = [input.providerId]
  if (input.storeId) parts.push(input.storeId)
  parts.push(input.resourceType, input.businessDate, input.scheduleVersion)
  return parts.join(':')
}
```

Add `storeId` to the strict task allowlist and validate it as a non-empty bounded platform identifier for Douyin. Register exactly four Douyin resources. Rebuild the cursor table in the migration:

```sql
CREATE TABLE web_collection_cursors_v2 (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  store_id TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL,
  last_success_business_date TEXT,
  last_attempt_business_date TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_id, store_id, resource_type)
);
INSERT INTO web_collection_cursors_v2 (...)
SELECT id, provider_id, '', resource_type, last_success_business_date, last_attempt_business_date, updated_at
FROM web_collection_cursors;
DROP TABLE web_collection_cursors;
ALTER TABLE web_collection_cursors_v2 RENAME TO web_collection_cursors;
ALTER TABLE web_collection_jobs ADD COLUMN store_id TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 4: Run control-plane tests**

```bash
node --test tests/web-collection-schedule.test.mjs tests/web-collection-api.test.mjs tests/web-collection-migration.test.mjs tests/chrome-collector-extension.test.mjs
```

Expected: PASS, including existing Kuaimai cases.

- [ ] **Step 5: Commit**

```bash
git add src/domain/webCollection.js functions/api/platform/v1/web-collection chrome-extension/company-data-collector/providers/registry.js migrations/0013_douyin_commerce_facts.sql tests
git commit -m "feat: scope collection jobs by store"
```

---

### Task 3: Implement Immutable Commerce Fact Batches

**Files:**
- Create: `src/domain/commerceFacts.js`
- Create: `functions/api/platform/v1/commerce-facts/_shared/storage.js`
- Create: `functions/api/platform/v1/commerce-facts/ingest.js`
- Create: `functions/api/platform/v1/commerce-facts/index.js`
- Modify: `migrations/0013_douyin_commerce_facts.sql`
- Create: `tests/commerce-facts-domain.test.mjs`
- Create: `tests/commerce-facts-api.test.mjs`

**Interfaces:**
- Consumes: job with `providerId`, `storeId`, `resourceType`, `businessDate`, target environment/version.
- Produces:

```ts
normalizeCommerceFact(resourceType, row): StandardFact
deriveCommerceMetrics(resourceType, row): Record<string, number | null>
stageCommerceFactChunk(db, { batch, rows }): Promise<{ acceptedCount: number }>
completeCommerceFactBatch(db, { batchId, expectedCount }): Promise<CompletedBatch>
queryCommerceFacts(db, filters): Promise<{ facts: object[], quality: object }>
```

- [ ] **Step 1: Write failing domain and API tests**

Test that absent values remain `null`, zero denominators return `null`, incomplete batches are hidden, a completed batch is returned, stale environment versions fail before writes, and facts use the middleware-selected DB.

```js
assert.equal(deriveCommerceMetrics('store_daily', {
  transactionAmount: 100,
  refundAmountByPaymentDate: null,
  transactionOrderCount: 0,
}).refundRate, null)
assert.equal(result.facts.length, 0, 'staged batch must remain invisible')
await completeCommerceFactBatch(db, { batchId: 'batch-1', expectedCount: 1 })
assert.equal((await queryCommerceFacts(db, filters)).facts.length, 1)
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test tests/commerce-facts-domain.test.mjs tests/commerce-facts-api.test.mjs
```

Expected: FAIL because modules and routes do not exist.

- [ ] **Step 3: Implement strict schemas and derived metrics**

Define exact allowlists per resource. Normalize numeric inputs with:

```js
function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) throw commerceFactError('COMMERCE_FACT_SCHEMA_INVALID')
  return number
}

function safeRatio(numerator, denominator) {
  return numerator === null || denominator === null || denominator === 0
    ? null
    : numerator / denominator
}
```

Reject unknown row keys and any key matching:

```js
/(cookie|token|password|credential|html|pageText|absolutePath|customerName|mobile|email)/i
```

- [ ] **Step 4: Implement batch storage and routes**

Facts are inserted with `batch_id`. `completeCommerceFactBatch` verifies `COUNT(*) === expectedCount`, then atomically marks the batch completed and previous completed batch for the same provider/store/resource/date superseded. Queries join only `commerce_fact_batches.status = 'completed'`.

The ingest route must:

```js
const job = await requireMatchingCollectionJob(controlDb, requestBody)
const businessDb = await resolveCollectionBusinessDatabase(context.env, {
  targetEnvironment: job.targetDataEnvironment,
  targetVersion: job.targetDataEnvironmentVersion,
})
return ingestCommerceFactChunk(businessDb, validatedBody)
```

The read route must:

```js
const db = businessDatabase(context)
return json(await queryCommerceFacts(db, validatedFilters))
```

- [ ] **Step 5: Run facts tests**

```bash
node --test tests/commerce-facts-domain.test.mjs tests/commerce-facts-api.test.mjs tests/web-collection-migration.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/commerceFacts.js functions/api/platform/v1/commerce-facts migrations/0013_douyin_commerce_facts.sql tests/commerce-facts-*.test.mjs tests/web-collection-migration.test.mjs
git commit -m "feat: store completed commerce fact batches"
```

---

### Task 4: Parse and Archive Official Douyin Reports

**Files:**
- Create: `scripts/web-data-collector/providers/douyin/parser.mjs`
- Create: `scripts/web-data-collector/providers/douyin/archive.mjs`
- Create: `scripts/web-data-collector/providers/douyin/index.mjs`
- Create: `tests/fixtures/douyin/store-daily.csv`
- Create: `tests/fixtures/douyin/product-daily.csv`
- Create: `tests/fixtures/douyin/live-daily.csv`
- Create: `tests/fixtures/douyin/video-daily.csv`
- Create: `tests/douyin-report-parser.test.mjs`

**Interfaces:**
- Consumes: downloaded file path known only to the local runner.
- Produces:

```ts
detectDouyinReport({ fileName, headers }): { resourceType, reportVersion }
parseDouyinReport({ filePath, resourceType, businessDate, storeId }): AsyncIterable<StandardFact>
archiveDouyinReport({ filePath, resourceType, businessDate, storeId, rootDir }): Promise<{ relativeArchiveKey, sha256 }>
createDouyinProcessor(options): ProviderResultProcessor
```

- [ ] **Step 1: Add sanitized fixtures and failing parser tests**

Use synthetic platform IDs/names and only business columns. Assert each fixture maps to exact canonical fields, wrong business dates fail, missing IDs fail for detail resources, and no source-only unknown columns survive.

```js
assert.deepEqual(await collect(parseDouyinReport(input)), [{
  providerId: 'douyin-ecommerce',
  storeId: 'store-test',
  businessDate: '2026-07-23',
  productId: 'product-001',
  skuId: null,
  productName: '测试商品',
  transactionAmount: 123.45,
  transactionQuantity: 3,
  refundAmount: null,
}])
```

- [ ] **Step 2: Run parser tests and confirm failure**

```bash
node --test tests/douyin-report-parser.test.mjs
```

Expected: FAIL because parser modules do not exist.

- [ ] **Step 3: Implement report signatures and field maps**

Reuse `streamSpreadsheetRows` from `src/domain/xlsxLite.js`. Each resource owns a fixed alias map and required header set:

```js
const PRODUCT_REQUIRED = ['商品ID', '商品名称']
const PRODUCT_ALIASES = {
  '商品ID': 'productId',
  'SKU ID': 'skuId',
  '商品名称': 'productName',
  '成交金额': 'transactionAmount',
  '成交件数': 'transactionQuantity',
  '退款金额': 'refundAmount',
}
```

Reject ambiguous signatures rather than guessing.

- [ ] **Step 4: Implement safe archive and processor**

Archive under:

```text
<root>/douyin-ecommerce/<storeId>/<resourceType>/<YYYY>/<MM>/<businessDate>/<sha256>.<ext>
```

Return only the relative archive key and SHA-256 to logs/API. Never upload the path. The processor parses in bounded chunks of 500 rows, sends `complete=false` chunks, then a final `complete=true` request containing `expectedCount`.

- [ ] **Step 5: Run parser tests**

```bash
node --test tests/douyin-report-parser.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/web-data-collector/providers/douyin tests/fixtures/douyin tests/douyin-report-parser.test.mjs
git commit -m "feat: parse Douyin official reports"
```

---

### Task 5: Add the Fixed Douyin MV3 Adapter

**Files:**
- Create: `chrome-extension/company-data-collector/providers/douyin.js`
- Create: `chrome-extension/company-data-collector/providers/executors/douyin.js`
- Create: `chrome-extension/company-data-collector/providers/executors/kuaimai.js`
- Modify: `chrome-extension/company-data-collector/providers/registry.js`
- Modify: `chrome-extension/company-data-collector/content-script.js`
- Modify: `chrome-extension/company-data-collector/service-worker.js`
- Modify: `chrome-extension/company-data-collector/manifest.json`
- Create: `tests/douyin-extension-adapter.test.mjs`
- Modify: `tests/kuaimai-extension-adapter.test.mjs`
- Modify: `tests/chrome-collector-extension.test.mjs`

**Interfaces:**
- Consumes: projected task `{ jobId, providerId, storeId, resourceType, businessDate, status, attempt, scheduleVersion }`.
- Produces:

```ts
DouyinExtensionResult =
  | { kind: 'downloaded', downloadId: number, safeFileName: string, pageType: string, reportVersion: string }
  | { kind: 'captured', resourceType: 'store_daily', facts: StoreDailyAtomicFacts, pageType: string, selectorVersion: string }
  | { kind: 'waiting_human', errorCode: string, safeSummary: string }
```

- [ ] **Step 1: Write failing allowlist and safety tests**

```js
assert.deepEqual(DOUYIN_ALLOWED_ORIGINS, [
  'https://fxg.jinritemai.com',
  'https://compass.jinritemai.com',
])
assert.throws(() => projectTask({ ...task, url: 'https://example.com' }))
assert.throws(() => validateDouyinCapture({ ...capture, pageText: 'entire page' }))
assert.throws(() => validateDouyinCapture({ ...capture, cookie: 'secret' }))
assert.equal(validateDouyinCapture(validStoreCapture).resourceType, 'store_daily')
```

Assert the manifest does not request `cookies`, `history`, `webRequest`, `debugger`, or `nativeMessaging`.

- [ ] **Step 2: Run extension tests and confirm failure**

```bash
node --test tests/douyin-extension-adapter.test.mjs tests/kuaimai-extension-adapter.test.mjs tests/chrome-collector-extension.test.mjs
```

Expected: FAIL because Douyin adapter is absent.

- [ ] **Step 3: Extract executor dispatch without changing Kuaimai behavior**

Make `content-script.js` dispatch only:

```js
const executor = EXECUTORS[task.providerId]
if (!executor) throw collectorError('PROVIDER_NOT_REGISTERED')
const result = await executor.execute(task, {
  document,
  location,
  sendMessage: chrome.runtime.sendMessage,
})
```

Move the existing Kuaimai implementation byte-for-byte in behavior into its executor and keep all Kuaimai tests green before adding Douyin.

- [ ] **Step 4: Implement Douyin pages, actions, and safe capture**

The adapter owns fixed entry paths and selectors. It validates visible logged-in state and a stable store identity before changing the date. Login, captcha, slider, scan, and device confirmation return `waiting_human`; they never attempt bypass.

Validate captured keys against:

```js
const STORE_DAILY_FACT_KEYS = new Set([
  'transactionAmount',
  'transactionOrderCount',
  'transactionBuyerCount',
  'userPaymentAmount',
  'settlementAmount',
  'refundAmountByPaymentDate',
  'refundAmountByRefundDate',
  'refundOrderCountByPaymentDate',
  'refundOrderCountByRefundDate',
  'productExposureUsers',
  'productClickUsers',
])
```

- [ ] **Step 5: Support captured results in the service worker**

For downloaded results, continue waiting on `chrome.downloads`. For captured results, send only the validated fixed fact object to the local bridge. Reject any captured result from non-store resources.

- [ ] **Step 6: Run extension tests**

```bash
node --test tests/douyin-extension-adapter.test.mjs tests/kuaimai-extension-adapter.test.mjs tests/chrome-collector-extension.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add chrome-extension/company-data-collector tests/douyin-extension-adapter.test.mjs tests/kuaimai-extension-adapter.test.mjs tests/chrome-collector-extension.test.mjs
git commit -m "feat: add fixed Douyin Chrome adapter"
```

---

### Task 6: Generalize Local Processing and Result Completion

**Files:**
- Modify: `scripts/web-data-collector/providers/index.mjs`
- Modify: `scripts/web-data-collector/orchestrator.mjs`
- Modify: `scripts/web-data-collector/index.mjs`
- Modify: local bridge safe result schema file identified by `rg "downloaded" scripts/web-data-collector`
- Modify: `tests/web-data-collector-runtime.test.mjs`
- Modify: `tests/web-data-collector-bridge.test.mjs`
- Modify: `tests/web-data-collector-automation.test.mjs`

**Interfaces:**
- Consumes: `DouyinExtensionResult` from Task 5 and `createDouyinProcessor` from Task 4.
- Produces:

```ts
ProviderResultProcessor.process({
  job,
  result,
  target,
}): Promise<{
  rowCount: number,
  coverage: number,
  confidence: 'high' | 'medium' | 'low',
  batchId: string,
}>
```

- [ ] **Step 1: Write failing provider routing tests**

```js
assert.equal(registry.get('kuaimai').id, 'kuaimai')
assert.equal(registry.get('douyin-ecommerce').id, 'douyin-ecommerce')
await assert.rejects(
  orchestrator.complete({ job, result: { kind: 'downloaded' } }),
  /PROCESSOR_NOT_REGISTERED/,
)
assert.equal((await douyinProcessor.process({ job, result: captured })).rowCount, 1)
```

Also assert that processor failure records a failed run and does not complete the job or advance the cursor.

- [ ] **Step 2: Run runtime tests and confirm failure**

```bash
node --test tests/web-data-collector-runtime.test.mjs tests/web-data-collector-bridge.test.mjs tests/web-data-collector-automation.test.mjs
```

Expected: FAIL because processing is Kuaimai-only and captured results are rejected.

- [ ] **Step 3: Implement the provider processor registry**

```js
export function createProviderProcessorRegistry(processors) {
  const byId = new Map(processors.map((processor) => [processor.id, processor]))
  return {
    require(providerId) {
      const processor = byId.get(providerId)
      if (!processor) throw collectorError('PROCESSOR_NOT_REGISTERED')
      return processor
    },
  }
}
```

The orchestrator must call the selected processor before `completeJob`. Only processor success may complete the job and advance its cursor.

- [ ] **Step 4: Extend the strict local bridge result union**

Accept only:

```js
{ kind: 'downloaded', jobId, downloadId, safeFileName, pageType, reportVersion }
{ kind: 'captured', jobId, resourceType: 'store_daily', facts, pageType, selectorVersion }
{ kind: 'waiting_human', jobId, errorCode, safeSummary }
```

Reject unknown fields and enforce payload size limits. Do not log fact values; log job/resource/count only.

- [ ] **Step 5: Run local runtime tests**

```bash
node --test tests/web-data-collector-runtime.test.mjs tests/web-data-collector-bridge.test.mjs tests/web-data-collector-automation.test.mjs tests/douyin-report-parser.test.mjs
```

Expected: PASS, including Kuaimai.

- [ ] **Step 6: Commit**

```bash
git add scripts/web-data-collector tests/web-data-collector-*.test.mjs
git commit -m "feat: route collector results by provider"
```

---

### Task 7: Expose Truthful Connection and Recovery UI

**Files:**
- Modify: `src/state/webCollectionApi.js`
- Modify: `src/domain/dataCenterConnectors.js`
- Modify: `src/features/data-center/connections/DataConnectionsWorkspace.jsx`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `react-tests/data-access-hub.test.mjs`
- Modify: `react-tests/data-sync-recovery.test.mjs`

**Interfaces:**
- Consumes: generic web collection provider/resource state and errors.
- Produces:

```ts
triggerWebCollection({
  providerId,
  storeId,
  resourceType,
  businessDate,
  force,
}): Promise<WebCollectionJob>
```

- [ ] **Step 1: Write failing UI contract tests**

Assert Douyin says “Chrome 官方报表采集”, lists four resources, never says “已接通” without real readiness, shows provider-specific recovery actions, and keeps Qianchuan “尚未接入”.

```js
assert.match(source, /Chrome 官方报表采集/)
assert.match(source, /店铺每日/)
assert.match(source, /商品每日/)
assert.match(source, /直播每日/)
assert.match(source, /短视频每日/)
assert.match(source, /打开抖店处理/)
assert.doesNotMatch(source, /巨量千川.*已接通/s)
```

- [ ] **Step 2: Run UI tests and confirm failure**

```bash
node --test react-tests/data-access-hub.test.mjs react-tests/data-sync-recovery.test.mjs
```

Expected: FAIL because Douyin remains file-sample-only.

- [ ] **Step 3: Add generic trigger and truthful state mapping**

Replace the Kuaimai-only client entry with:

```js
export function triggerWebCollection(input) {
  return apiRequest('/api/platform/v1/web-collection/trigger', {
    method: 'POST',
    body: input,
  })
}
```

Keep `triggerKuaimaiSalesCollection` as a compatibility wrapper.

Map Douyin states:

```js
const DOUYIN_RECOVERY = {
  DOUYIN_LOGIN_REQUIRED: '在公司 Mac 的同一 Chrome Profile 登录抖店',
  DOUYIN_HUMAN_VERIFICATION_REQUIRED: '在公司 Mac 完成平台验证',
  DOUYIN_REPORT_SCHEMA_CHANGED: '页面字段已变化，等待采集适配',
}
```

- [ ] **Step 4: Verify responsive and interaction behavior**

Run component tests, then use the local app at 1440, 1180, 640, and 390px. Selecting filters must not issue a request; only “查询/刷新” triggers reads. Check focus, disabled reason, error, empty, and partial-success states.

- [ ] **Step 5: Run UI tests**

```bash
node --test react-tests/data-access-hub.test.mjs react-tests/data-sync-recovery.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/webCollectionApi.js src/domain/dataCenterConnectors.js src/features/data-center react-tests/data-access-hub.test.mjs react-tests/data-sync-recovery.test.mjs
git commit -m "feat: show Douyin collection readiness"
```

---

### Task 8: Run Real Yesterday Acceptance and Publish

**Files:**
- Modify only if real evidence requires selector/report-map changes in:
  - `chrome-extension/company-data-collector/providers/douyin.js`
  - `chrome-extension/company-data-collector/providers/executors/douyin.js`
  - `scripts/web-data-collector/providers/douyin/parser.mjs`
- Modify: `docs/features/douyin-compass-collection/tasks.md`
- Create: `docs/features/douyin-compass-collection/acceptance-2026-07-24.md`

**Interfaces:**
- Consumes: complete collection vertical slice.
- Produces: real result for business date `2026-07-23`, with per-resource run and completed D1 batch or actionable safe failure.

- [ ] **Step 1: Read executing and verification skills**

Read `superpowers:executing-plans`, `superpowers:test-driven-development`, project `verification`, and `superpowers:verification-before-completion` completely before implementation/completion claims.

- [ ] **Step 2: Run all targeted automated tests**

```bash
node --test \
  tests/web-collection-schedule.test.mjs \
  tests/web-collection-api.test.mjs \
  tests/web-collection-migration.test.mjs \
  tests/commerce-facts-domain.test.mjs \
  tests/commerce-facts-api.test.mjs \
  tests/douyin-report-parser.test.mjs \
  tests/douyin-extension-adapter.test.mjs \
  tests/web-data-collector-runtime.test.mjs \
  tests/web-data-collector-bridge.test.mjs \
  tests/web-data-collector-automation.test.mjs \
  react-tests/data-access-hub.test.mjs \
  react-tests/data-sync-recovery.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Reload the unpacked extension and run yesterday**

Reload the installed unpacked extension from:

```text
/Users/roger/Documents/product-flow-system/.worktrees/data-sync-resource-retry/chrome-extension/company-data-collector
```

Use the already logged-in company Chrome Profile. Trigger the four resources for `2026-07-23`. Do not enter or store credentials. If login or verification is required, record `waiting_human` and the exact safe operator action instead of bypassing it.

- [ ] **Step 4: Verify local archive, control records, and D1 facts**

For every resource verify:

```text
job status and run status agree
businessDate = 2026-07-23
storeId matches the registered store
successful file resource has a relative archive key and SHA-256
completed D1 batch count equals expectedCount
failed/waiting resource has an error code and safe recovery action
no absolute path, page text, Cookie, Token, credential, or PII appears in API/log records
```

Query `/api/platform/v1/commerce-facts` explicitly after choosing filters; confirm no request fires merely from changing dates.

- [ ] **Step 5: Run full Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Rebase/update from current main and re-run branch gate**

```bash
git fetch origin main
git merge --no-edit origin/main
npm run check:branch-base
```

Resolve only task-owned conflicts and rerun affected tests plus the full Definition of Done.

- [ ] **Step 7: Commit acceptance evidence**

```bash
git add docs/features/douyin-compass-collection/acceptance-2026-07-24.md docs/features/douyin-compass-collection/tasks.md
git commit -m "test: record Douyin collection acceptance"
```

- [ ] **Step 8: Publish through GitOps**

Use the repository publish workflow to push `codex/douyin-compass-collection`, open a ready PR with:

```text
Integration-Impact: douyin-ecommerce, browser-market-collector, erp-file-import, kuaimai, cloudflare-pages, cloudflare-d1
Integration-Impact-Reason: Extends the shared Chrome collection runtime and writes standard commerce facts through the governed D1 business-data boundary.
Rule-Writeback: docs/decisions/2026-07-24-douyin-preauthenticated-chrome-collection.md, docs/platform/commerce-facts-api.md, docs/platform/integration-registry.json, docs/platform/environment-capabilities.json
Rule-Writeback-Reason: Adds a provider lifecycle exception, shared acquisition contract, business fact API, migration, display policy, and target-environment write rule.
```

Merge only after required checks pass. Let Cloudflare Git integration deploy main; do not direct-upload.

- [ ] **Step 9: Verify production**

From the primary repository root:

```bash
node --env-file=.env scripts/check-deployed-readiness.mjs \
  --url https://product-flow-system.pages.dev \
  --require-platform cloudflare-pages \
  --require-platform cloudflare-d1
```

Verify production loads without a white screen, the data-access Douyin card is truthful, sync records show success and failure, and the authenticated commerce facts API returns completed batches only.
