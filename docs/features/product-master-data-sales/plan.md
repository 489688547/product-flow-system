# 商品主数据销量视图实施计划

**目标：** 在共享商品主数据中按平台与日期展示 D1 快麦销量，并优化为面向经营扫描的高密度工作台。

**架构：** 扩展现有 `/api/platform/v1/product-catalog` 查询契约，在服务端按目录 SKU 条码关联 `product_sales_daily` 并聚合；React Provider 按查询条件加载；数据中心页面负责本地搜索/分类/关联过滤和经营型表格呈现。快麦自动订单聚合统一到订单创建时间。

## 约束

- 不新增 D1 表、环境变量或绑定。
- 不在浏览器直接请求快麦，不保存原始快麦响应。
- 不复制 `product_sales_daily`，不修改现有商品稳定 ID。
- 旧客户端不带日期参数时保持兼容。
- 每项行为先写失败测试，再实现并更新任务状态。

## Task 1：领域日期与销售聚合契约

**文件：** `src/domain/productCatalogSales.js`、`react-tests/product-catalog-sales.test.mjs`

- [x] 失败测试：默认 30 天、本月/上月、自定义范围和非法范围。
- [x] 失败测试：SKU 条码去重、商品销量合计、平台构成和零销量。
- [x] 实现纯函数并通过聚焦测试。

## Task 2：D1 商品销量读模型

**文件：** `functions/api/platform/v1/product-catalog/_shared/sales.js`、`functions/api/platform/v1/product-catalog.js`、`tests/product-catalog-sales-api.test.mjs`

- [x] 失败测试：登录、日期校验、平台过滤、默认排除其它、权限裁剪和旧客户端兼容。
- [x] 实现参数化 D1 查询、商品聚合、元数据和安全错误。
- [x] 通过聚焦 API 测试。

## Task 3：Provider 查询状态

**文件：** `src/state/productCatalogApi.js`、`src/state/ProductCatalogProvider.jsx`、`react-tests/product-catalog-provider.test.mjs`

- [x] 失败测试：查询 URL、默认范围、竞态保护、错误保留上次成功数据。
- [x] 实现 `salesQuery`、`setSalesQuery` 与带筛选刷新。
- [x] 通过聚焦 Provider/客户端测试。

## Task 4：快麦创建时间口径

**文件：** `functions/api/kuaimai/_shared/kuaimai.js`、`tests/kuaimai-sales-sync.test.mjs`

- [x] 失败测试：请求使用 `create_time`，按订单/子订单创建时间归日。
- [x] 实现最小口径修正，保留分页和已有存储结构。
- [x] 通过快麦销售同步回归测试。

## Task 5：商品主数据 UI/UX

**文件：** `src/features/data-center/ProductCatalogWorkspace.jsx`、`src/styles.css`、`react-tests/product-catalog-ui.test.mjs`

- [x] 失败测试：无 ERP 状态、销量列、平台/日期筛选、自定义日期、更新/错误/零销量状态。
- [x] 实现经营状态带、筛选工具栏和销量列。
- [x] 检查键盘、焦点、1440/1180/900/640/390px 与 DingTalk WebView。

## Task 6：治理文档与完整验证

**文件：** `PRODUCT.md`、`DESIGN.md`、`docs/product/data-definitions.md`、`docs/platform/api-catalog.md`、`docs/platform/integration-registry.json`、`docs/platform/environment-capabilities.json`、现有 ADR、`tasks.md`

- [x] 反写销售口径、API、共享能力、容量与回滚规则。
- [x] 若清单路径变化，生成平台 manifest；无表/变量变更也要保留现有能力声明。
- [x] 运行 lint、governance、integrations、environment capabilities、全量测试和 build。
- [x] `git diff --check` 与 intended-files 检查。
