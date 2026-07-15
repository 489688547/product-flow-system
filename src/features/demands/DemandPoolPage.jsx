import { Check, ChevronDown, Edit3, GitBranchPlus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  DEMAND_POOL_STANDARDS,
  DEMAND_POOL_STATUSES,
  canConvertDemandToProject,
  generateProductCover,
  stripHtml,
  visibleDemandPool
} from "../../domain/productFlow.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { FloatingMenu } from "../../ui/FloatingMenu.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DemandModal } from "./DemandModal.jsx";
import { formatDemandCreatedAt } from "../../domain/demandDate.js";

function StatusStrip({ demands, value, onChange }) {
  const items = ["all", ...DEMAND_POOL_STATUSES];
  return (
    <div className="status-strip">
      {items.map(status => {
        const count = status === "all" ? demands.length : demands.filter(item => item.status === status).length;
        return <button key={status} className={value === status ? "active" : ""} onClick={() => onChange(status)}><strong>{count}</strong><span>{status === "all" ? "全部" : status}</span></button>;
      })}
    </div>
  );
}

function DemandPoolStandards() {
  return (
    <section className="demand-standard" aria-label="需求池标准">
      <div>
        <h2>需求推进规则</h2>
      </div>
      <div className="standard-grid">
        {DEMAND_POOL_STANDARDS.map(item => (
          <article className="standard-rule" key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function demandStatusTone(status) {
  if (status === "已讨论") return "done";
  if (status === "讨论中") return "active";
  if (status === "暂缓") return "paused";
  return "pending";
}

function DemandStatusSelect({ value, onChange }) {
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const statusAnchorRef = useRef(null);
  return (
    <div className="demand-status-select">
      <button
        ref={statusAnchorRef}
        type="button"
        className={`demand-status-pill tone-${demandStatusTone(value)}`}
        aria-label="切换需求状态"
        aria-haspopup="listbox"
        aria-expanded={statusPickerOpen}
        onClick={() => setStatusPickerOpen(open => !open)}
      >
        <span>{value}</span>
        <ChevronDown size={14} />
      </button>
      <FloatingMenu
        anchorRef={statusAnchorRef}
        open={statusPickerOpen}
        onClose={() => setStatusPickerOpen(false)}
        className="demand-status-menu"
        minWidth={116}
        maxHeight={180}
        role="listbox"
        ariaLabel="选择需求状态"
      >
          {DEMAND_POOL_STATUSES.map(status => (
            <button
              key={status}
              type="button"
              role="option"
              aria-selected={status === value}
              className={`demand-status-option tone-${demandStatusTone(status)} ${status === value ? "active" : ""}`}
              onClick={() => {
                onChange(status);
                setStatusPickerOpen(false);
              }}
            >
              <span>{status}</span>
              {status === value ? <Check size={14} /> : null}
            </button>
          ))}
      </FloatingMenu>
    </div>
  );
}

export function DemandPoolPage({ onProjectCreated }) {
  const { state, currentUser, orgCache, addDemand, updateDemand, deleteDemand, convertDemand } = useProductFlow();
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const pool = visibleDemandPool(state.demands);
  const rows = useMemo(() => pool
    .filter(demand => status === "all" || demand.status === status), [pool, status]);
  const confirmDeleteDemand = demand => {
    if (window.confirm("确认删除这个需求机会？删除后不可恢复。")) deleteDemand(demand.id);
  };

  const columns = [
    { key: "name", header: "机会名称", render: demand => <div className="demand-product-cell"><img src={demand.image || generateProductCover(demand.name)} alt="" width="40" height="40" loading="lazy" /><div><strong>{demand.name}</strong><p>{stripHtml(demand.desc) || "暂无机会描述"}</p></div></div> },
    { key: "status", header: "状态", render: demand => <DemandStatusSelect value={demand.status} onChange={status => updateDemand(demand.id, { status })} /> },
    { key: "level", header: "参考等级", render: demand => demand.level },
    { key: "discussion", header: "讨论摘要", render: demand => <span>{stripHtml(demand.discussion) || "-"}</span> },
    { key: "source", header: "来源", render: demand => demand.source },
    { key: "requester", header: "提需人", render: demand => demand.requester || demand.owner || "-" },
    { key: "createdAt", header: "创建时间", render: demand => formatDemandCreatedAt(demand.createdAt) },
    { key: "actions", header: "操作", render: demand => (
      <TableActions>
        <Button data-testid="convert-demand" className="compact" disabled={!canConvertDemandToProject(demand)} disabledReason={demand.productId ? "该需求已经进入立项" : "需求状态变为已讨论后才能立项"} onClick={() => {
          const productId = convertDemand(demand.id);
          onProjectCreated?.(productId);
        }}><GitBranchPlus size={16} />立项</Button>
        <IconAction label="编辑" onClick={() => { setEditing(demand); setModalOpen(true); }}><Edit3 size={16} /></IconAction>
        <IconAction label="删除" className="danger" onClick={() => confirmDeleteDemand(demand)}><Trash2 size={16} /></IconAction>
      </TableActions>
    )}
  ];

  function saveDemand(form) {
    const demand = { ...form, image: form.image || generateProductCover(form.name) };
    if (editing) updateDemand(editing.id, demand);
    else addDemand({ ...demand, status: "待讨论" });
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <section className="page">
      <PageHeader title="需求池" description="机会先讨论，讨论完成后进入立项。">
        <Button variant="primary" onClick={() => { setEditing(null); setModalOpen(true); }}>添加需求机会</Button>
      </PageHeader>
      <DemandPoolStandards />
      <StatusStrip demands={pool} value={status} onChange={setStatus} />
      <DataTable className="demand-table" minWidth={940} columns={columns} rows={rows} empty={<div className="empty-state">暂无需求机会</div>} />
      <DemandModal open={modalOpen} demand={editing} currentUser={currentUser} orgCache={orgCache} onClose={() => setModalOpen(false)} onSave={saveDemand} />
    </section>
  );
}
