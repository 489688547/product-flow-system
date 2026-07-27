import { useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { Button, IconAction } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { TablePagination } from "../../ui/TablePagination.jsx";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { evaluateSupplierPerformance } from "../../domain/supplyChainWorkflow.js";

const money = value => value === null || value === undefined
  ? "待数据"
  : `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const EMPTY_FORM = { name: "", code: "", category: "原料", supplyScope: "", contactName: "", contactPhone: "", paymentTerms: "", status: "active" };
const PAGE_SIZE = 30;
const TABS = [
  ["directory", "档案与能力"],
  ["evaluation", "评价与风险"],
  ["cost", "报价与成本"]
];

function maskedPhone(value) {
  const source = String(value || "").trim();
  return source.length >= 7 ? `${source.slice(0, 3)}****${source.slice(-4)}` : source;
}

export function SupplierWorkspace({ summary, canEdit, catalogItems = [], suppliers = [], workflow }) {
  const { state, dispatch } = useSupplyChain();
  const [activeTab, setActiveTab] = useState("directory");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const workflowAvailable = workflow?.resourceAvailable?.("suppliers") === true;
  const workflowSupplierItems = workflow?.workflows?.suppliers?.items || [];
  const effectiveSuppliers = useMemo(() => {
    const records = new Map((suppliers.length ? suppliers : state.suppliers).map(row => [String(row.id), row]));
    workflowSupplierItems.forEach(entity => {
      const current = records.get(String(entity.id)) || {};
      records.set(String(entity.id), {
        ...current,
        ...entity.fields,
        id: entity.id,
        status: entity.status === "archived" ? "inactive" : entity.fields?.status || current.status || "active",
        workflowVersion: entity.version
      });
    });
    return [...records.values()];
  }, [state.suppliers, suppliers, workflowSupplierItems]);
  const summaryBySupplier = new Map(summary.bySupplier.map(item => [item.supplierId, item]));
  const catalogIds = new Set(catalogItems.map(item => item.id));
  const catalogById = new Map(catalogItems.map(item => [item.id, item]));
  const linkProductId = link => link.catalogProductId || link.productId || "";
  const suppliersByProduct = new Map();
  state.productSupplierLinks.forEach(link => {
    const productId = linkProductId(link);
    if (!productId) return;
    const suppliers = suppliersByProduct.get(productId) || new Set();
    suppliers.add(link.supplierId);
    suppliersByProduct.set(productId, suppliers);
  });
  const productCounts = new Map(effectiveSuppliers.map(supplier => [supplier.id, new Set(state.productSupplierLinks
    .filter(link => link.supplierId === supplier.id)
    .map(link => link.catalogProductId || (catalogIds.has(link.productId) ? link.productId : link.productId ? `legacy:${link.productId}` : ""))
    .filter(Boolean))]));
  const singleSourceCounts = new Map(effectiveSuppliers.map(supplier => [
    supplier.id,
    state.productSupplierLinks.filter(link => link.supplierId === supplier.id
      && suppliersByProduct.get(linkProductId(link))?.size === 1).length
  ]));
  const visibleSuppliers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return effectiveSuppliers.filter(supplier => {
      const matchesCategory = !category || supplier.category === category;
      const haystack = [supplier.name, supplier.code, supplier.category, supplier.supplyScope, supplier.location, supplier.qualifications]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!keyword || haystack.includes(keyword));
    });
  }, [category, effectiveSuppliers, query]);
  function open(record = null) {
    setModalOpen(true);
    setEditing(record);
    setForm(record ? { ...EMPTY_FORM, ...record } : EMPTY_FORM);
  }
  async function save() {
    if (!form.name.trim() || saving) return;
    if (!workflowAvailable) {
      dispatch({ type: "upsert", collection: "suppliers", record: { ...form, id: editing?.id || `supplier-${Date.now()}` } });
      setEditing(null); setModalOpen(false); setForm(EMPTY_FORM);
      return;
    }
    setSaving(true);
    try {
      const fields = {
        name: form.name.trim(),
        code: form.code.trim(),
        category: form.category,
        supplyScope: form.supplyScope.trim(),
        contactName: form.contactName.trim(),
        paymentTerms: form.paymentTerms.trim(),
        status: form.status
      };
      const existing = workflowSupplierItems.find(item => String(item.id) === String(editing?.id || ""));
      if (existing) {
        await workflow.act({
          resource: "suppliers",
          id: existing.id,
          action: "revise",
          expectedVersion: existing.version,
          fields
        });
      } else {
        await workflow.create({
          resource: "suppliers",
          id: editing?.id || `supplier:${Date.now()}`,
          fields
        });
      }
      setEditing(null); setModalOpen(false); setForm(EMPTY_FORM);
    } catch {
      // The shared workflow notice presents the safe error and request ID.
    } finally {
      setSaving(false);
    }
  }
  const columns = [
    { key: "name", header: "供应商", render: row => <span><strong>{row.name}</strong><small className="table-secondary">{row.code || "未设置编码"}</small><small className="table-secondary">已关联 {productCounts.get(row.id)?.size || 0} 个商品</small></span> },
    { key: "category", header: "类别", render: row => <span className="supplier-category">{row.category || "—"}</span> },
    { key: "scope", header: "供货范围", render: row => row.supplyScope || "—" },
    { key: "contact", header: "联系人", render: row => [row.contactName, maskedPhone(row.contactPhone)].filter(Boolean).join(" · ") || "—" },
    { key: "payment", header: "账期", render: row => row.paymentTerms || "—" },
    { key: "paid", header: <span className="num">累计实付</span>, render: row => <span className="num">{money(summaryBySupplier.get(row.id)?.actualPaid)}</span> },
    { key: "funds", header: <span className="num">库存资金</span>, render: row => <span className="num">{money(summaryBySupplier.get(row.id)?.adjustedInventoryFunds)}</span> },
    { key: "quality", header: "质量风险", render: row => {
      const openIssues = summaryBySupplier.get(row.id)?.openQualityIssues || 0;
      return <span><strong>{openIssues ? `${openIssues} 个未关闭` : "暂无未关闭问题"}</strong><small className="table-secondary">{openIssues >= 3 ? "建议降级或启用备选" : openIssues ? "持续跟进整改" : "质量状态稳定"}</small></span>;
    } },
    { key: "sourceRisk", header: "供应风险", render: row => singleSourceCounts.get(row.id)
      ? <span><strong className="text-warning">单一来源风险</strong><small className="table-secondary">{singleSourceCounts.get(row.id)} 个商品仅此供应商</small></span>
      : <span className="status-badge success">已有替代来源</span> },
    { key: "status", header: "合作状态", render: row => <span className={`status-badge ${row.status === "inactive" ? "neutral" : "success"}`}>{row.status === "inactive" ? "暂停合作" : "合作中"}</span> },
    { key: "actions", header: "操作", render: row => canEdit ? <TableActions><IconAction label="编辑供应商" onClick={() => open(row)}><Pencil size={15} /></IconAction></TableActions> : "—" }
  ];
  const evaluationColumns = [
    { key: "supplier", header: "供应商", render: row => <strong>{row.name}</strong> },
    { key: "objective", header: "客观指标", render: row => {
      const result = evaluateSupplierPerformance({ objective: row.objectiveMetrics, perspectives: row.evaluations });
      return <span><strong>{result.objectiveScore === null ? "待数据中心补齐" : `${result.objectiveScore} 分`}</strong><small className="table-secondary">合格率 · 准时率 · 问题次数 · 价格稳定</small></span>;
    } },
    { key: "procurement", header: "采购评价", render: row => row.evaluations?.procurement ? "已评价" : "待评价" },
    { key: "quality", header: "质量评价", render: row => row.evaluations?.quality ? "已评价" : "待评价" },
    { key: "product", header: "产品评价", render: row => row.evaluations?.product ? "已评价" : "待评价" },
    { key: "grade", header: "综合分级", render: row => {
      const result = evaluateSupplierPerformance({ objective: row.objectiveMetrics, perspectives: row.evaluations });
      return result.grade
        ? <span className={`status-badge ${result.grade === "A" ? "success" : result.grade === "B" ? "warning" : "danger"}`}>{result.grade} 级</span>
        : <span className="status-badge neutral">覆盖不足</span>;
    } },
    { key: "risk", header: "依赖风险", render: row => singleSourceCounts.get(row.id) ? `${singleSourceCounts.get(row.id)} 个单一来源商品` : "暂无单一来源" }
  ];
  const costRows = state.productSupplierLinks.map(link => ({
    ...link,
    id: link.id || `${link.supplierId}:${linkProductId(link)}`,
    supplierName: effectiveSuppliers.find(item => item.id === link.supplierId)?.name || "待关联供应商",
    productName: catalogById.get(linkProductId(link))?.name || link.materialName || linkProductId(link) || "待关联商品"
  }));
  const costColumns = [
    { key: "product", header: "商品 / 物料", render: row => <span><strong>{row.productName}</strong><small className="table-secondary">{row.catalogSkuId || row.skuCode || "库存单位待关联"}</small></span> },
    { key: "supplier", header: "供应商", render: row => row.supplierName },
    { key: "price", header: <span className="num">当前采购价</span>, render: row => <span className="num">{row.unitCost === null || row.unitCost === undefined ? "待补" : money(row.unitCost)}</span> },
    { key: "moq", header: <span className="num">起订量</span>, render: row => <span className="num">{row.minimumOrderQuantity ?? row.moq ?? "待补"}</span> },
    { key: "lead", header: "生产 / 打样周期", render: row => row.productionCycleDays ? `${row.productionCycleDays} 天` : "待补" },
    { key: "history", header: "历史采购价格", render: () => <span><strong>待数据中心补齐</strong><small className="table-secondary">采购事实到齐后展示价格版本和涨幅</small></span> }
  ];
  const rowsForActiveTab = activeTab === "directory" ? visibleSuppliers : activeTab === "evaluation" ? effectiveSuppliers : costRows;
  const visibleRows = rowsForActiveTab.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function selectTab(key) {
    setActiveTab(key);
    setPage(1);
  }
  return (
    <section className="supply-flat-workspace supplier-workspace">
      <div className="supply-workspace-tabs" role="tablist" aria-label="供应商工作区">
        {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={activeTab === key ? "is-active" : ""} onClick={() => selectTab(key)}>{label}</button>)}
      </div>
      {activeTab === "directory" ? <>
        <div className="supply-workspace-toolbar supply-filter-toolbar">
          <label className="supply-search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索能力或供货范围</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="搜索供应商、能力或供货范围" /></label>
          <label><span className="sr-only">按供应商类别筛选</span><select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">全部类别</option>{[...new Set(effectiveSuppliers.map(item => item.category).filter(Boolean))].map(value => <option key={value}>{value}</option>)}</select></label>
          {canEdit ? <Button variant="primary" onClick={() => open()}><Plus size={16} />新增供应商</Button> : null}
        </div>
        <DataTable className="supplier-table" columns={columns} rows={visibleRows} minWidth={1540} empty={<div className="empty-state compact-empty">没有符合当前能力条件的供应商。</div>} />
      </> : null}
      {activeTab === "evaluation" ? <>
        <div className="supply-coverage-notice is-partial" role="status"><span><strong>供应商评价按“客观数据 + 三方独立评价”形成</strong><small>三方评价不互相覆盖；自动指标缺失时不生成伪分数。整改动作通过版本化供应商工作流记录。</small></span></div>
        <DataTable columns={evaluationColumns} rows={visibleRows} minWidth={1040} empty={<div className="empty-state compact-empty">还没有供应商评价对象。</div>} />
      </> : null}
      {activeTab === "cost" ? <>
        <div className="supply-coverage-notice is-partial" role="status"><span><strong>报价与历史采购价格待数据中心补齐</strong><small>当前仅展示已维护的供应关系与现价；缺历史价格、比价和涨价事实时不推断趋势。</small></span></div>
        <DataTable columns={costColumns} rows={visibleRows} minWidth={980} empty={<div className="empty-state compact-empty">还没有商品与供应商报价关系。</div>} />
      </> : null}
      {rowsForActiveTab.length > PAGE_SIZE ? <TablePagination total={rowsForActiveTab.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
      <Modal title={editing ? "编辑供应商" : "新增供应商"} open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }} footer={<><Button onClick={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}>取消</Button><Button variant="primary" disabled={!form.name.trim() || saving || !workflowAvailable} disabledReason={!workflowAvailable ? "供应商工作流暂不可用" : ""} onClick={save}>{saving ? "保存中…" : "保存"}</Button></>}>
        <div className="form-grid supply-form-grid">
          <label>供应商名称<input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
          <label>供应商编码<input value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} /></label>
          <label>供应商类别<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option>原料</option><option>包材</option><option>里料</option><option>耗材</option><option>加工</option><option>成品</option></select></label>
          <label>合作状态<select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}><option value="active">合作中</option><option value="inactive">暂停合作</option></select></label>
          <label className="full">供货范围<input value={form.supplyScope} placeholder="例如：罐子、包装袋、贴纸" onChange={event => setForm(current => ({ ...current, supplyScope: event.target.value }))} /></label>
          <label>联系人<input value={form.contactName} onChange={event => setForm(current => ({ ...current, contactName: event.target.value }))} /></label>
          <label>联系电话<input value={form.contactPhone} disabled placeholder="敏感联系方式由安全保险箱维护" /></label>
          <label className="full">账期<input value={form.paymentTerms} placeholder="例如：月结 30 天" onChange={event => setForm(current => ({ ...current, paymentTerms: event.target.value }))} /></label>
        </div>
      </Modal>
    </section>
  );
}
