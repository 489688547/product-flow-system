# ERP 商品关系图实施计划

## 目标

把快麦商品组合关系接入现有共享商品目录，并让销量、库存和成本按库存最小单位统一计算。

## 架构方案

选择“扩展现有能力”：`ProductCatalogProvider` 和 `/api/platform/v1/product-catalog*` 保持唯一共享目录边界；快麦映射仅位于服务端适配器。新增纯领域商品关系图和 D1 组件边表，货流导入在服务端读取共享目录后进行组合展开，React 功能页不直连快麦。

## 文件职责

- `src/domain/productCatalog.js`：调整库存单位编码分类并将组件纳入目录标准化。
- `src/domain/productCatalogGraph.js`：纯组合图、递归展开、成本和可售库存算法。
- `functions/api/kuaimai/_shared/kuaimai.js`：列表与 `item.single.get` 只读详情适配。
- `functions/api/platform/v1/product-catalog/_shared/storage.js`：组件关系、同步进度和目录读取。
- `functions/api/platform/v1/product-catalog/sync/kuaimai.js`：分批同步编排和游标响应。
- `functions/api/platform/v1/goods-flow/imports.js`：读取共享目录后投影货流。
- `functions/api/platform/v1/goods-flow/_shared/legacyProjection.js`：主商品/库存单位匹配与组件消耗。
- `src/state/productCatalogApi.js`、`src/state/ProductCatalogProvider.jsx`：循环游标和进度反馈。
- `src/features/data-center/ProductCatalogWorkspace.jsx`：扁平表格展示库存组成和数据问题。
- `migrations/0006_product_catalog_components.sql`：新增组件关系表和索引。
- `docs/platform/*`、`PRODUCT.md`：平台契约、集成、环境、错误和数据定义。

## 接口与契约

- `normalizeCatalogComponent(input, context)` 返回 `{id,parentItemId,inventoryUnitCode,ratio,...}`。
- `flattenCatalogConsumption({items,itemId,skuId,quantity})` 返回 `{components,totalCost,issues}`。
- `catalogSellableQuantity({items,itemId,inventoryByCode})` 返回可售整数或 `null`。
- `pullKuaimaiProductDetails(config, items, {cursor,maxDetails}, fetchImpl)` 返回 `{details,nextCursor,complete,failures}`。
- `POST /api/platform/v1/product-catalog/sync/kuaimai` 接收可选 `{cursor}`，返回 `complete`、`nextCursor`、`progress` 和安全错误。
- `GET /api/platform/v1/product-catalog` 的 `items[].components[]` 向后兼容新增；成本仍按部门裁剪。

## 数据迁移

- 新增 `product_catalog_components`，不修改旧四表。
- 主键由父商品和组件稳定身份组成；按父商品更新，未读取父商品不删除旧关系。
- 回填先同步列表，再分批详情；老目录无组件时按普通商品读取并标记覆盖不足。
- 预估 936 个商品、每个组合 1–10 个组件，表容量远小于订单事实表。

## 风险与回滚

- 快麦请求上限：每批详情限制 30、最多 5 路并发，保留游标；游标 0 先归并唯一商品，续传只读共享目录并批量写组件，避免重复整表写入。
- 部分失败：保留旧关系，记录失败商品，不提升完整覆盖率。
- 内部唯一码碰撞：产生异常，不自动合并不同库存单位。
- 循环组合：算法停止并返回问题，不发生无限递归。
- 回滚：停用详情同步和货流展开；新增表保留，旧 API 字段继续工作。

## 验证命令

```bash
node --test react-tests/product-catalog-graph.test.mjs
node --test tests/product-catalog-kuaimai.test.mjs tests/product-catalog-api.test.mjs
node --test tests/goods-flow-storage.test.mjs tests/goods-flow-api.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

部署后分别运行本地、Preview、Production 就绪验证，并检查真实快麦只读同步与钉钉 WebView。

## 任务顺序

1. 领域商品图与库存单位口径。
2. 快麦详情读取和分批游标。
3. D1 组件存储与平台 API。
4. 商品主数据 UI 和同步进度。
5. 货流组合销量展开与成本口径。
6. 平台治理、生产回填、三环境与 WebView 验收。
