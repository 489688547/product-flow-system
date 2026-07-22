# 商品关系图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared ERP catalog with authoritative bundle components and use that graph for inventory-unit sales consumption and cost.

**Architecture:** Keep `/api/platform/v1/product-catalog*` and `ProductCatalogProvider` as the shared boundary. Normalize provider payloads into a pure domain graph, persist component edges in D1, fetch Kuaimai details in bounded cursor batches, and let goods-flow import read the shared catalog server-side before projecting sales and inventory facts.

**Tech Stack:** React 19, Cloudflare Pages Functions, Cloudflare D1, Node test runner, existing Kuaimai HMAC adapter.

## Global Constraints

- An ERP inventory-unit code may be a standard `69` barcode or any non-empty internal unique code such as `1111`.
- Missing and conflicting duplicate codes are data issues; non-EAN formatting is not an error.
- `item.single.get` and `suitSingleList` are authoritative for components and integer ratios.
- Browser code never calls Kuaimai or D1 directly; provider payloads stay at the adapter boundary.
- Net sales is recorded once per sellable line; component expansion affects quantity, cost and attribution only.
- Existing items, SKUs, product links and supply links remain backward compatible.

---

### Task 1: Pure product graph domain

**Files:**
- Create: `src/domain/productCatalogGraph.js`
- Modify: `src/domain/productCatalog.js`
- Create: `react-tests/product-catalog-graph.test.mjs`

**Interfaces:**
- Consumes: normalized catalog items and their `components`/`skus`.
- Produces: `normalizeCatalogComponent`, `flattenCatalogConsumption`, `catalogSellableQuantity`, and `catalogDataIssues`.

- [ ] Write failing tests with `BYMSDHBD` as two `×1` components, `2DGZZ` as `1111 ×2`, a nested bundle, a cycle, and a duplicate code.
- [ ] Run `node --test react-tests/product-catalog-graph.test.mjs` and confirm missing exports fail.
- [ ] Implement non-empty internal codes as `internal_unique`, positive integer ratios, recursive leaf aggregation and cycle-safe issues.
- [ ] Run `node --test react-tests/product-catalog-graph.test.mjs react-tests/product-catalog.test.mjs` and confirm all pass.
- [ ] Commit domain files and tests with `feat(catalog): model ERP bundle components`.

### Task 2: Kuaimai detail reader

**Files:**
- Modify: `functions/api/kuaimai/_shared/kuaimai.js`
- Modify: `tests/product-catalog-kuaimai.test.mjs`

**Interfaces:**
- Consumes: Kuaimai catalog candidates where `type` is `1`/`2` or `typeTag` is `3`/`4`.
- Produces: `pullKuaimaiProductDetails(config, items, {cursor,maxDetails}, fetchImpl)` returning `{details,failures,nextCursor,complete,totalCandidates}`.

- [ ] Add failing tests asserting `item.single.get`, `sysItemId` preference, `suitSingleList`, 30-detail bounds, next cursor and safe per-item failure.
- [ ] Run `node --test tests/product-catalog-kuaimai.test.mjs` and confirm the new import fails.
- [ ] Implement the reader by reusing `callKuaimai`; never log or return credentials/raw responses.
- [ ] Run the focused test and confirm all cases pass.
- [ ] Commit with `feat(kuaimai): read product component details`.

### Task 3: D1 component storage and sync cursor

**Files:**
- Create: `migrations/0006_product_catalog_components.sql`
- Modify: `functions/api/platform/v1/product-catalog/_shared/storage.js`
- Modify: `functions/api/platform/v1/product-catalog/sync/kuaimai.js`
- Modify: `tests/product-catalog-api.test.mjs`
- Modify: `tests/product-catalog-kuaimai.test.mjs`

**Interfaces:**
- Consumes: normalized items with fetched components and `cursor` JSON request.
- Produces: `replaceProductCatalogComponents(db, items, context)` and API response `{synced,complete,nextCursor,progress,counts}`.

- [ ] Add failing D1 tests for table creation, parent-scoped replacement, partial failure preservation, cost redaction and old-row compatibility.
- [ ] Run the two focused API tests and confirm SQL/response assertions fail.
- [ ] Add the component table, storage mapping, coverage meta, vault-backed `resolveKuaimaiConfig`, and bounded cursor response.
- [ ] Run focused API tests and migration/environment alignment tests.
- [ ] Commit with `feat(catalog): persist bundle component graph`.

### Task 4: Cursor client and flat catalog UI

**Files:**
- Modify: `src/state/productCatalogApi.js`
- Modify: `src/state/ProductCatalogProvider.jsx`
- Modify: `src/features/data-center/ProductCatalogWorkspace.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/product-catalog-provider.test.mjs`
- Modify: `react-tests/product-catalog-ui.test.mjs`

**Interfaces:**
- Consumes: sync API cursor responses and catalog `components`.
- Produces: one user action that continues until `complete`, progress state, and flat table cells for item type and component ratios.

- [ ] Add failing tests for repeated cursor POSTs, progress, internal code copy, no nested navigation and nowrap component text.
- [ ] Run the two focused React tests and confirm failure.
- [ ] Implement a maximum 40-iteration client guard, provider progress text, updated metrics and the `库存组成` column.
- [ ] Run focused React tests and lint changed UI.
- [ ] Commit with `feat(data): show ERP inventory composition`.

### Task 5: Goods-flow bundle consumption

**Files:**
- Modify: `functions/api/kuaimai/_shared/kuaimai.js`
- Modify: `functions/api/platform/v1/goods-flow/imports.js`
- Modify: `functions/api/platform/v1/goods-flow/_shared/legacyProjection.js`
- Modify: `tests/goods-flow-storage.test.mjs`
- Modify: `tests/goods-flow-api.test.mjs`
- Modify: `react-tests/kuaimai.test.mjs`

**Interfaces:**
- Consumes: sellable codes from Kuaimai orders plus server-read catalog graph.
- Produces: one `sale_consumed` event with `payload.components[]`, aggregate cost once and inventory-unit matches for ERP snapshots.

- [ ] Add failing tests proving `2DGZZ ×3` yields component `1111` quantity `6`, net sales once, and alpha master codes are no longer skipped.
- [ ] Run focused goods-flow/Kuaimai tests and confirm failure.
- [ ] Read the catalog in the authenticated goods-flow route, expand via the domain graph, and fall back to source cost when provided.
- [ ] Run focused goods-flow and metric projection tests.
- [ ] Commit with `feat(goods-flow): consume bundle sales by component`.

### Task 6: Governance, migration and verification

**Files:**
- Modify: `PRODUCT.md`
- Modify: `docs/product/data-definitions.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/features/erp-product-graph/tasks.md`

**Interfaces:**
- Produces: registered Kuaimai product-detail capability, D1 table requirement, documented API compatibility and rollback.

- [ ] Update durable rules and mark task evidence with exact commands/results.
- [ ] Run `npm run generate:platform-manifests`.
- [ ] Run `npm run lint`, `npm run check:governance`, `npm run check:integrations`, `npm run check:environment-capabilities`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Verify 1440/900/640/390px, keyboard/focus, empty/error/disabled states, console and DingTalk WebView.
- [ ] Commit with `docs(platform): govern ERP product graph`.
