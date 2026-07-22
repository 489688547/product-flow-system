import { useMemo, useState } from "react";
import { AlertTriangle, Database, Sparkles } from "lucide-react";
import { evidenceSnapshotForScope } from "../../domain/ecommerceOperationsView.js";
import { orgUsers } from "../../domain/productFlow.js";
import { Button } from "../../ui/Button.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";

const split = value => String(value || "").split(/\n|；|;/).map(item => item.trim()).filter(Boolean);

function money(value) {
  return value === null || value === undefined ? "暂无数据" : `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function percent(value) {
  return value === null || value === undefined ? "暂无数据" : `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

function evidenceLines(snapshot, note) {
  const lines = [
    `${snapshot.range.from} 至 ${snapshot.range.to}净销售额 ${money(snapshot.metrics.netSales)}`,
    `商品毛利 ${money(snapshot.metrics.grossProfit)}，毛利率 ${percent(snapshot.metrics.grossMarginRate)}，退款率 ${percent(snapshot.metrics.refundRate)}`,
    ...snapshot.limitations.map(item => `数据限制：${item}`),
    ...split(note).map(item => `运营补充：${item}`)
  ];
  return lines.filter(Boolean);
}

export function FocusProductWorkspace({ state, snapshot, manager, orgCache, act, reviewWithAi, onFeedback }) {
  const [focusDefinition, setFocusDefinition] = useState({ month: new Date().toISOString().slice(0, 7), productId: "", ownerName: "", goal: "" });
  const [form, setForm] = useState({ cycleId: "", platform: "", storeId: "", note: "", goal: "", issue: "", countermeasure: "", monitor: "" });
  const [execution, setExecution] = useState({ progress: "", monitorData: "", issue: "", nextAction: "", review: "" });
  const cycle = state.cycles.find(item => item.id === form.cycleId);
  const selectedProductId = cycle?.productId || "";
  const selectedStore = snapshot.stores.find(item => item.id === form.storeId);
  const baseline = useMemo(() => evidenceSnapshotForScope(snapshot, {
    productId: selectedProductId,
    platform: form.platform,
    storeId: form.storeId
  }), [form.platform, form.storeId, selectedProductId, snapshot]);
  const availableStores = snapshot.stores.filter(item => !form.platform || item.platform.includes(form.platform) || form.platform.includes(item.platform));

  async function createCycle(event) {
    event.preventDefault();
    const product = snapshot.products.find(item => item.id === focusDefinition.productId);
    const owner = orgUsers(orgCache).find(item => item.name === focusDefinition.ownerName);
    if (!product || !owner) {
      onFeedback("请选择商品主数据和组织内的责任运营。");
      return;
    }
    await act({ type: "create_cycle", record: {
      month: focusDefinition.month,
      productId: product.id,
      product: product.name,
      ownerId: owner.unionid || owner.userid || owner.userId || owner.name,
      ownerName: owner.name,
      goal: focusDefinition.goal,
      status: "active"
    } }, "本月重点产品已指定，责任运营可开始制定方案。");
  }

  async function createPlan(event) {
    event.preventDefault();
    if (!cycle) {
      onFeedback("请先选择主管指定的重点产品。");
      return;
    }
    if (!form.platform || !selectedStore) {
      onFeedback("请选择数据中心已登记的平台店铺。");
      return;
    }
    const evidenceSnapshot = { ...baseline, capturedAt: new Date().toISOString() };
    await act({ type: "upsert_plan", record: {
      cycleId: cycle.id,
      productId: cycle.productId,
      product: cycle.product,
      platform: form.platform,
      storeId: selectedStore.id,
      store: selectedStore.name,
      ownerId: cycle.ownerId,
      ownerName: cycle.ownerName,
      evidenceSnapshot,
      evidence: evidenceLines(evidenceSnapshot, form.note),
      goals: split(form.goal),
      issues: split(form.issue).slice(0, 3),
      countermeasures: split(form.countermeasure),
      monitors: split(form.monitor)
    } }, "方案草稿已保存；自动经营基线已随当前版本留存。");
  }

  return <>
    {manager ? <form className="section-panel ops-inline-form ops-focus-definition" onSubmit={createCycle}><div className="section-head"><div><h2>主管指定月度重点产品</h2><p>商品和责任运营来自公司主数据，不再手工录入虚拟名称。</p></div></div><div className="ops-field-row"><label>月份<input type="month" required value={focusDefinition.month} onChange={event => setFocusDefinition(current => ({ ...current, month: event.target.value }))} /></label><label>重点产品<select required value={focusDefinition.productId} onChange={event => setFocusDefinition(current => ({ ...current, productId: event.target.value }))}><option value="">从商品主数据选择</option>{snapshot.products.map(product => <option key={product.id} value={product.id}>{product.name}{product.mappingStatus === "mapped" ? "" : "（待映射）"}</option>)}</select></label></div><label>责任运营<OrgSelect type="user" value={focusDefinition.ownerName} onChange={ownerName => setFocusDefinition(current => ({ ...current, ownerName }))} orgCache={orgCache} departmentFilter="运营" searchInMenu placeholder="选择运营人员" /></label><label>主管目标与边界<textarea required value={focusDefinition.goal} onChange={event => setFocusDefinition(current => ({ ...current, goal: event.target.value }))} placeholder="写清结果目标、资源边界、截止日和止损要求" /></label><Button variant="primary" disabled={!snapshot.products.length} disabledReason="数据中心尚无商品主数据。">确认重点产品</Button></form> : null}

    <div className="ops-workspace-grid">
      <form className="section-panel ops-form" onSubmit={createPlan}>
        <div className="section-head"><div><h2>重点产品经营方案</h2><p>先读取事实，再写问题、对策和检测指标。</p></div></div>
        <label>主管指定的重点产品<select value={form.cycleId} onChange={event => setForm(current => ({ ...current, cycleId: event.target.value, platform: "", storeId: "" }))} required><option value="">请选择</option>{state.cycles.filter(item => item.status === "active").map(item => <option key={item.id} value={item.id}>{item.month} · {item.product} · {item.ownerName}</option>)}</select></label>
        <div className="ops-field-row"><label>平台<select required value={form.platform} onChange={event => setForm(current => ({ ...current, platform: event.target.value, storeId: "" }))}><option value="">从经营事实选择</option>{snapshot.platforms.map(item => <option key={item.platform}>{item.platform}</option>)}</select></label><label>店铺<select required value={form.storeId} onChange={event => setForm(current => ({ ...current, storeId: event.target.value }))}><option value="">从数据接入目录选择</option>{availableStores.map(store => <option key={store.id} value={store.id}>{store.name}{store.status === "healthy" ? "" : "（待验证）"}</option>)}</select></label></div>

        <section className="ops-evidence-snapshot" aria-label="自动经营基线"><header><span><Database size={16} />自动经营基线</span><strong>{baseline.quality.latestDataDate || "暂无数据"}</strong></header><div><article><span>净销售额</span><strong>{money(baseline.metrics.netSales)}</strong></article><article><span>商品毛利</span><strong>{money(baseline.metrics.grossProfit)}</strong></article><article><span>毛利率</span><strong>{percent(baseline.metrics.grossMarginRate)}</strong></article><article><span>退款率</span><strong>{percent(baseline.metrics.refundRate)}</strong></article></div>{baseline.storeMetricsAvailable ? null : <p><AlertTriangle size={14} />店铺维度尚未接入，当前显示平台与商品基线，不能把平台总额归到该店铺。</p>}{baseline.limitations.map(item => <small key={item}>{item}</small>)}</section>

        <label>补充非数据事实（可选）<textarea value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} placeholder="例如活动机制、竞品变化、平台规则或已确认的线下事实；不要重复抄经营数字" /></label>
        <label>目标<textarea value={form.goal} onChange={event => setForm(current => ({ ...current, goal: event.target.value }))} placeholder="量化结果、截止时间" required /></label>
        <label>最重要的问题（1–3 个）<textarea value={form.issue} onChange={event => setForm(current => ({ ...current, issue: event.target.value }))} required /></label>
        <label>问题对应的对策<textarea value={form.countermeasure} onChange={event => setForm(current => ({ ...current, countermeasure: event.target.value }))} required /></label>
        <label>每项对策的检测指标<textarea value={form.monitor} onChange={event => setForm(current => ({ ...current, monitor: event.target.value }))} required /></label>
        <Button variant="primary" type="submit" disabled={!state.cycles.length || !snapshot.availability.sales} disabledReason={!state.cycles.length ? "需由主管先指定月度重点产品。" : "经营事实暂不可用，不能保存已验证基线。"}>保存方案草稿</Button>
      </form>

      <section className="section-panel"><div className="section-head"><div><h2>方案推进</h2><p>方案、执行、数据快照和复盘保持同一条时间线。</p></div></div><div className="ops-card-list">{state.plans.length ? state.plans.map(plan => {
        const review = state.aiReviews.find(item => item.planId === plan.id);
        const executions = state.executions.filter(item => item.planId === plan.id);
        return <article className="ops-plan-card" key={plan.id}><div className="ops-card-heading"><div><strong>{plan.product || "未命名重点产品"}</strong><small>{plan.platform} · {plan.store} · {plan.ownerName}</small></div><span className={`status-badge ${plan.status}`}>{plan.status === "draft" ? "草稿" : plan.status === "submitted" ? "待审批" : plan.status === "approved" ? "执行中" : "已退回"}</span></div><p><b>目标：</b>{plan.goals?.join("；") || "—"}</p><p><b>关键问题：</b>{plan.issues?.join("；") || "—"}</p>{plan.evidenceSnapshot ? <p className="ops-plan-evidence"><b>证据快照：</b>{plan.evidenceSnapshot.range?.from} 至 {plan.evidenceSnapshot.range?.to} · 数据截止 {plan.evidenceSnapshot.quality?.latestDataDate || "暂无"}</p> : null}{review ? <div className="ai-review"><b>{review.mode === "ai" ? "AI 点评" : "智能规则检查"}</b><p>{review.summary}</p>{review.suggestions?.map(item => <p key={item}>· {item}</p>)}</div> : null}<div className="table-actions"><Button type="button" onClick={() => reviewWithAi(plan).then(() => onFeedback("点评已生成，建议由运营优化后再提交。")).catch(error => onFeedback(error.message))}><Sparkles size={15} />智能点评</Button>{["draft", "returned"].includes(plan.status) ? <Button type="button" onClick={() => act({ type: "submit_plan", id: plan.id }, "已提交主管审批。")}>提交主管</Button> : null}{manager && plan.status === "submitted" ? <><Button type="button" variant="primary" onClick={() => act({ type: "review_plan", id: plan.id, decision: "approved", reason: "主管确认方案逻辑和资源匹配" }, "方案已批准，进入执行。")}>批准</Button><Button type="button" onClick={() => act({ type: "review_plan", id: plan.id, decision: "returned", reason: "请补充数据基线和止损线" }, "方案已退回优化。")}>退回</Button></> : null}</div>{plan.status === "approved" ? <form className="ops-execution-form" onSubmit={event => { event.preventDefault(); act({ type: "append_execution", record: { ...execution, planId: plan.id, ownerId: plan.ownerId, ownerName: plan.ownerName } }, "执行与复盘记录已提交主管验收。"); }}><h3>执行检查与复盘</h3><label>本次执行<textarea required value={execution.progress} onChange={event => setExecution(current => ({ ...current, progress: event.target.value }))} /></label><label>检测数据<input required value={execution.monitorData} onChange={event => setExecution(current => ({ ...current, monitorData: event.target.value }))} /></label><label>新问题与原因<input value={execution.issue} onChange={event => setExecution(current => ({ ...current, issue: event.target.value }))} /></label><label>下一步调整<input required value={execution.nextAction} onChange={event => setExecution(current => ({ ...current, nextAction: event.target.value }))} /></label><label>阶段复盘<textarea value={execution.review} onChange={event => setExecution(current => ({ ...current, review: event.target.value }))} /></label><Button variant="primary">提交执行记录</Button></form> : null}{executions.map(item => <div className="ops-execution-item" key={item.id}><p><b>执行：</b>{item.progress}；<b>数据：</b>{item.monitorData}</p><p><b>下一步：</b>{item.nextAction}</p><span className="status-badge">{item.status}</span>{manager && item.status === "submitted" ? <div className="table-actions"><Button onClick={() => act({ type: "review_execution", id: item.id, decision: "accepted", reason: "执行结果和证据已核验" }, "执行记录已验收，可作为绩效证据。")}>验收</Button><Button onClick={() => act({ type: "review_execution", id: item.id, decision: "returned", reason: "检测数据或复盘不足" }, "执行记录已退回补充。")}>退回</Button></div> : null}</div>)}</article>;
      }) : <div className="empty-state">还没有重点产品方案。先由主管指定商品与责任运营。</div>}</div></section>
    </div>
  </>;
}
