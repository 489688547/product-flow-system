import { ArrowRight, CircleCheck, FlaskConical } from "lucide-react";
import { useState } from "react";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DecisionConfirmModal } from "./DecisionConfirmModal.jsx";

export function BrandDecisionPage() {
  const { state, saving, dispatch } = useBrandContent();
  const { orgCache } = useProductFlow();
  const [selected, setSelected] = useState(null);
  const pending = state.decisions.filter(decision => decision.status === "pending");
  const confirmed = state.decisions.filter(decision => decision.status === "confirmed");
  return (
    <section className="page brand-content-page brand-decision-page">
      <PageHeader title="补充决策" description="先展示证据和限制，再由负责人确认数量、方向、账户、责任人和复盘日期。" />
      <section className="brand-decision-list" aria-label="待确认补充决策">
        {pending.length ? pending.map(decision => <article className="brand-decision-row" key={decision.id}><span className="brand-decision-icon"><FlaskConical size={19} aria-hidden="true" /></span><div><strong>{decision.productName} · {decision.label}</strong><p>{decision.evidence}</p><small>来源 {decision.sourceContentId || "产品经营判断"} · 数据版本 {decision.evidenceVersion || "—"} · 建议复盘 {decision.reviewAt || "待安排"}</small></div><span className="brand-decision-target"><small>目标账户</small><strong>{decision.targetAccount || "待确认"}</strong></span>{decision.action === "make_variation" ? <Button variant="primary" onClick={() => setSelected(decision)}>确认制作<ArrowRight size={14} aria-hidden="true" /></Button> : <Button disabled disabledReason="追加测试属于运营执行动作，等待数据中心与投放分配能力接入">等待运营处理</Button>}</article>) : <div className="section-panel empty-state">当前没有待确认补充决策。成熟素材完成复盘后，建议会进入这里。</div>}
      </section>
      {confirmed.length ? <section className="section-panel"><div className="panel-title"><CircleCheck size={17} aria-hidden="true" /><h2>已确认决策</h2></div>{confirmed.map(decision => <div className="brand-confirmed-decision" key={decision.id}><strong>{decision.productName} · {decision.quantity} 条</strong><span>{decision.contentDirection} · {decision.targetAccount}</span><small>{decision.confirmedBy} · {decision.confirmedAt?.slice(0, 16).replace("T", " ")}</small></div>)}</section> : null}
      <DecisionConfirmModal open={Boolean(selected)} decision={selected} accounts={state.accounts} orgCache={orgCache} saving={saving} onClose={() => setSelected(null)} dispatch={dispatch} />
    </section>
  );
}
