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
  assert.match(page, /快麦已落库 · 订单创建时间 · 默认不含其它/);
});

test("product catalog workspace provides dense search, sales filters, sync and file import", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  assert.match(workspace, /搜索商品、69 码或商家编码/);
  assert.match(workspace, /同步快麦商品/);
  assert.match(workspace, /导入 ERP 商品文件/);
  assert.match(workspace, /全部平台/);
  assert.match(workspace, /最近 7 天/);
  assert.match(workspace, /最近 30 天/);
  assert.match(workspace, /本月/);
  assert.match(workspace, /上月/);
  assert.match(workspace, /自定义/);
  assert.match(workspace, /type="date"/);
  assert.match(workspace, /全部分类/);
  assert.match(workspace, /已关联产品|未关联产品/);
  assert.match(workspace, /主商家编码/);
  assert.match(workspace, /规格商家编码/);
  assert.match(workspace, /标准 69 码|非标准条码/);
  assert.match(workspace, /streamSpreadsheetRows/);
  assert.match(workspace, /确认导入/);
  assert.match(workspace, /TablePagination/);
  assert.match(workspace, /PAGE_SIZE = 50/);
  assert.match(workspace, /header: "销量"/);
  assert.doesNotMatch(workspace, /header: "ERP 状态"/);
});

test("catalog UI keeps actionable loading, empty, error and readonly states", () => {
  const workspace = read("src/features/data-center/ProductCatalogWorkspace.jsx");
  assert.match(workspace, /正在加载商品主数据/);
  assert.match(workspace, /还没有商品主数据/);
  assert.match(workspace, /没有符合当前筛选条件的商品/);
  assert.match(workspace, /role="alert"/);
  assert.match(workspace, /const \{[\s\S]*refresh[\s\S]*\} = useProductCatalog\(\)/);
  assert.match(workspace, /重新加载/);
  assert.match(workspace, /disabled=\{loading\}/);
  assert.match(workspace, /onClick=\{\(\) => refresh\(\)\.catch\(\(\) => \{\}\)\}/);
  assert.match(workspace, /disabledReason="仅总经办和运营部可同步商品主数据"/);
  assert.match(workspace, /销量更新中/);
  assert.match(workspace, /当前范围暂无销售/);
  assert.match(workspace, /未匹配/);
  assert.match(workspace, /销售事实仅更新至/);
  assert.match(workspace, /sortProductCatalogBySales/);
});

test("catalog table styles preserve readable codes and responsive table scrolling", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /\.product-catalog-toolbar/);
  assert.match(styles, /\.product-catalog-sales-cell/);
  assert.match(styles, /\.product-catalog-date-range/);
  assert.match(styles, /\.catalog-code/);
  assert.match(styles, /white-space:\s*nowrap/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.product-catalog-toolbar/);
  assert.match(styles, /\.table-pagination/);
});

test("shared table pagination is keyboard-readable and reports the visible range", () => {
  const pagination = read("src/ui/TablePagination.jsx");
  assert.match(pagination, /aria-label="表格分页"/);
  assert.match(pagination, /显示 \{start\}–\{end\}/);
  assert.match(pagination, /上一页/);
  assert.match(pagination, /下一页/);
});
