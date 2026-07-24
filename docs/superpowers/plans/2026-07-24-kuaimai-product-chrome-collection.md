# 快麦商品浏览器采集实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让商品主数据页通过公司 Chrome 插件完整采集快麦普通商品、套件和组合装，自动归档、写入 D1，并在成功后刷新商品与销售归属。

**Architecture:** 商品页只调用共享网页采集任务 API，不直接控制 Chrome 或快麦。服务端把一次商品刷新展开为三个当前快照任务；扩展内的快麦适配器分别执行固定官方导出动作，本机执行器沿用归档和 ERP ingest，再由商品投影统一写入商品目录。

**Tech Stack:** React、Chrome MV3、Node.js ESM、Cloudflare Pages Functions、Cloudflare D1、Node Test Runner。

## Global Constraints

- 不使用未打通的快麦 API。
- 不读取或上传密码、Cookie、Token、验证码、页面正文或截图。
- 商品刷新必须覆盖普通商品、套件和组合装；不能只增量拉新增商品。
- 远端任务只传 provider/resource/date 等安全字段，页面地址、选择器和动作固定在扩展代码内。
- 只有三个资源都完成归档和 D1 ingest，UI 才显示本次刷新完成。
- 文件导入继续保留为兜底。

---

### Task 1: 注册商品快照任务组

**Files:**
- Modify: `functions/api/platform/v1/web-collection/_shared/storage.js`
- Modify: `src/state/webCollectionApi.js`
- Test: `tests/web-collection-api.test.mjs`

**Interfaces:**
- Consumes: `triggerWebCollectionJob(db, input)`
- Produces: `triggerKuaimaiProductCollection({ force }, fetchImpl)`，返回 `jobs`

- [ ] **Step 1: 写失败测试**

断言 `resourceType: "products"` 会生成 `products`、`product_kits`、`product_combinations` 三个 `current_snapshot` 任务，业务日期为当天，重复请求幂等，`force` 可重新排队终态任务。

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test tests/web-collection-api.test.mjs`

Expected: FAIL，当前 trigger 只接受订单类资源。

- [ ] **Step 3: 实现最小任务组**

扩展服务端资源白名单并在 `triggerWebCollectionJob` 中将 `products` 展开为三个快照任务；客户端新增统一触发函数。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test tests/web-collection-api.test.mjs`

Expected: PASS。

### Task 2: 实现快麦三类商品导出适配器

**Files:**
- Modify: `chrome-extension/company-data-collector/providers/kuaimai.js`
- Modify: `chrome-extension/company-data-collector/content-script.js`
- Modify: `scripts/web-data-collector/providers/index.mjs`
- Test: `tests/kuaimai-extension-adapter.test.mjs`
- Test: `tests/chrome-collector-extension.test.mjs`
- Test: `tests/web-collection-schedule.test.mjs`

**Interfaces:**
- Consumes: `registeredTaskRuntime(task)` 和现有单文件下载交接
- Produces: 三个固定资源入口、动作计划、文件名前缀和当前快照计划

- [ ] **Step 1: 写失败测试**

断言商品页固定为 `#/prod/parallel/`；普通商品、套件、组合装分别点击对应菜单项，选择 `.xls` 并确认；任务不携带 URL/selector；三个资源均为 `current_snapshot`。

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test tests/kuaimai-extension-adapter.test.mjs tests/chrome-collector-extension.test.mjs tests/web-collection-schedule.test.mjs`

Expected: FAIL，因为插件尚未登记商品资源和页面动作。

- [ ] **Step 3: 实现最小适配**

在扩展包中固化商品页探针、导出菜单、格式弹窗和三类文件特征；content script 只执行登记动作，继续由 Downloads API 交接文件。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test tests/kuaimai-extension-adapter.test.mjs tests/chrome-collector-extension.test.mjs tests/web-collection-schedule.test.mjs`

Expected: PASS。

### Task 3: 将三类文件投影到统一商品目录

**Files:**
- Modify: `scripts/kuaimai-erp-collector/core.mjs`
- Modify: `scripts/web-data-collector/index.mjs`
- Modify: `src/domain/kuaimaiErpProjection.js`
- Test: `tests/kuaimai-erp-collection-cli.test.mjs`
- Test: `tests/kuaimai-erp-projection.test.mjs`

**Interfaces:**
- Consumes: 快麦官方 XLS/XLSX/CSV
- Produces: `products` 归档批次和 `projection.catalog`

- [ ] **Step 1: 写失败测试**

覆盖普通商品字段映射、套件/组合装组件 SKU 与数量、成本字段、重复文件幂等，以及当前快照更新已有商品。

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test tests/kuaimai-erp-collection-cli.test.mjs tests/kuaimai-erp-projection.test.mjs`

Expected: FAIL，套件和组合装资源尚未映射到商品投影。

- [ ] **Step 3: 实现最小解析和投影**

本机处理器将三类任务使用各自文件结构解析，再规范化为统一商品目录；组合关系只来自官方组成字段，不从名称猜测。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test tests/kuaimai-erp-collection-cli.test.mjs tests/kuaimai-erp-projection.test.mjs`

Expected: PASS。

### Task 4: 商品页触发、轮询和回退

**Files:**
- Modify: `src/state/ProductCatalogProvider.jsx`
- Modify: `src/features/data-center/ProductCatalogWorkspace.jsx`
- Modify: `src/features/data-center/ProductCatalogSalesMappingDialog.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/product-catalog-ui.test.mjs`

**Interfaces:**
- Consumes: `triggerKuaimaiProductCollection`、`loadWebCollectionStatus`
- Produces: `collectKuaimaiProducts()` 和可见任务状态

- [ ] **Step 1: 写失败测试**

覆盖按钮触发插件任务、等待设备/导出/入库状态、三任务成功后刷新、登录/验证/结构变化错误，以及文件导入兜底。

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test react-tests/product-catalog-ui.test.mjs`

Expected: FAIL，按钮当前打开文件选择器。

- [ ] **Step 3: 实现最小 UI 流程**

主按钮触发插件采集并轮询本次 job ID；成功后刷新当前商品查询和销售归属；失败显示可执行原因；文件导入移为次级操作。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test react-tests/product-catalog-ui.test.mjs`

Expected: PASS。

### Task 5: 文档、回归与真实验收

**Files:**
- Modify: `docs/features/company-web-data-collector/prd.md`
- Modify: `docs/features/company-web-data-collector/design.md`
- Modify: `docs/features/company-web-data-collector/plan.md`
- Modify: `docs/features/company-web-data-collector/tasks.md`
- Modify: `docs/platform/data-acquisition.md`
- Modify: `.agents/skills/kuaimai-erp-data-collection/SKILL.md`

- [ ] **Step 1: 写回商品快照、三文件和恢复规则**
- [ ] **Step 2: 重新加载本机未打包扩展**
- [ ] **Step 3: 在本地真实环境触发一次商品任务组并核对三类归档、D1 商品数、SKU 数、组合关系和销售归属**
- [ ] **Step 4: 运行完整门禁**

Run: `npm run lint && npm run check:governance && npm run check:integrations && npm run check:environment-capabilities && npm test && npm run build`

Expected: 全部退出码为 0。
