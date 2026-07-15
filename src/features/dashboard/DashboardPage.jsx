import { AlertTriangle, ClipboardList, GitBranch, ListTodo } from "lucide-react";
import { useMemo, useState } from "react";
import { buildDashboardProductSummaries } from "../../domain/dashboardSummary.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { generateProductCover, visibleDemandPool } from "../../domain/productFlow.js";
import { dashboardTasksForExecutive, dashboardTasksForUser, riskMetaForTask, todoSyncStatus } from "../../domain/taskTodo.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { HeaderFilter } from "../../ui/HeaderFilter.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

function ProductThumb({ product }) {
  return (
    <img
      className="product-thumb"
      src={product?.image || generateProductCover(product?.name)}
      alt=""
      width="42"
      height="42"
    />
  );
}

function levelTone(level) {
  const code = String(level || "").trim().slice(0, 2).toLowerCase();
  return ["p0", "p1", "p2", "p3"].includes(code) ? `level-${code}` : "";
}

function ScheduleRing({ schedule }) {
  const progress = schedule.percent ?? 0;
  const accessibleLabel = schedule.percent == null
    ? schedule.label
    : `${schedule.label}，排期进度 ${schedule.percent}%`;
  return (
    <span
      className={`schedule-ring ${schedule.state}`}
      style={{ "--schedule-progress": `${progress}%` }}
      role="img"
      aria-label={accessibleLabel}
    >
      <span>{schedule.percent == null ? "—" : `${schedule.percent}%`}</span>
    </span>
  );
}

export function DashboardPage({ onNavigate, onOpenProgress }) {
  const { state, currentUser, orgCache } = useProductFlow();
  // 总经办可以看到所有部门的待办和风险，并按部门筛选；其他人只看自己部门。
  const isExecutive = canManagePermissions(currentUser);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const departmentOptions = useMemo(() => [
    { value: "all", label: "全部部门" },
    ...(orgCache?.departments || [])
      .map(department => department?.name)
      .filter(Boolean)
      .map(name => ({ value: name, label: name }))
  ], [orgCache?.departments]);
  const productSummaries = useMemo(
    () => buildDashboardProductSummaries(state.products, state.productPlans, state.demands),
    [state.products, state.productPlans, state.demands]
  );
  const productById = new Map(state.products.map(product => [product.id, product]));
  const departmentTasks = (isExecutive
    ? dashboardTasksForExecutive(state.tasks, departmentFilter)
    : dashboardTasksForUser(state.tasks, currentUser))
    .map(task => ({ task, product: productById.get(task.productId) }));
  const risks = departmentTasks
    .map(item => ({ ...item, risk: riskMetaForTask(item.task) }))
    .filter(item => item.risk)
    .sort((left, right) => left.risk.days - right.risk.days);
  const emptyScope = isExecutive ? (departmentFilter === "all" ? "全公司" : departmentFilter) : "当前部门";
  const openProgress = (product, stage) => {
    if (product?.id && onOpenProgress) onOpenProgress(product.id, stage);
    else onNavigate("progress");
  };
  const openFirstTodo = () => {
    const firstTodo = departmentTasks[0];
    if (firstTodo) openProgress(firstTodo.product, firstTodo.task.stage);
  };

  return (
    <section className="page">
      <PageHeader
        title="产品协同总览"
        description={isExecutive ? "总经办视角：查看全公司待办、临期与逾期风险。" : "查看本部门待办、临期与逾期风险。"}
      >
        {isExecutive ? <HeaderFilter label="部门" value={departmentFilter} onChange={setDepartmentFilter} options={departmentOptions} /> : null}
      </PageHeader>
      <div className="dashboard-overview-strip">
        <section className="flow-summary" aria-labelledby="flow-summary-title">
          <span className="flow-summary-title" id="flow-summary-title"><GitBranch aria-hidden="true" /><strong>{productSummaries.length}</strong><small>流程中的产品</small></span>
          <div className="flow-product-rail">
            {productSummaries.map(({ product, schedule }) => (
              <button
                className={`flow-product-card ${schedule.state}`}
                key={product.id}
                onClick={() => openProgress(product, product.stage)}
                title={`查看${product.name}的产品进度`}
              >
                <ProductThumb product={product} />
                <span className="flow-product-copy">
                  <strong>{product.name}</strong>
                  <small><em className={`level-badge ${levelTone(product.level)}`}>{String(product.level || "未定级").split(" ")[0]}</em><span>{schedule.label}</span></small>
                </span>
                <ScheduleRing schedule={schedule} />
              </button>
            ))}
            {!productSummaries.length ? <div className="flow-summary-empty">暂无流程中的产品</div> : null}
          </div>
        </section>
        <button className="dashboard-compact-metric" onClick={() => onNavigate("demands")}><ClipboardList aria-hidden="true" /><span><strong>{visibleDemandPool(state.demands).length}</strong><small>需求池</small></span></button>
        <button className="dashboard-compact-metric" onClick={openFirstTodo} disabled={!departmentTasks.length} title={!departmentTasks.length ? "当前筛选范围内没有待办事项" : undefined}><ListTodo aria-hidden="true" /><span><strong>{departmentTasks.length}</strong><small>待办事项</small></span></button>
      </div>
      <div className="dashboard-grid">
        <section className="section-panel">
          <div className="panel-title"><ClipboardList size={18} /><h2>待办事项</h2></div>
          {departmentTasks.map(({ task, product }) => (
            <button className="task-row" key={task.id} onClick={() => openProgress(product, task.stage)}>
              <ProductThumb product={product} />
              <span><strong>{task.title}</strong><small>{product?.name || "未关联产品"} · {task.ownerDept} · 截止 {task.due || "未设置"} · {todoSyncStatus(task)}</small></span>
            </button>
          ))}
          {!departmentTasks.length ? <div className="empty-state">{emptyScope}没有未完成待办。</div> : null}
        </section>
        <section className="section-panel">
          <div className="panel-title"><AlertTriangle size={18} /><h2>风险提醒</h2></div>
          {risks.map(({ task, product, risk }) => (
            <button className="risk-row" key={task.id} onClick={() => openProgress(product, task.stage)}>
              <ProductThumb product={product} />
              <span><strong>{task.title}</strong><small>{product?.name || "未关联产品"} · <em className={`deadline-risk ${risk.tone}`}>{risk.label}</em></small></span>
            </button>
          ))}
          {!risks.length ? <div className="empty-state">{emptyScope}没有两天内截止或逾期任务。</div> : null}
        </section>
      </div>
    </section>
  );
}
