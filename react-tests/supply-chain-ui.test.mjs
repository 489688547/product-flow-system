import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("primary sidebar exposes the task-first supply-chain workspaces", () => {
  const app = read("src/App.jsx");
  for (const label of ["我的工作台", "计划与采购", "供应商", "生产与在途", "库存与盘点", "质量闭环", "成本与财务", "数据与规则"]) {
    assert.match(app, new RegExp(label));
  }
  for (const key of ["supply-workbench", "supply-planning", "supply-suppliers", "supply-transit", "supply-inventory", "supply-quality", "supply-finance", "supply-rules"]) {
    assert.match(app, new RegExp(`"${key}"`));
  }
  assert.match(app, /"供应链管理"/);
  assert.doesNotMatch(app, /\["supply-chain", "供应链管理", Truck, "业务 Apps"\]/);
  assert.match(app, /navigationPermissionKey/);
  assert.match(app, /if \(SUPPLY_CHAIN_SCREEN_TO_SECTION\.has\(screen\)\) return "supply-chain"/);
  assert.match(app, /if \(screen === "supply-chain"\) return "supply-workbench"/);
});

test("supply chain page is controlled by the primary route and has no internal navigation", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  const css = read("src/styles.css");
  assert.match(page, /SupplyChainAppPage\(\{ section = "workbench" \}\)/);
  assert.doesNotMatch(page, /返回业务 Apps/);
  assert.doesNotMatch(page, /ArrowLeft/);
  assert.doesNotMatch(app, /<SupplyChainAppPage onNavigate=/);
  assert.doesNotMatch(page, /SupplyChainSectionNav/);
  assert.doesNotMatch(page, /useState\("overview"\)/);
  assert.doesNotMatch(page, /supply-chain-layout/);
  assert.doesNotMatch(page, /supply-chain-content/);
  assert.doesNotMatch(css, /\.supply-chain-section-nav/);
  assert.doesNotMatch(css, /\.supply-chain-layout/);
});

test("inventory and quality imports preview before saving", () => {
  const inventory = read("src/features/supply-chain/InventoryWorkspace.jsx");
  const inventoryImport = read("src/features/supply-chain/inventoryImportRows.js");
  const stocktake = read("src/features/supply-chain/StocktakeWorkspace.jsx");
  const quality = read("src/features/supply-chain/QualityWorkspace.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  assert.match(inventoryImport, /streamSpreadsheetRows/);
  assert.match(inventory, /确认导入/);
  assert.match(inventory, /ERP库存/);
  assert.match(inventory, /ERP 快照/);
  assert.match(stocktake, /月度线下盘点/);
  assert.match(inventory, /异常库存与到货风险/);
  assert.match(inventory, /原辅料库存明细/);
  assert.match(inventory, /materialInventorySnapshots/);
  assert.match(inventory, /inventoryRisks/);
  assert.match(quality, /streamSpreadsheetRows/);
  assert.match(quality, /确认导入/);
  assert.match(quality, /公关处理/);
  assert.match(page, /钉钉供应链文件/);
});

test("approval workspace keeps purchase requests separate from linked payments", () => {
  const approval = read("src/features/supply-chain/ApprovalWorkspace.jsx");
  assert.match(approval, /采购申请/);
  assert.match(approval, /付款申请/);
  assert.match(approval, /purchaseProcessInstanceId/);
  assert.match(approval, /同步钉钉审批/);
  assert.match(approval, /处理映射/);
  assert.match(approval, /supplierValueMap/);
  assert.match(approval, /productValueMap/);
  assert.match(approval, /审批实付/);
  assert.match(approval, /付款超申请/);
  assert.match(approval, /供应商已关联 · 产品待关联/);
  assert.match(approval, /供应商与产品待关联/);
});

test("supplier product and quality workspaces dispatch auditable domain changes", () => {
  const supplier = read("src/features/supply-chain/SupplierWorkspace.jsx");
  const product = read("src/features/supply-chain/ProductSupplyWorkspace.jsx");
  const quality = read("src/features/supply-chain/QualityWorkspace.jsx");
  assert.match(supplier, /collection: "suppliers"/);
  assert.match(supplier, /供货范围/);
  assert.doesNotMatch(supplier, /来自钉钉供应链文件夹/);
  assert.match(product, /collection: "productSupplierLinks"/);
  assert.match(product, /catalogProductId/);
  assert.match(product, /catalogSkuId/);
  assert.match(product, /搜索商品、69 码或商家编码/);
  assert.match(product, /全部 ERP 商品/);
  assert.match(product, /主商家编码/);
  assert.match(product, /规格商家编码/);
  assert.match(product, /未关联供应商/);
  assert.match(product, /TablePagination/);
  assert.match(product, /PAGE_SIZE = 50/);
  assert.match(supplier, /已关联.*个商品/);
  assert.match(quality, /collection: "qualityIssues"/);
  assert.match(quality, /关闭问题/);
});

test("supply chain consumes the platform catalog instead of a private product copy", () => {
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  const product = read("src/features/supply-chain/ProductSupplyWorkspace.jsx");
  const planning = read("src/features/supply-chain/PlanningWorkspace.jsx");
  assert.match(page, /useProductCatalog/);
  assert.match(page, /catalogBackedProduct/);
  assert.match(page, /catalogItems=\{catalogItems\}/);
  assert.match(page, /products=\{products\}/);
  assert.match(planning, /productCodes/);
  assert.match(product, /ProductCatalogSelect/);
  assert.doesNotMatch(product, /还没有产品供应关系。可按现有成本表逐条导入或维护。/);
});

test("single-purpose supply workspaces render their primary content without a nested title card", () => {
  const supplier = read("src/features/supply-chain/SupplierWorkspace.jsx");
  const product = read("src/features/supply-chain/ProductSupplyWorkspace.jsx");
  const approval = read("src/features/supply-chain/ApprovalWorkspace.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  const css = read("src/styles.css");

  for (const workspace of [supplier, product, approval]) {
    assert.match(workspace, /supply-flat-workspace/);
    assert.doesNotMatch(workspace, /className="section-panel"/);
  }
  assert.match(page, /supply-flat-workspace/);
  assert.doesNotMatch(supplier, /供应商档案与表现/);
  assert.match(supplier, /supplier-category/);
  assert.match(css, /\.supplier-category[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.supplier-table \.data-table th:nth-child\(2\)/);
});

test("supply chain workbench has stable responsive structure", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.supply-chain-app/);
  assert.match(css, /\.supply-metric-strip/);
  assert.match(css, /\.supply-import-preview/);
  assert.match(css, /\.section-panel\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.supply-metric-strip\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(170px, 1fr\)\)/);
});

test("overview and sync records expose cash inventory and source truth separately", () => {
  const overview = read("src/features/supply-chain/SupplyChainOverview.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  for (const label of ["审批实付", "ERP库存价值", "实盘库存价值", "ERP库存", "实盘库存"]) {
    assert.match(overview, new RegExp(label));
  }
  for (const label of ["供应商档案", "钉钉审批", "快麦销售成本", "ERP库存快照", "盘点导入", "原辅料库存", "异常库存", "质量导入", "文件快照"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /dingtalk-inventory-docs/);
  assert.match(page, /钉钉库存文件/);
});

test("task-first workbench exposes actionable and data-quality states without decorative KPI cards", () => {
  const workbench = read("src/features/supply-chain/SupplyChainWorkbench.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  assert.match(workbench, /待处理/);
  assert.match(workbench, /即将逾期/);
  assert.match(workbench, /数据问题/);
  assert.match(workbench, /buildRoleWorkbench/);
  assert.match(workbench, /aria-label="供应链待处理事项"/);
  assert.doesNotMatch(workbench, /metric-card|kpi-card/);
  assert.match(page, /SupplyChainWorkbench/);
});

test("transit workspace renders product summaries and an evidence-backed courier-style progress", () => {
  const progress = read("src/features/supply-chain/GoodsFlowProgress.jsx");
  const transit = read("src/features/supply-chain/TransitWorkspace.jsx");
  const workflow = read("src/domain/supplyChainWorkflow.js");
  const css = read("src/styles.css");
  for (const label of ["采购申请", "审批通过", "采购下单", "生产 / 备货", "发运", "到仓", "质检", "收货入库", "结案"]) {
    assert.match(workflow, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(progress, /buildGoodsFlowProgress/);
  assert.match(progress, /aria-current/);
  assert.match(transit, /产品货流/);
  assert.match(transit, /采购批次/);
  assert.match(transit, /GoodsFlowProgress/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.goods-flow-progress/);
});

test("planning workspace explains procurement suggestions and keeps planned workflow writes disabled", () => {
  const planning = read("src/features/supply-chain/PlanningWorkspace.jsx");
  const workspace = read("src/features/supply-chain/PlanningProcurementWorkspace.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  const css = read("src/styles.css");
  for (const label of ["断货风险", "爆单风险", "清仓建议", "系统建议量", "采购前后库存", "计算依据"]) {
    assert.match(planning, new RegExp(label));
  }
  assert.match(planning, /calculateProcurementSuggestion/);
  assert.match(planning, /工作流接入后可确认/);
  assert.match(planning, /调整依据/);
  assert.match(workspace, /库存风险与建议/);
  assert.match(workspace, /采购与付款/);
  assert.match(workspace, /ApprovalWorkspace/);
  assert.match(workspace, /DEV-000006/);
  assert.match(workspace, /role="tablist"/);
  assert.match(page, /PlanningProcurementWorkspace/);
  assert.match(css, /\.supply-planning-layout/);
  assert.match(css, /\.supply-workspace-tabs/);
  assert.doesNotMatch(planning, /metric-card|kpi-card/);
});

test("supplier workspace covers capability sourcing evaluation concentration and cost evidence", () => {
  const supplier = read("src/features/supply-chain/SupplierWorkspace.jsx");
  for (const label of ["档案与能力", "评价与风险", "报价与成本", "能力或供货范围", "单一来源风险", "客观指标", "采购评价", "质量评价", "产品评价", "历史采购价格"]) {
    assert.match(supplier, new RegExp(label));
  }
  assert.match(supplier, /evaluateSupplierPerformance/);
  assert.match(supplier, /role="tablist"/);
  assert.match(supplier, /待数据中心补齐/);
});

test("inventory workspace exposes multi-warehouse stocktake BOM and clearance controls", () => {
  const inventory = read("src/features/supply-chain/InventoryWorkspace.jsx");
  for (const label of ["SKU × 仓库库存余额", "理论与实盘", "5%", "BOM 与物料消耗", "我方提供", "供应商自带", "清仓候选"]) {
    assert.match(inventory, new RegExp(label.replace("×", "\\×")));
  }
  assert.match(inventory, /classifyStocktakeVariance/);
  assert.match(inventory, /catalogItems/);
});

test("quality workspace separates standards inspections and six-step incident closure", () => {
  const quality = read("src/features/supply-chain/QualityWorkspace.jsx");
  for (const label of ["质量标准", "质检执行", "问题闭环", "知识库版", "质检清单版", "首批检查", "后续抽检", "应检未检", "发现", "定性", "处理", "整改", "验证", "关闭"]) {
    assert.match(quality, new RegExp(label));
  }
  assert.match(quality, /role="tablist"/);
  assert.match(quality, /DEV-000006/);
});

test("cost and finance workspace separates payable assets cost and freight reconciliation", () => {
  const finance = read("src/features/supply-chain/CostFinanceWorkspace.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  for (const label of ["现金循环", "应收应付", "报价与成本", "快递费核对", "已付款未交货", "已下单未付款", "历史价格", "理论运费", "结算运费", "申诉"]) {
    assert.match(finance, new RegExp(label));
  }
  assert.match(finance, /classifyFinancialPosition/);
  assert.match(finance, /reconcileFreightCharge/);
  assert.match(page, /CostFinanceWorkspace/);
});

test("data and rules workspace exposes source coverage and versioned business rules", () => {
  const rules = read("src/features/supply-chain/DataRulesWorkspace.jsx");
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  for (const label of ["数据覆盖", "商品主数据", "ERP 库存", "销售需求", "采购与付款", "质量与售后", "工作流命令", "规则目录", "订单创建时间", "盘点差异", "BOM 损耗", "清仓阈值"]) {
    assert.match(rules, new RegExp(label));
  }
  assert.match(rules, /trusted|partial|stale|unavailable/);
  assert.match(page, /DataRulesWorkspace/);
});
