import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, Copy, DatabaseZap, Pencil, Plus, Power, RefreshCcw, Save, Search, ShieldCheck, Sparkles, Store, Tag, UsersRound } from "lucide-react";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { useUserInsights } from "../../state/UserInsightsProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import "./user-insights.css";

const DEFAULT_PLATFORMS = ["抖音", "天猫", "拼多多", "快手", "小红书"];
const TABS = [
  ["audience", "用户分析"],
  ["competitors", "竞品分析"],
  ["rules", "规则与建议"]
];
const DIMENSIONS = [
  ["audience", "用户", UsersRound],
  ["product", "商品", Tag],
  ["video", "视频", Sparkles],
  ["live", "直播", Store]
];
const STATUS_META = {
  healthy: ["正常", "success"],
  partial: ["部分数据", "warning"],
  stale: ["数据已过期", "warning"],
  login_required: ["需要登录", "danger"],
  schema_changed: ["页面结构变化", "danger"],
  failed: ["采集失败", "danger"],
  unsupported: ["不支持", "neutral"],
  suggested: ["系统推荐", "info"],
  confirmed: ["已确认", "success"],
  disabled: ["已停用", "neutral"]
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function appOwner(actor, preferredApp = "") {
  const product = actor.departments.some(item => ["产品部", "产品团队"].includes(item));
  const consumerAppId = preferredApp || (product ? "product-flow" : "ecommerce-operations");
  return { consumerAppId, ownerDepartment: consumerAppId === "product-flow" ? "产品部" : "运营部" };
}

function skuItems(product) {
  return (product?.skuCodes || []).map(item => typeof item === "object"
    ? { id: String(item.id || item.code || ""), label: item.name ? `${item.name} · ${item.code || ""}` : String(item.code || "") }
    : { id: String(item), label: String(item) });
}

function StatusBadge({ status = "unsupported" }) {
  const [label, tone] = STATUS_META[status] || [status, "neutral"];
  return <span className={`insight-status ${tone}`}>{label}</span>;
}

function MetricList({ metrics = {} }) {
  const entries = Object.entries(metrics);
  if (!entries.length) return <span className="muted">无可验证指标</span>;
  return <dl className="insight-metric-list">{entries.slice(0, 8).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "—"}</dd></div>)}</dl>;
}

function EvidenceLine({ snapshot }) {
  return (
    <div className="insight-evidence-line">
      <StatusBadge status={snapshot.qualityStatus} />
      <span>覆盖率 {Math.round(Number(snapshot.coverage || 0) * 100)}%</span>
      <span>截止 {snapshot.rangeTo || snapshot.capturedAt?.slice(0, 10) || "—"}</span>
      <span>最后成功 {snapshot.capturedAt ? new Date(snapshot.capturedAt).toLocaleString("zh-CN") : "—"}</span>
    </div>
  );
}

function EmptyInsight({ title, children }) {
  return <div className="insight-empty"><DatabaseZap size={24} aria-hidden="true" /><strong>{title}</strong><p>{children}</p></div>;
}

function CandidateCard({ item, readonly, pending, onConfirm, onReject, onDisable, onRestore }) {
  const [reason, setReason] = useState("");
  return (
    <article className="insight-candidate-card">
      <div><strong>{item.name || item.title || "未命名候选"}</strong><StatusBadge status={item.status === "core" ? "confirmed" : item.status === "disabled" ? "disabled" : "suggested"} /></div>
      <p>{(item.matchedRules || []).join("；") || item.recommendationReason || "命中当前竞品发现规则"}</p>
      <div className="insight-evidence-line"><span>{item.platform || "—"}</span><span>{(item.evidenceRefs || []).length} 条证据</span><span>规则 v{item.ruleVersion || 1}</span></div>
      {item.status === "candidate" && !readonly ? (
        <div className="insight-confirm-row">
          <label>确认原因<input value={reason} onChange={event => setReason(event.target.value)} placeholder="说明与当前产品/店铺的竞争关系" /></label>
          <Button variant="primary" disabled={pending || !reason.trim()} disabledReason="请先填写确认原因" onClick={() => onConfirm(item, reason)}><Check size={15} />确认加入</Button>
          <Button disabled={pending || !reason.trim()} disabledReason="请先填写驳回原因" onClick={() => onReject(item, reason)}>驳回</Button>
        </div>
      ) : null}
      {item.status === "core" && !readonly ? <div className="insight-confirm-row"><label>停用原因<input value={reason} onChange={event => setReason(event.target.value)} placeholder="说明本次停止对比的原因" /></label><Button disabled={pending || !reason.trim()} disabledReason="请先填写停用原因" onClick={() => onDisable(item, reason)}><Power size={15} />停用竞品</Button></div> : null}
      {item.status === "disabled" && !readonly ? <div className="insight-confirm-row"><label>恢复原因<input value={reason} onChange={event => setReason(event.target.value)} placeholder="说明恢复候选的原因" /></label><Button disabled={pending || !reason.trim()} disabledReason="请先填写恢复原因" onClick={() => onRestore(item, reason)}>恢复为候选</Button></div> : null}
    </article>
  );
}

function AudienceWorkspace({ data }) {
  return (
    <div className="insight-dimension-grid">
      {DIMENSIONS.map(([dimension, label, Icon]) => {
        const snapshot = data.snapshots.find(item => item.dimension === dimension);
        const entities = data.entities.filter(item => item.dimension === dimension);
        return (
          <section className="insight-dimension-panel" key={dimension}>
            <header><span><Icon size={18} aria-hidden="true" />{label}</span>{snapshot ? <StatusBadge status={snapshot.qualityStatus} /> : <StatusBadge status="unsupported" />}</header>
            {snapshot ? <><MetricList metrics={snapshot.metrics} /><EvidenceLine snapshot={snapshot} />{entities.length ? <div className="insight-entity-list">{entities.slice(0, 5).map(item => <span key={item.id}>{item.name || item.title || item.platformEntityId || item.id}</span>)}</div> : null}</> : <EmptyInsight title={`暂无${label}数据`}>确认平台类目并完成浏览器采集后显示；不支持的维度不会按 0 计算。</EmptyInsight>}
          </section>
        );
      })}
    </div>
  );
}

function CompetitorWorkspace({ data, scope, actor, pending, saveCompetitor }) {
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: "", platformEntityId: "", recommendationReason: "" });
  const core = data.competitors.filter(item => item.status === "core");
  const candidates = data.competitors.filter(item => item.status === "candidate");
  const disabled = data.competitors.filter(item => item.status === "disabled");
  const update = (item, status, reason) => saveCompetitor({ id: item.id, status, reason, expectedVersion: item.version });
  const create = async () => {
    const owner = appOwner(actor);
    await saveCompetitor({ competitor: { ...draft, ...owner, id: globalThis.crypto?.randomUUID?.() || `competitor-${Date.now()}`, platform: scope.platform, shopId: scope.shopId, productId: scope.productId, skuId: scope.skuId, categoryId: scope.categoryId, status: "candidate", sourceType: "manual", evidenceRefs: [] } });
    setDraft({ name: "", platformEntityId: "", recommendationReason: "" });
    setShowCreate(false);
  };
  return (
    <div className="insight-stack">
      <section className="insight-flat-section"><header><div><h3>核心竞品</h3><p>由负责人维护或从候选中人工确认，才进入正式对比。</p></div><div className="insight-section-actions"><span>{core.length} 个</span><Button disabled={actor.readonly || pending} onClick={() => setShowCreate(open => !open)}><Plus size={15} />{showCreate ? "取消新增" : "新增人工竞品"}</Button></div></header>
        {showCreate ? <div className="insight-inline-form"><label>竞品名称<input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label><label>平台商品/账号 ID<input value={draft.platformEntityId} onChange={event => setDraft(current => ({ ...current, platformEntityId: event.target.value }))} /></label><label className="wide">竞争关系说明<input value={draft.recommendationReason} onChange={event => setDraft(current => ({ ...current, recommendationReason: event.target.value }))} placeholder="价格带、用户、商品或内容上的直接竞争关系" /></label><Button variant="primary" disabled={pending || !draft.name.trim() || !draft.recommendationReason.trim()} disabledReason="请填写名称和竞争关系" onClick={create}>保存为候选并确认</Button></div> : null}
        {core.length ? <div className="insight-candidate-grid">{core.map(item => <CandidateCard key={item.id} item={item} readonly={actor.readonly} pending={pending} onDisable={(candidate, reason) => update(candidate, "disabled", reason)} />)}</div> : <EmptyInsight title="还没有核心竞品">系统不会自动把候选认定为核心竞品。</EmptyInsight>}
      </section>
      <section className="insight-flat-section"><header><div><h3>候选竞品</h3><p>按当前 App 规则发现，确认前只作为候选。</p></div><span>{candidates.length} 个</span></header>
        {candidates.length ? <div className="insight-candidate-grid">{candidates.map(item => <CandidateCard key={item.id} item={item} readonly={actor.readonly} pending={pending} onConfirm={(candidate, reason) => update(candidate, "core", reason)} onReject={(candidate, reason) => update(candidate, "rejected", reason)} />)}</div> : <EmptyInsight title="暂无候选竞品">采集商品、视频或直播市场数据并发布发现规则后，系统会在这里列出命中依据。</EmptyInsight>}
      </section>
      {disabled.length ? <section className="insight-flat-section"><header><div><h3>已停用竞品</h3><p>保留历史判断和停用原因，需要时可恢复为候选。</p></div><span>{disabled.length} 个</span></header><div className="insight-candidate-grid">{disabled.map(item => <CandidateCard key={item.id} item={item} readonly={actor.readonly} pending={pending} onRestore={(candidate, reason) => update(candidate, "candidate", reason)} />)}</div></section> : null}
    </div>
  );
}

function RuleWorkspace({ data, scope, actor, pending, saveInsightRule }) {
  const [targetApp, setTargetApp] = useState(() => appOwner(actor).consumerAppId);
  const [editingRule, setEditingRule] = useState(null);
  const { ownerDepartment } = appOwner(actor, targetApp);
  const owned = data.ruleSets.filter(item => item.consumerAppId === targetApp);
  const shared = data.ruleSets.filter(item => item.consumerAppId !== targetApp);
  const suggestions = data.suggestions || [];
  const beginRule = rule => setEditingRule(rule ? {
    ...rule,
    conditionField: rule.competitorConditions?.[0]?.field || "salesVolume",
    conditionOperator: rule.competitorConditions?.[0]?.operator || "gte",
    conditionValue: String(rule.competitorConditions?.[0]?.value ?? ""),
    minimumCoveragePercent: Math.round(Number(rule.minimumCoverage || 0.8) * 100),
    observationWindowDays: Number(rule.observationWindowDays || 7)
  } : {
      id: globalThis.crypto?.randomUUID?.() || `rule-${Date.now()}`,
      name: `${scope.platform || "平台"}竞品与洞察规则`,
      consumerAppId: targetApp,
      ownerDepartment,
      platform: scope.platform,
      categoryId: scope.categoryId,
      status: "draft",
      conditionField: "salesVolume",
      conditionOperator: "gte",
      conditionValue: "",
      minimumCoveragePercent: 80,
      observationWindowDays: 7
    });
  const saveDraft = async (action = "upsert") => {
    const conditionValue = editingRule.conditionOperator === "between"
      ? editingRule.conditionValue.split(/[,，]/).map(value => Number(value.trim())).filter(Number.isFinite)
      : Number.isFinite(Number(editingRule.conditionValue)) ? Number(editingRule.conditionValue) : editingRule.conditionValue.trim();
    const rule = {
      ...editingRule,
      consumerAppId: targetApp,
      ownerDepartment,
      platform: scope.platform,
      categoryId: scope.categoryId,
      minimumCoverage: Number(editingRule.minimumCoveragePercent || 0) / 100,
      observationWindowDays: Number(editingRule.observationWindowDays || 0),
      competitorConditions: editingRule.conditionValue.trim() ? [{ field: editingRule.conditionField.trim(), operator: editingRule.conditionOperator, value: conditionValue }] : [],
      status: action === "publish" ? "published" : editingRule.status || "draft"
    };
    await saveInsightRule({ rule, action, expectedVersion: editingRule.version });
    setEditingRule(null);
  };
  const changeRuleStatus = (rule, action) => saveInsightRule({ rule: { ...rule, status: action === "publish" ? "published" : "disabled" }, action, expectedVersion: rule.version });
  return (
    <div className="insight-stack">
      <section className="insight-flat-section"><header><div><h3>当前规则集</h3><p>产品和运营规则相互独立，复制后产生本 App 的新版本。</p></div><div className="insight-section-actions">{actor.departments.includes("总经办") ? <label>规则归属 App<select value={targetApp} onChange={event => { setTargetApp(event.target.value); setEditingRule(null); }}><option value="ecommerce-operations">电商店铺运营</option><option value="product-flow">产品全周期</option></select></label> : null}<Button variant="primary" disabled={actor.readonly || pending || !scope.platform} disabledReason="请选择平台并确认编辑权限" onClick={() => beginRule()}><Plus size={15} />新增本 App 规则</Button></div></header>
        {editingRule ? <div className="insight-rule-editor"><div><strong>{editingRule.version ? "编辑规则" : "新增规则"}</strong><span>{targetApp === "product-flow" ? "产品全周期" : "电商店铺运营"} · {ownerDepartment}</span></div><div className="insight-inline-form"><label>规则名称<input value={editingRule.name} onChange={event => setEditingRule(current => ({ ...current, name: event.target.value }))} /></label><label>观察窗口（天）<input type="number" min="1" max="90" value={editingRule.observationWindowDays} onChange={event => setEditingRule(current => ({ ...current, observationWindowDays: event.target.value }))} /></label><label>最低覆盖率（%）<input type="number" min="1" max="100" value={editingRule.minimumCoveragePercent} onChange={event => setEditingRule(current => ({ ...current, minimumCoveragePercent: event.target.value }))} /></label><label>竞品指标<input value={editingRule.conditionField} onChange={event => setEditingRule(current => ({ ...current, conditionField: event.target.value }))} placeholder="如 salesVolume" /></label><label>条件<select value={editingRule.conditionOperator} onChange={event => setEditingRule(current => ({ ...current, conditionOperator: event.target.value }))}><option value="gte">大于等于</option><option value="lte">小于等于</option><option value="between">区间</option><option value="includes">包含</option><option value="eq">等于</option></select></label><label>阈值<input value={editingRule.conditionValue} onChange={event => setEditingRule(current => ({ ...current, conditionValue: event.target.value }))} placeholder={editingRule.conditionOperator === "between" ? "20,40" : "1000"} /></label></div><div className="insight-form-actions"><Button onClick={() => setEditingRule(null)}>取消</Button><Button disabled={pending || !editingRule.name.trim()} onClick={() => saveDraft()}><Save size={15} />保存草稿</Button><Button variant="primary" disabled={pending || !editingRule.name.trim() || !editingRule.conditionValue.trim()} disabledReason="发布前请填写规则名称和竞品条件" onClick={() => saveDraft("publish")}><Check size={15} />发布规则</Button></div></div> : null}
        {owned.length ? <DataTable minWidth={760} rows={owned} columns={[
          { key: "name", header: "规则", render: row => <div><strong>{row.name}</strong><small>{row.consumerAppId}</small></div> },
          { key: "scope", header: "范围", render: row => `${row.platform || "—"} · ${row.categoryId || "全部已确认类目"}` },
          { key: "coverage", header: "最低覆盖率", render: row => `${Math.round(Number(row.minimumCoverage || 0) * 100)}%` },
          { key: "version", header: "版本", render: row => `v${row.version || 1} · ${row.status || "draft"}` },
          { key: "actions", header: "操作", render: row => <div className="insight-table-actions"><Button disabled={actor.readonly || pending} onClick={() => beginRule(row)}><Pencil size={14} />编辑规则</Button>{row.status !== "published" ? <Button variant="primary" disabled={actor.readonly || pending || !(row.competitorConditions || []).length} disabledReason="请先编辑并保存竞品条件" onClick={() => changeRuleStatus(row, "publish")}>发布规则</Button> : <Button disabled={actor.readonly || pending} onClick={() => changeRuleStatus(row, "disable")}><Power size={14} />停用规则</Button>}</div> }
        ]} empty={null} /> : <EmptyInsight title="本 App 还没有规则">新增规则后才能按本部门口径发现竞品和生成建议。</EmptyInsight>}
      </section>
      {shared.length ? <section className="insight-flat-section"><header><div><h3>其他 App 规则</h3><p>可查看并复制，不能覆盖来源规则。</p></div></header><div className="insight-rule-list">{shared.map(rule => <article key={rule.id}><div><strong>{rule.name}</strong><small>{rule.ownerDepartment} · v{rule.version || 1}</small></div><Button disabled={actor.readonly || pending} onClick={() => saveInsightRule({ action: "copy", sourceRuleId: rule.id, target: { id: globalThis.crypto?.randomUUID?.() || `rule-${Date.now()}`, consumerAppId: targetApp, ownerDepartment } })}><Copy size={15} />复制为本 App 规则</Button></article>)}</div></section> : null}
      <section className="insight-flat-section"><header><div><h3>规则版本记录</h3><p>创建、复制、发布和停用都会保留操作者、版本和时间。</p></div></header>{data.ruleHistory?.length ? <div className="insight-rule-history">{data.ruleHistory.filter(item => !item.consumerAppId || item.consumerAppId === targetApp).slice(0, 20).map(item => <div key={item.id}><strong>v{item.version || 1} · {item.status || item.action}</strong><span>{item.name || "规则"}</span><small>{item.updatedBy || item.createdBy || "—"} · {(item.updatedAt || item.createdAt || "").slice(0, 16).replace("T", " ")}</small></div>)}</div> : <EmptyInsight title="暂无规则版本记录">首次保存、发布或复制规则后显示。</EmptyInsight>}</section>
      <section className="insight-flat-section"><header><div><h3>参考建议</h3><p>每条建议都必须带证据、覆盖率、置信度和数据限制。</p></div><span className="insight-advisory-label">仅供参考</span></header>
        {suggestions.length ? <div className="insight-suggestion-grid">{suggestions.map(item => <article key={item.id || item.title}><div><StatusBadge status={item.freshness === "stale" ? "stale" : item.coverage < 0.8 ? "partial" : "healthy"} /><span>{item.confidence || "low"} 置信度</span></div><h4>{item.title}</h4><p>{item.conclusion}</p><small>覆盖率 {Math.round(Number(item.coverage || 0) * 100)}% · 规则 v{item.ruleVersion || 1}</small>{item.limitations?.length ? <ul>{item.limitations.map(text => <li key={text}>{text}</li>)}</ul> : null}</article>)}</div> : <EmptyInsight title="暂无参考建议">系统只在数据与规则满足最低条件后生成建议，不会自动修改任何经营数据。</EmptyInsight>}
      </section>
    </div>
  );
}

export function UserInsightsWorkspace() {
  const { state: dataCenterState } = useDataCenter();
  const { state: productState } = useProductFlow();
  const {
    viewType, setViewType, scope, setScope, data, actor, loading, pending, error, refresh,
    saveCategoryMapping, saveInsightRule, saveCompetitor, requestInsightRetry
  } = useUserInsights();
  const [activeTab, setActiveTab] = useState("audience");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState({ categoryId: "", categoryName: "", categoryPath: "", pageUrl: "" });
  const products = productState.products || [];
  const currentProduct = products.find(item => item.id === scope.productId);
  const sources = (dataCenterState.sources || []).filter(item => !scope.platform || item.platform === scope.platform);
  const platforms = unique([...DEFAULT_PLATFORMS, ...(dataCenterState.sources || []).map(item => item.platform), ...data.categoryMappings.map(item => item.platform)]);
  const mappings = data.categoryMappings.filter(item => item.platform === scope.platform
    && (!scope.shopId || !item.shopId || item.shopId === scope.shopId)
    && (!scope.productId || !item.productId || item.productId === scope.productId));
  const selectedMapping = mappings.find(item => item.categoryId === scope.categoryId);
  const canConfirm = !actor.readonly && actor.departments.some(item => ["总经办", "产品部", "产品团队", "运营部", "运营"].includes(item));
  const latestRun = data.syncRuns[0];
  const latestSnapshot = [...data.snapshots]
    .filter(item => item.capturedAt)
    .sort((left, right) => String(right.capturedAt).localeCompare(String(left.capturedAt)))[0];

  const saveSuggestedCategory = async () => {
    const id = globalThis.crypto?.randomUUID?.() || `mapping-${Date.now()}`;
    await saveCategoryMapping({ mapping: { ...categoryDraft, id, platform: scope.platform, shopId: scope.shopId, productId: scope.productId, skuId: scope.skuId, status: "suggested", dimensions: DIMENSIONS.map(([key]) => key), schemaVersion: "v1" } });
    setCategoryDraft({ categoryId: "", categoryName: "", categoryPath: "", pageUrl: "" });
    setShowCategoryForm(false);
  };

  return (
    <div className="insight-workspace">
      <section className="insight-command-bar" aria-label="用户洞察数据状态">
        <div><ShieldCheck size={18} aria-hidden="true" /><span>{latestSnapshot ? <>最后成功 {latestSnapshot.capturedAt.slice(0, 16).replace("T", " ")}</> : "尚无成功采集"}</span>{latestRun ? <StatusBadge status={latestRun.status} /> : null}</div>
        <div><Button onClick={refresh} disabled={loading || pending}><RefreshCcw size={15} />刷新数据</Button><Button variant="primary" disabled={pending || selectedMapping?.status !== "confirmed"} disabledReason="请先选择并确认平台类目" onClick={requestInsightRetry}><Clock3 size={15} />手动重试</Button></div>
      </section>
      {error ? <div className="insight-alert" role="status"><AlertTriangle size={17} />{error}</div> : null}

      <section className="insight-scope-bar">
        <div className="insight-view-switch" role="group" aria-label="洞察视角">
          <button type="button" className={viewType === "shop" ? "active" : ""} aria-pressed={viewType === "shop"} onClick={() => setViewType("shop")}><Store size={16} />店铺视角</button>
          <button type="button" className={viewType === "product" ? "active" : ""} aria-pressed={viewType === "product"} onClick={() => setViewType("product")}><Tag size={16} />产品/SKU 视角</button>
        </div>
        <label>平台<select value={scope.platform} onChange={event => setScope({ platform: event.target.value, categoryId: "" })}>{platforms.map(platform => <option key={platform}>{platform}</option>)}</select></label>
        {viewType === "shop" ? <label>店铺<select value={scope.shopId} onChange={event => setScope({ shopId: event.target.value, categoryId: "" })}><option value="">全部已授权店铺</option>{sources.map(source => <option value={source.id} key={source.id}>{source.name || source.accountLabel || source.id}</option>)}</select></label> : <><label>产品<select value={scope.productId} onChange={event => setScope({ productId: event.target.value, skuId: "", categoryId: "" })}><option value="">请选择产品</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>SKU<select value={scope.skuId} disabled={!scope.productId} onChange={event => setScope({ skuId: event.target.value })}><option value="">全部 SKU</option>{skuItems(currentProduct).map(sku => <option key={sku.id} value={sku.id}>{sku.label}</option>)}</select></label></>}
        <label>平台类目<select value={scope.categoryId} onChange={event => setScope({ categoryId: event.target.value })}><option value="">请选择已登记类目</option>{mappings.map(item => <option key={item.id} value={item.categoryId}>{item.categoryName || item.categoryPath || item.categoryId} · {(STATUS_META[item.status] || [item.status])[0]}</option>)}</select></label>
      </section>

      <section className="insight-category-strip">
        <div><Search size={17} aria-hidden="true" /><div><strong>类目建议与确认</strong><p>{selectedMapping ? <>{selectedMapping.categoryPath || selectedMapping.categoryName} · <StatusBadge status={selectedMapping.status} /></> : "系统推荐后需由产品或运营负责人确认，确认前不会自动采集。"}</p></div></div>
        <div>{selectedMapping?.status === "suggested" ? <Button variant="primary" disabled={!canConfirm || pending} disabledReason="当前身份不能确认类目" onClick={() => saveCategoryMapping({ mapping: selectedMapping, action: "confirm", expectedVersion: selectedMapping.version })}>确认类目</Button> : null}<Button disabled={actor.readonly || pending} onClick={() => setShowCategoryForm(open => !open)}>{showCategoryForm ? "收起" : "登记后台类目"}</Button></div>
      </section>
      {showCategoryForm ? <section className="insight-category-form"><label>平台类目 ID<input value={categoryDraft.categoryId} onChange={event => setCategoryDraft(current => ({ ...current, categoryId: event.target.value }))} /></label><label>类目名称<input value={categoryDraft.categoryName} onChange={event => setCategoryDraft(current => ({ ...current, categoryName: event.target.value }))} /></label><label>类目路径<input value={categoryDraft.categoryPath} onChange={event => setCategoryDraft(current => ({ ...current, categoryPath: event.target.value }))} /></label><label>已登录市场页地址<input type="url" value={categoryDraft.pageUrl} placeholder="https://" onChange={event => setCategoryDraft(current => ({ ...current, pageUrl: event.target.value }))} /></label><Button variant="primary" disabled={!categoryDraft.categoryId || !categoryDraft.categoryName || !/^https:\/\//.test(categoryDraft.pageUrl)} disabledReason="请填写类目 ID、名称和 HTTPS 市场页地址" onClick={saveSuggestedCategory}>保存为待确认</Button><p>不保存账号密码、Cookie、验证码、Token 或浏览器会话。</p></section> : null}

      <div className="insight-tabs" role="tablist" aria-label="用户洞察工作区">{TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}</button>)}</div>
      {loading ? <div className="insight-loading" aria-busy="true"><span /><span /><span /></div> : <div role="tabpanel">{activeTab === "audience" ? <AudienceWorkspace data={data} /> : activeTab === "competitors" ? <CompetitorWorkspace data={data} scope={scope} actor={actor} pending={pending} saveCompetitor={saveCompetitor} /> : <RuleWorkspace data={data} scope={scope} actor={actor} pending={pending} saveInsightRule={saveInsightRule} />}</div>}
      <footer className="insight-advisory"><Sparkles size={16} aria-hidden="true" /><strong>仅供参考</strong><span>用户洞察不会自动修改产品规划、运营方案、价格、预算或平台设置。</span></footer>
    </div>
  );
}
