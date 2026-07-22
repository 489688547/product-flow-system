import { useEffect, useMemo, useState } from "react";
import { summarizeEcommerceOperations } from "../../domain/ecommerceOperations.js";
import { buildOperationsCockpit, buildOperationsDataSnapshot } from "../../domain/ecommerceOperationsView.js";
import { currentShanghaiDate } from "../../domain/productCatalogSales.js";
import { orgUsers } from "../../domain/productFlow.js";
import { useAuth } from "../../state/AuthProvider.jsx";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { useDataStandards } from "../../state/DataStandardsProvider.jsx";
import { useEcommerceOperations } from "../../state/EcommerceOperationsProvider.jsx";
import { useProductCatalog } from "../../state/ProductCatalogProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { loadOperationsSupplyData } from "../../state/ecommerceOperationsDataApi.js";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { FocusProductWorkspace } from "./FocusProductWorkspace.jsx";
import { OperationsCockpit } from "./OperationsCockpit.jsx";

const META = {
  dashboard: ["经营驾驶舱", "先看数据是否可信，再处理经营差距、方案审批和协同阻塞。"],
  focus: ["重点产品经营", "围绕重点产品，用事实定位问题、用对策验证结果，并持续复盘推进。"],
  collaboration: ["跨部门协同", "把供应链、产品、品牌和财务依赖变成有负责人、有期限的协同事项。"],
  team: ["团队管理", "明确店铺与产品责任、工作负荷和主管辅导动作，不在这里评分。"],
  playbooks: ["经营方法库", "沉淀经复盘确认的有效方法、适用条件和止损边界。"]
};

const OPERATIONS_METRIC_CODES = Object.freeze([
  "sales.net_sales",
  "sales.gross_profit",
  "sales.refund_rate",
  "sales.gross_margin_rate",
  "sales.quantity"
]);

function yesterdayInShanghai() {
  const [year, month, day] = currentShanghaiDate().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function Notice({ message, tone = "" }) {
  return message ? <div className={`ops-notice ${tone}`} role="status">{message}</div> : null;
}

function safeOperationsError(value) {
  const message = String(value || "").trim();
  if (!message) return "";
  if (/D1_ERROR|Network connection lost|Failed to parse body|fetch failed/i.test(message)) {
    return "经营数据暂时无法读取，请稍后重试；已加载的数据不会被清空。";
  }
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

export function EcommerceOperationsAppPage({ section = "dashboard" }) {
  const { user } = useAuth();
  const { state, loading, error, dispatch, reviewWithAi } = useEcommerceOperations();
  const { state: productState } = useProductFlow();
  const { items: catalogItems, meta: catalogMeta, loading: catalogLoading, error: catalogError } = useProductCatalog();
  const { salesRows, salesMeta, range, setRange, connections, connectionsError } = useDataCenter();
  const { results: metricResults, resultLoading, error: metricError, scheduleEnsureResults } = useDataStandards();
  const [feedback, setFeedback] = useState("");
  const [draftRange, setDraftRange] = useState(range);
  const [supplyData, setSupplyData] = useState({ inventory: [], dashboard: null, quality: {}, partial: false, error: "" });
  const [collab, setCollab] = useState({ title: "", targetDepartment: "供应链部", dueDate: "" });
  const [team, setTeam] = useState({ memberName: "", storeId: "", productId: "" });
  const [playbook, setPlaybook] = useState({ title: "", scenario: "", method: "" });
  const manager = String(user?.department || "") === "运营部" && /主管|经理|总监|负责人/.test(String(user?.title || ""));
  const currentDepartment = String(user?.department || user?.departmentName || "");
  const departmentManager = manager || /主管|经理|总监|负责人/.test(String(user?.title || ""));
  const summary = useMemo(() => summarizeEcommerceOperations(state), [state]);
  const organizationUsers = useMemo(() => orgUsers(productState.orgCache), [productState.orgCache]);
  const snapshot = useMemo(() => buildOperationsDataSnapshot({
    salesRows,
    catalogItems,
    connections,
    range,
    salesMeta: { ...salesMeta, latestDataDate: salesMeta?.latestDataDate || catalogMeta?.sales?.latestDataDate },
    metricResults,
    inventory: supplyData.inventory,
    goodsFlowDashboard: supplyData.dashboard,
    inventoryQuality: supplyData.quality
  }), [catalogItems, catalogMeta?.sales?.latestDataDate, connections, metricResults, range, salesMeta, salesRows, supplyData.dashboard, supplyData.inventory, supplyData.quality]);
  const cockpit = useMemo(() => buildOperationsCockpit({
    state,
    viewer: { id: String(user?.userId || user?.userid || user?.unionId || user?.name || ""), manager },
    dataQuality: snapshot.quality
  }), [manager, snapshot.quality, state, user?.name, user?.unionId, user?.userId, user?.userid]);
  const [title, description] = META[section] || META.dashboard;
  useEffect(() => {
    if (["dashboard", "focus"].includes(section)) scheduleEnsureResults(range, OPERATIONS_METRIC_CODES);
  }, [range.from, range.to, scheduleEnsureResults, section]);
  useEffect(() => setDraftRange(range), [range.from, range.to]);
  useEffect(() => {
    let active = true;
    loadOperationsSupplyData({ through: range.to }).then(result => {
      if (active) setSupplyData({ ...result, error: "" });
    }).catch(supplyError => {
      if (active) setSupplyData({ inventory: [], dashboard: null, quality: {}, partial: false, error: supplyError.message });
    });
    return () => { active = false; };
  }, [range.to]);

  async function act(action, success) {
    try {
      await dispatch(action);
      setFeedback(success);
    } catch (actionError) {
      setFeedback(actionError.message);
    }
  }

  const dashboard = <OperationsCockpit snapshot={snapshot} cockpit={cockpit} summary={summary} manager={manager} metricLoading={resultLoading && !metricError} draftRange={draftRange} setDraftRange={setDraftRange} applyRange={() => {
    if (!draftRange.from || !draftRange.to || draftRange.from > draftRange.to) {
      setFeedback("请选择有效的经营数据日期范围。");
      return;
    }
    if (draftRange.to > yesterdayInShanghai()) {
      setFeedback("截止日期不能晚于昨天。");
      return;
    }
    setFeedback("");
    setRange({ ...draftRange });
  }} />;
  const focus = <FocusProductWorkspace state={state} snapshot={snapshot} manager={manager} orgCache={productState.orgCache} act={act} reviewWithAi={reviewWithAi} onFeedback={setFeedback} />;
  const collaboration = <><form className="section-panel ops-inline-form" onSubmit={event => { event.preventDefault(); act({ type: "upsert_collaboration", record: { ...collab, status: "pending", ownerId: user?.userId || user?.name } }, "协同事项已发起。"); }}><h2>发起跨部门协同</h2><label>协同事项<input required value={collab.title} onChange={event => setCollab(current => ({ ...current, title: event.target.value }))} /></label><label>责任部门<select value={collab.targetDepartment} onChange={event => setCollab(current => ({ ...current, targetDepartment: event.target.value }))}><option>供应链部</option><option>产品部</option><option>品牌部</option><option>财务部</option></select></label><label>截止日<input type="date" required value={collab.dueDate} onChange={event => setCollab(current => ({ ...current, dueDate: event.target.value }))} /></label><Button variant="primary">发起协同</Button></form><section className="section-panel"><DataTable minWidth={760} columns={[
    { key: "title", header: "事项", render: row => row.title },
    { key: "department", header: "责任部门", render: row => row.targetDepartment },
    { key: "due", header: "截止日", render: row => row.dueDate },
    { key: "status", header: "状态", render: row => row.status },
    { key: "action", header: "处理", render: row => row.status === "pending" && row.targetDepartment === currentDepartment && departmentManager ? <div className="table-actions"><Button onClick={() => act({ type: "respond_collaboration", id: row.id, record: { id: row.id, status: "accepted", reason: "责任部门已确认承接" } }, "协同事项已接受。")}>接受</Button><Button onClick={() => act({ type: "respond_collaboration", id: row.id, record: { id: row.id, status: "returned", reason: "当前信息或资源不足，请运营补充" } }, "协同事项已退回补充。")}>退回</Button></div> : "—" }
  ]} rows={state.collaborations} empty="暂无协同事项。" /></section></>;
  const teamWorkspace = <><form className="section-panel ops-inline-form" onSubmit={event => { event.preventDefault(); const member = organizationUsers.find(item => item.name === team.memberName); const store = snapshot.stores.find(item => item.id === team.storeId); const product = snapshot.products.find(item => item.id === team.productId); if (!member || !store) { setFeedback("请选择组织内成员和数据中心已登记的店铺。"); return; } act({ type: "upsert_responsibility", record: { memberId: member.unionid || member.userid || member.userId || member.name, memberName: member.name, storeId: store.id, store: store.name, platform: store.platform, productId: product?.id || "", focusProduct: product?.name || "" } }, "团队责任已更新。"); }}><h2>运营团队责任</h2><label>成员<OrgSelect type="user" value={team.memberName} onChange={memberName => setTeam(current => ({ ...current, memberName }))} orgCache={productState.orgCache} departmentFilter="运营" searchInMenu placeholder="选择运营人员" /></label><label>平台 / 店铺<select required value={team.storeId} onChange={event => setTeam(current => ({ ...current, storeId: event.target.value }))}><option value="">从数据接入目录选择</option>{snapshot.stores.map(store => <option key={store.id} value={store.id}>{store.platform} / {store.name}</option>)}</select></label><label>重点产品<select value={team.productId} onChange={event => setTeam(current => ({ ...current, productId: event.target.value }))}><option value="">不指定重点产品</option>{snapshot.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><Button variant="primary">保存责任</Button></form><section className="section-panel"><DataTable minWidth={680} columns={[
    { key: "member", header: "成员", render: row => row.memberName },
    { key: "scope", header: "负责范围", render: row => [row.platform, row.store].filter(Boolean).join(" / ") },
    { key: "product", header: "重点产品", render: row => row.focusProduct || "—" },
    { key: "coach", header: "主管辅导", render: row => row.coachingNote || "待安排" }
  ]} rows={state.responsibilities} empty="尚未配置团队责任。这里用于分工和辅导，不显示绩效分。" /></section></>;
  const playbooks = <><form className="section-panel ops-inline-form" onSubmit={event => { event.preventDefault(); act({ type: "upsert_playbook", record: playbook }, "经营方法已沉淀。"); }}><h2>沉淀经营方法</h2><label>方法名称<input required value={playbook.title} onChange={event => setPlaybook(current => ({ ...current, title: event.target.value }))} /></label><label>适用场景<input required value={playbook.scenario} onChange={event => setPlaybook(current => ({ ...current, scenario: event.target.value }))} /></label><label>方法与止损条件<textarea required value={playbook.method} onChange={event => setPlaybook(current => ({ ...current, method: event.target.value }))} /></label><Button variant="primary">保存方法</Button></form><section className="ops-card-list">{state.playbooks.map(item => <article className="section-panel" key={item.id}><h2>{item.title}</h2><p><b>适用：</b>{item.scenario}</p><p>{item.method}</p></article>)}</section></>;

  const content = { dashboard, focus, collaboration, team: teamWorkspace, playbooks }[section] || dashboard;
  const dataError = catalogError || connectionsError || metricError?.message;
  const dataNotice = safeOperationsError(dataError || feedback || (!snapshot.availability.sales ? supplyData.error : ""));
  return <section className="page operations-page"><PageHeader title={title} description={description} identity="订单创建时间 · Asia/Shanghai · 截止昨天 · 默认不含其它" /><Notice message={error || dataNotice} tone={error || dataError ? "danger" : ""} />{loading || catalogLoading ? <div className="section-panel empty-state">正在加载店铺经营数据…</div> : content}</section>;
}
