# 共享商品主数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立由数据中心维护、产品全周期与供应链共同消费的统一 ERP 商品及 SKU/69 码目录。

**Architecture:** 新增平台级领域模型、Provider 和 `/api/platform/v1/product-catalog` 契约，D1 以商品、SKU、同步批次和元数据分表保存。快麦与文件导入只进入服务端目录边界，业务 App 通过稳定目录 ID 引用，旧产品及供应链字段继续兼容。

**Tech Stack:** React 19、Cloudflare Pages Functions、D1、Node test、现有轻量 XLSX/CSV 解析器。

## Global Constraints

- 功能页面不能直接调用快麦；快麦适配只位于 `functions/api/kuaimai` 或平台 API 服务端边界。
- 数据中心是商品目录唯一写入口，业务 App 只读目录并保存关联 ID。
- 不保存凭据、Cookie、原始 ERP 整行或完整外部响应。
- 新表、环境能力、集成注册、API 文档、迁移和回滚必须同一变更交付。
- 旧 `skuCodes`、`productId` 和现有 API 保持兼容。

---

### Task 1: 商品目录领域契约

**Files:**
- Create: `src/domain/productCatalog.js`
- Test: `react-tests/product-catalog.test.mjs`

**Interfaces:**
- Produces: `normalizeCatalogItem(input, context)`, `normalizeCatalogSku(input, context)`, `normalizeCatalogPayload(input)`, `catalogBarcodesForProduct(items, productId)`, `parseProductCatalogRows(rows, context)`。

- [ ] 写入失败测试，覆盖快麦嵌套商品/SKU、中文文件表头、稳定 ID、条码分类、重复 SKU 合并和异常行。
- [ ] 运行 `node --test react-tests/product-catalog.test.mjs`，确认因模块缺失失败。
- [ ] 实现最小纯领域逻辑，不访问 React、网络或浏览器。
- [ ] 重跑测试并确认通过。

### Task 2: D1 存储与平台 API

**Files:**
- Create: `functions/api/platform/v1/product-catalog/_shared/storage.js`
- Create: `functions/api/platform/v1/product-catalog/index.js`
- Create: `functions/api/platform/v1/product-catalog/import.js`
- Create: `migrations/0003_product_catalog.sql`
- Test: `tests/product-catalog-api.test.mjs`

**Interfaces:**
- Produces: `readProductCatalog(db, options)`, `replaceProductCatalog(db, payload, actor)`, `upsertProductCatalog(db, payload, actor)`；GET 返回 `{items, meta}`，POST 导入返回 `{synced, counts, meta}`。

- [ ] 写入 API 失败测试，覆盖登录、部门、readonly、成本字段裁剪、D1 缺失、校验、幂等导入和失败不覆盖。
- [ ] 运行 `node --test tests/product-catalog-api.test.mjs` 确认失败。
- [ ] 实现新增表、分批写入、完整批次提交和权限过滤。
- [ ] 重跑测试并确认通过。

### Task 3: 快麦全量商品同步

**Files:**
- Modify: `functions/api/kuaimai/_shared/kuaimai.js`
- Create: `functions/api/platform/v1/product-catalog/sync/kuaimai.js`
- Test: `tests/product-catalog-kuaimai.test.mjs`

**Interfaces:**
- Produces: `pullKuaimaiProductCatalog(config, {pageNo, pageSize, maxPages}, fetchImpl)`，调用 `item.list.query`，解析 `items` 或 JSON `body`，最多每页 200 条；同步端点只在全部分页完成后幂等合并，保留商品档案文件补齐的 SKU 与 69 码。

- [ ] 写入分页、空页、JSON body、提供商错误、页数保护和原子提交测试。
- [ ] 运行聚焦测试确认失败。
- [ ] 实现同步并复用现有签名、配置和错误模型。
- [ ] 重跑聚焦测试确认通过。

### Task 4: 共享客户端与 Provider

**Files:**
- Create: `src/state/productCatalogApi.js`
- Create: `src/state/ProductCatalogProvider.jsx`
- Modify: `src/main.jsx`
- Test: `react-tests/product-catalog-provider.test.mjs`

**Interfaces:**
- Produces: `useProductCatalog()` 返回 `items`, `meta`, `loading`, `error`, `refresh`, `importRows`, `syncKuaimai`；Provider 位于认证边界内并包裹产品、数据中心和供应链 Provider。

- [ ] 写入客户端 URL、错误保留、Provider 挂载和刷新契约失败测试。
- [ ] 运行聚焦测试确认失败。
- [ ] 实现客户端与共享 Provider，加载失败不清空最后成功目录。
- [ ] 重跑测试确认通过。

### Task 5: 数据中心商品主数据工作区

**Files:**
- Create: `src/features/data-center/ProductCatalogWorkspace.jsx`
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/product-catalog-ui.test.mjs`

**Interfaces:**
- Consumes: `useProductCatalog()` 与 `streamSpreadsheetRows(file, onRow)`。
- Produces: `data-products` 路由、筛选状态带、目录表、文件预览、同步动作和响应式样式。

- [ ] 写入导航、文案、过滤、加载/空/错/禁用、导入确认和可读表格测试。
- [ ] 运行聚焦测试确认失败。
- [ ] 实现单一高密度工作区，不增加页内层级。
- [ ] 重跑测试确认通过。

### Task 6: 产品全周期关联共享商品

**Files:**
- Create: `src/features/product-catalog/ProductCatalogSelect.jsx`
- Modify: `src/features/archive/ProductModal.jsx`
- Modify: `src/features/archive/ProductArchivePage.jsx`
- Modify: `src/state/stateModel.js`
- Modify: `src/features/sales/useProductSalesRows.js`
- Test: `react-tests/product-catalog-product-link.test.mjs`

**Interfaces:**
- 产品记录新增兼容字段 `catalogProductId`；保存关联时用目录标准条码校准 `skuCodes`，保留相同条码的人工 `price`。

- [ ] 写入旧记录兼容、关联选择、SKU 派生和销售查询测试。
- [ ] 运行聚焦测试确认失败。
- [ ] 实现可搜索选择和兼容派生。
- [ ] 重跑测试确认通过。

### Task 7: 供应链与供应商消费共享目录

**Files:**
- Modify: `src/features/supply-chain/SupplyChainAppPage.jsx`
- Modify: `src/features/supply-chain/ProductSupplyWorkspace.jsx`
- Modify: `src/features/supply-chain/SupplierWorkspace.jsx`
- Modify: `src/domain/supplyChain.js`
- Test: `react-tests/supply-chain-ui.test.mjs`
- Test: `react-tests/supply-chain.test.mjs`

**Interfaces:**
- 供应关系新增 `catalogProductId`、可选 `catalogSkuId` 并保留旧 `productId`；供应链主表由目录商品驱动；供应商表展示已关联目录商品数。

- [ ] 写入旧关系迁移、目录商品展示、搜索过滤、关联保存和覆盖数测试。
- [ ] 运行聚焦测试确认失败。
- [ ] 实现目录驱动的产品供应链和供应商覆盖统计。
- [ ] 重跑测试确认通过。

### Task 8: 平台治理、环境与验证

**Files:**
- Modify: `PRODUCT.md`
- Modify: `docs/product/data-definitions.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/environment-capabilities.json`
- Create: `docs/decisions/2026-07-19-shared-product-catalog.md`
- Modify: `docs/features/shared-product-catalog/tasks.md`

**Interfaces:**
- Produces: `product-catalog` 环境能力，声明 D1 表、快麦商品同步、认证/权限/错误/兼容/回滚和两个以上真实消费者。

- [ ] 更新 durable docs、注册表、环境能力与 ADR，并运行 `npm run generate:platform-manifests`。
- [ ] 运行 `npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`、`npm run build`。
- [ ] 本地检查键盘、焦点、加载/空/错/禁用、1440/900/640/390px、控制台和钉钉 WebView 布局。
- [ ] 检查 `git diff --check`、`git status --short`，只保留本功能文件。
