# ERP 商品关系图执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 领域商品关系图与库存单位口径
  - 依赖：无。
  - 文件：`src/domain/productCatalog.js`、`src/domain/productCatalogGraph.js`、`react-tests/product-catalog-graph.test.mjs`。
  - 输出：内部唯一码、组件标准化、递归展开、成本和可售库存。
  - 验证：`node --test react-tests/product-catalog-graph.test.mjs react-tests/product-catalog.test.mjs`。
  - 结果：14/14 通过；覆盖内部唯一码、双组件、比例 2、嵌套、循环和冲突编码。
- [x] 快麦组合详情适配
  - 依赖：领域商品关系图。
  - 文件：`functions/api/kuaimai/_shared/kuaimai.js`、`tests/product-catalog-kuaimai.test.mjs`。
  - 输出：`item.single.get` 分批详情、游标、失败摘要。
  - 验证：`node --test tests/product-catalog-kuaimai.test.mjs`。
  - 结果：6/6 通过；仅筛选组合候选，单批最多 30 条，失败返回安全摘要并保留游标。
- [ ] 组件 D1 存储与同步 API
  - 依赖：快麦详情适配。
  - 文件：`migrations/0006_product_catalog_components.sql`、商品目录存储/同步 API、API 测试。
  - 输出：组件关系持久化、覆盖率、部分成功兼容。
  - 验证：`node --test tests/product-catalog-api.test.mjs tests/product-catalog-kuaimai.test.mjs`。
- [ ] 商品主数据 UI 与同步进度
  - 依赖：同步 API。
  - 文件：商品目录客户端、Provider、工作区和 React 测试。
  - 输出：扁平库存组成表、内部唯一码和游标进度。
  - 验证：`node --test react-tests/product-catalog-provider.test.mjs react-tests/product-catalog-ui.test.mjs`。
- [ ] 货流组合消耗
  - 依赖：共享目录读取。
  - 文件：货流导入、旧数据投影和货流测试。
  - 输出：套装销量组件展开、成本一次计算、库存单位匹配。
  - 验证：`node --test tests/goods-flow-storage.test.mjs tests/goods-flow-api.test.mjs tests/goods-flow-metrics-projection.test.mjs`。
- [ ] 治理、回填和环境验收
  - 依赖：全部实现任务。
  - 文件：`PRODUCT.md`、平台文档、集成注册、环境能力、ADR、生成模块。
  - 输出：可迁移、可回滚、可观测的生产能力与回填结果。
  - 验证：完整 Definition of Done、Preview/Production 就绪和真实 WebView。
