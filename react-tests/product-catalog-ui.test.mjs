import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("data center exposes product master data as a first-class route", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  assert.match(app, /data-products[\s\S]*商品主数据[\s\S]*PackageSearch/);
  assert.match(page, /products:\s*\["商品主数据"/);
  assert.match(page, /products:\s*<ProductCatalogWorkspace canEdit=\{canEdit\}/);
  assert.doesNotMatch(page, /快麦已落库 · 订单创建时间 · 默认不含其它/);
});

test("product catalog workspace provides dense search, sales filters, Chrome collection and file import", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  assert.match(workspace, /搜索商品、69 码、内部唯一码或商家编码/);
  assert.match(workspace, /从 Chrome 获取 ERP 商品/);
  assert.doesNotMatch(workspace, /快麦 API 未打通/);
  assert.doesNotMatch(workspace, /onClick=\{\(\) => syncKuaimai/);
  assert.doesNotMatch(workspace, /<Button disabled[\s\S]{0,180}快麦 API 未打通/);
  assert.match(workspace, /导入 ERP 商品文件/);
  assert.match(workspace, /全部平台/);
  assert.match(workspace, /最近 7 天/);
  assert.match(workspace, /最近 30 天/);
  assert.match(workspace, /本月/);
  assert.match(workspace, /上月/);
  assert.match(workspace, /自定义/);
  assert.match(workspace, /DateRangePickerField/);
  assert.match(workspace, /全部分类/);
  assert.match(workspace, /已关联产品|未关联产品/);
  assert.match(workspace, /SALES_SORT_OPTIONS/);
  assert.match(workspace, /销售额 高→低/);
  assert.match(workspace, /销量 低→高/);
  assert.match(workspace, /action="排序"/);
  assert.doesNotMatch(workspace, /className="product-catalog-filters"/);
  assert.match(workspace, /主商家编码/);
  assert.match(workspace, /规格商家编码/);
  assert.match(workspace, /商品编码|规格编码/);
  assert.match(workspace, /内部唯一码/);
  assert.match(workspace, /类型 \/ 组成/);
  assert.match(workspace, /组合品/);
  assert.doesNotMatch(workspace, /非标准条码|条码异常/);
  assert.match(workspace, /streamSpreadsheetRows/);
  assert.match(workspace, /确认导入/);
  assert.match(workspace, /TablePagination/);
  assert.match(workspace, /PAGE_SIZE = 50/);
  assert.match(workspace, /销量 \/ 净销售额/);
  assert.doesNotMatch(workspace, /header: "ERP 状态"/);
});

test("product catalog prioritizes governance tasks and opens unresolved sales details", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  assert.match(workspace, /全部商品/);
  assert.match(workspace, /资料待补充/);
  assert.match(workspace, /组合品/);
  assert.match(workspace, /未售商品/);
  assert.match(workspace, /未关联产品/);
  assert.match(workspace, /catalogIssues/);
  assert.doesNotMatch(workspace, /href="#data-sync"/);
  assert.match(workspace, /ERP 商品数据可能不完整/);
  assert.match(workspace, /从 Chrome 重新获取商品/);
  assert.match(workspace, /collectKuaimaiProducts/);
  assert.match(workspace, /Chrome 插件/);
  assert.match(workspace, /普通商品、套件和组合装/);
  assert.match(workspace, /导入后自动重新核对当前销售归属/);
  assert.doesNotMatch(workspace, /待匹配销售编码/);
  assert.match(workspace, /ProductCatalogSalesMappingDialog/);
  const mappingDialog = read("src/features/data-center/ProductCatalogSalesMappingDialog.jsx");
  assert.match(mappingDialog, /先更新 ERP 商品档案/);
  assert.match(mappingDialog, /通过 Chrome 插件重新获取/);
  assert.match(mappingDialog, /导入 ERP 商品文件/);
  assert.match(mappingDialog, /确认是历史销售别名后再手工关联/);
  assert.match(mappingDialog, /ProductCatalogSelect/);
  assert.doesNotMatch(mappingDialog, /<select/);
  assert.match(mappingDialog, /catalog_component_only/);
  assert.match(mappingDialog, /只出现在组合品的子 SKU 中/);
  const catalogSelect = read("src/features/product-catalog/ProductCatalogSelect.jsx");
  assert.match(catalogSelect, /item\.components/);
  assert.match(catalogSelect, /子 SKU/);
  assert.doesNotMatch(catalogSelect, /"无条码"/);
});

test("product catalog applies platform and date drafts only after explicit query", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  assert.match(workspace, /DateRangePickerField/);
  assert.match(workspace, /salesDraft/);
  assert.match(workspace, /setSalesDraft/);
  assert.match(workspace, /applySalesQuery/);
  assert.match(workspace, /查询数据/);
  assert.match(workspace, /setSalesQuery\(current => \(\{[\s\S]*salesDraft/);
  assert.doesNotMatch(workspace, /function selectPlatform\(value\)[\s\S]{0,160}setSalesQuery/);
  assert.doesNotMatch(workspace, /function changeCustomDate\(field, value\)[\s\S]{0,240}setSalesQuery/);
});

test("product catalog keeps rows compact and opens a complete read-only detail", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  const detail = read("src/features/data-center/ProductCatalogDetailDialog.jsx");
  assert.match(workspace, /ProductCatalogDetailDialog/);
  assert.match(workspace, /查看详情/);
  assert.match(workspace, /setSelectedProduct/);
  assert.match(detail, /商品档案/);
  assert.match(detail, /商品 SKU/);
  assert.match(detail, /SKU 组成/);
  assert.match(detail, /库存关系/);
  assert.match(detail, /经营数据/);
  assert.match(detail, /业务关联/);
  assert.match(detail, /数据来源/);
  assert.match(detail, /<Modal/);
});

test("catalog UI keeps actionable loading, empty, error and readonly states", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  assert.match(workspace, /正在加载商品主数据/);
  assert.match(workspace, /还没有商品主数据/);
  assert.match(workspace, /没有符合当前条件的商品/);
  assert.match(workspace, /role="alert"/);
  assert.match(workspace, /const \{[\s\S]*refresh[\s\S]*\} = useProductCatalog\(\)/);
  assert.match(workspace, /重新加载/);
  assert.match(workspace, /disabled=\{loading\}/);
  assert.match(workspace, /onClick=\{\(\) => refresh\(\)\.catch\(\(\) => \{\}\)\}/);
  assert.match(workspace, /title="Chrome 插件会依次采集普通商品、套件和组合装"/);
  assert.match(workspace, /经营数据更新中/);
  assert.match(workspace, /该范围暂无销售/);
  assert.match(workspace, /ERP 商品数据可能不完整/);
  assert.match(workspace, /销售事实仅更新至/);
  assert.match(workspace, /sortProductCatalogBySales/);
  assert.match(workspace, /useState\("netSales_desc"\)/);
});

test("catalog table styles preserve readable codes and responsive table scrolling", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /\.product-catalog-toolbar/);
  assert.match(styles, /\.product-catalog-sales-cell/);
  assert.match(styles, /\.product-catalog-sales-query/);
  assert.match(styles, /\.catalog-code/);
  assert.match(styles, /\.catalog-summary-cell/);
  assert.match(styles, /white-space:\s*nowrap/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.product-catalog-toolbar/);
  assert.match(styles, /\.table-pagination/);
  assert.match(styles, /\.product-catalog-view-tabs/);
  assert.match(styles, /\.product-catalog-alert/);
  assert.match(styles, /\.product-catalog-detail-dialog/);
  assert.match(styles, /\.product-catalog-detail-grid/);
  assert.match(styles, /\.product-catalog-mapping-dialog/);
  assert.match(styles, /\.header-filter\.is-compact/);
  const headerFilter = read("src/ui/HeaderFilter.jsx");
  assert.match(headerFilter, /compact = false/);
  assert.match(headerFilter, /title=\{compact \?/);
  assert.match(headerFilter, /data-active=/);
});

test("product catalog terminology distinguishes single specifications from bundle components", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  const detail = read("src/features/data-center/ProductCatalogDetailDialog.jsx");
  assert.match(workspace, /header: "SKU \/ 组成"/);
  assert.match(workspace, /header: "成本"/);
  assert.doesNotMatch(workspace, /header: "SKU \/ 库存单位"/);
  assert.doesNotMatch(workspace, /header: "ERP 成本"/);
  assert.doesNotMatch(workspace, /\[Barcode, "库存单位"/);
  assert.match(workspace, /个子 SKU/);
  assert.match(detail, /SKU 组成/);
  assert.match(detail, /每套所需数量/);
  assert.doesNotMatch(detail, /组合品无独立库存规格/);
  assert.match(workspace, /item\.productKind === "bundle"[\s\S]*components/);
  assert.match(detail, /缺少子 SKU 编码/);
  assert.match(workspace, /catalogDisplayCategory/);
  assert.match(workspace, /catalogProductCost/);
  assert.match(detail, /catalogDisplayCategory/);
  assert.match(detail, /catalogProductCost/);
  assert.match(detail, /组件成本小计/);
});

test("shared table pagination is keyboard-readable and reports the visible range", () => {
  const pagination = read("src/ui/TablePagination.jsx");
  assert.match(pagination, /aria-label="表格分页"/);
  assert.match(pagination, /显示 \{start\}–\{end\}/);
  assert.match(pagination, /上一页/);
  assert.match(pagination, /下一页/);
});
