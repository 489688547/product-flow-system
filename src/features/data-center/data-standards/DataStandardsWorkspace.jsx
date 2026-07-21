import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Plus, Search, ShieldCheck } from "lucide-react";
import { useDataStandards } from "../../../state/DataStandardsProvider.jsx";
import { Button } from "../../../ui/Button.jsx";
import { DataTable, TableActions } from "../../../ui/DataTable.jsx";
import { DataStandardDetailDialog } from "./DataStandardDetailDialog.jsx";
import { DataStandardEditorDialog } from "./DataStandardEditorDialog.jsx";
import { DataStandardRecalculationDialog } from "./DataStandardRecalculationDialog.jsx";

const GROUPS = [
  { category: "sales", title: "销售经营口径", description: "统一按订单创建时间、Asia/Shanghai 汇总，并排除其它与未知平台。" },
  { category: "goods_flow", title: "货流与资金口径", description: "先治理定义与责任；事实未接入时明确标记数据未覆盖。" }
];

function currentCoverage(definition) {
  return definition.coverageStatus || definition.versions?.find(version => version.version === definition.currentVersion)?.coverageStatus || "DATA_NOT_COVERED";
}

function DefinitionCard({ definition, onOpen }) {
  const uncovered = currentCoverage(definition) === "DATA_NOT_COVERED";
  return <article className="data-standard-card">
    <div><span><strong>{definition.name}</strong><code>{definition.metricCode}</code></span><span className={`status-badge ${uncovered ? "warning" : "success"}`}>{uncovered ? "数据未覆盖" : "已覆盖"}</span></div>
    <p>{definition.displayFormula || "查看详情了解当前公式"}</p>
    <dl><div><dt>版本</dt><dd>v{definition.currentVersion} · {definition.effectiveFrom || "—"}</dd></div><div><dt>责任部门</dt><dd>{definition.ownerDepartment}</dd></div></dl>
    <Button type="button" onClick={() => onOpen(definition)}>查看详情</Button>
  </article>;
}

export function DataStandardsWorkspace() {
  const { definitions, loading, saving, error, canWrite, loadDefinitions, loadDefinition, detail } = useDataStandards();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("active");
  const [detailOpen, setDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [recalculationOpen, setRecalculationOpen] = useState(false);
  const filtersInitialized = useRef(false);

  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true;
      return undefined;
    }
    const timer = setTimeout(() => loadDefinitions({ category, status }).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [category, status]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return definitions.filter(definition => !keyword
      || definition.name.toLowerCase().includes(keyword)
      || definition.metricCode.toLowerCase().includes(keyword));
  }, [definitions, search]);
  const openDetail = async definition => {
    try {
      await loadDefinition(definition.id);
      setDetailOpen(true);
    } catch {
      // Provider exposes the structured error inline.
    }
  };
  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = () => {
    setEditing(detail);
    setDetailOpen(false);
    setEditorOpen(true);
  };
  const openRecalculation = () => {
    setDetailOpen(false);
    setRecalculationOpen(true);
  };
  const columns = [
    { key: "name", header: "口径", render: row => <span className="data-product-cell"><strong>{row.name}</strong><small>{row.metricCode}</small></span> },
    { key: "formula", header: "展示公式", render: row => <span className="data-standard-formula">{row.displayFormula || "查看详情"}</span> },
    { key: "version", header: "版本 / 生效", render: row => <span className="data-standard-version"><strong>v{row.currentVersion}</strong><small>{row.effectiveFrom || "—"}</small></span> },
    { key: "coverage", header: "数据覆盖", render: row => currentCoverage(row) === "DATA_NOT_COVERED" ? <span className="status-badge warning">数据未覆盖</span> : <span className="status-badge success">已覆盖</span> },
    { key: "owner", header: "责任部门", render: row => row.ownerDepartment },
    { key: "actions", header: "操作", render: row => <TableActions><button type="button" className="table-link" onClick={() => openDetail(row)}>查看详情</button></TableActions> }
  ];
  return <div className="data-standards-workspace">
    <section className="data-standards-governance">
      <div><ShieldCheck size={20} /><span><strong>公司级数据口径</strong><p>定义、版本、公式、计算结果和责任部门在这里统一治理；业务 App 只按 metricCode 读取。</p></span></div>
      {canWrite ? <Button type="button" variant="primary" onClick={openCreate}><Plus size={16} />新增口径</Button> : <span className="status-badge neutral">只读权限</span>}
    </section>
    <section className="data-standard-toolbar" aria-label="数据口径筛选">
      <label className="data-standard-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索名称或 metricCode" /></label>
      <label><span>分类</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option><option value="sales">销售经营</option><option value="goods_flow">货流与资金</option></select></label>
      <label><span>状态</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="active">使用中</option><option value="archived">已归档</option><option value="">全部状态</option></select></label>
      <span className="data-standard-count">{visible.length} 项口径</span>
    </section>
    {error && !editorOpen && !recalculationOpen ? <div className="data-standard-page-error" role="alert"><strong>{error.message}</strong><span>{error.code}</span><Button type="button" onClick={() => loadDefinitions({ category, status })}>重试</Button></div> : null}
    {loading ? <div className="data-standard-skeleton" aria-label="正在加载数据口径"><span /><span /><span /></div> : GROUPS.filter(group => !category || group.category === category).map(group => {
      const rows = visible.filter(definition => definition.category === group.category);
      return <section className="data-standard-group" key={group.category}>
        <header><div><BookOpen size={17} /><span><h2>{group.title}</h2><p>{group.description}</p></span></div><b>{rows.length}</b></header>
        <DataTable className="data-standard-table" minWidth={940} columns={columns} rows={rows} empty={<div className="empty-state compact-empty">当前筛选下没有{group.title}。{canWrite ? "可以新增口径或调整筛选。" : "请调整筛选后查看。"}</div>} />
        <div className="data-standard-mobile-list">{rows.length ? rows.map(definition => <DefinitionCard key={definition.id} definition={definition} onOpen={openDetail} />) : <div className="empty-state compact-empty">当前筛选下没有{group.title}。</div>}</div>
      </section>;
    })}
    <DataStandardDetailDialog open={detailOpen} definition={detail} onClose={() => setDetailOpen(false)} onEdit={openEdit} onRecalculate={openRecalculation} />
    <DataStandardEditorDialog open={editorOpen} definition={editing} onClose={() => { if (!saving) setEditorOpen(false); }} />
    <DataStandardRecalculationDialog open={recalculationOpen} definition={detail} onClose={() => { if (!saving) setRecalculationOpen(false); }} />
  </div>;
}
