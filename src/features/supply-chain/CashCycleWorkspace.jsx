import { useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";

function metric(value, unit = "天") {
  return value === null || value === undefined ? "—" : `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}${unit}`;
}

function monthEnd(month) {
  const [year, value] = String(month).split("-").map(Number);
  const date = new Date(Date.UTC(year, value, 0));
  return { periodEnd: date.toISOString().slice(0, 10), daysInPeriod: date.getUTCDate() };
}

function overlaps(terms, draft) {
  const draftEnd = draft.effectiveTo || "9999-12-31";
  return terms.some(row => row.platform === draft.platform
    && row.id !== draft.id
    && row.effectiveFrom <= draftEnd
    && draft.effectiveFrom <= (row.effectiveTo || "9999-12-31"));
}

export function CashCycleWorkspace({
  dashboard,
  terms = [],
  canEditTerms = false,
  canRecalculateCcc = false,
  canFreezeCcc = false,
  onSaveTerm,
  onRecalculate,
  onFreeze
}) {
  const metrics = dashboard?.metrics || {};
  const [draft, setDraft] = useState({ platform: "", days: "", effectiveFrom: "", effectiveTo: "", reason: "" });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [freezeOpen, setFreezeOpen] = useState(false);

  function disabledReason(action) {
    if (action === "term" && !canEditTerms) return "仅财务或总经办可维护平台账期。";
    if (action === "recalculate" && !canRecalculateCcc) return "仅财务、供应链或总经办可重新计算 CCC。";
    if (action === "freeze" && !canFreezeCcc) return "仅财务或总经办可冻结 CCC。";
    if (action === "freeze" && !metrics.version) return "请先生成当月 CCC 计算版本。";
    if (action === "freeze" && metrics.confidence !== "complete") return "来源覆盖不足，补齐库存、成本、账期和应付日期后才能冻结。";
    if (action === "freeze" && metrics.status === "frozen") return "当前版本已经冻结。";
    return "";
  }

  async function saveTerm(event) {
    event.preventDefault();
    setError(""); setNotice("");
    const term = {
      ...draft,
      id: draft.id || `term-${draft.platform}-${draft.effectiveFrom}-${Date.now()}`,
      days: Number(draft.days),
      version: 1
    };
    if (overlaps(terms, term)) {
      setError("该平台的账期生效区间重叠，请调整起止日期后再保存。");
      return;
    }
    setBusy("term");
    try {
      await onSaveTerm(term);
      setDraft({ platform: "", days: "", effectiveFrom: "", effectiveTo: "", reason: "" });
      setNotice("平台账期已保存，新计算将按生效日期取值。");
    } catch (eventError) {
      setError(eventError.code === "GOODS_FLOW_TERM_OVERLAP" ? "该平台的账期生效区间重叠。" : eventError.message || "平台账期保存失败。");
    } finally {
      setBusy("");
    }
  }

  async function recalculate() {
    setBusy("recalculate"); setError(""); setNotice("");
    try {
      const result = await onRecalculate(month, monthEnd(month));
      setNotice(`已生成计算版本 ${result?.data?.version || "新版本"}；请核对覆盖率后再冻结。`);
    } catch (eventError) {
      setError(eventError.message || "CCC 重新计算失败。");
    } finally {
      setBusy("");
    }
  }

  async function freeze() {
    setBusy("freeze"); setError(""); setNotice("");
    try {
      const result = await onFreeze(month, metrics.version);
      setNotice(`计算版本 ${result?.data?.version || metrics.version} 已冻结。`);
      setFreezeOpen(false);
    } catch (eventError) {
      setError(eventError.message || "CCC 冻结失败。");
    } finally {
      setBusy("");
    }
  }

  const columns = [
    { key: "platform", header: "平台", render: row => <strong>{row.platform}</strong> },
    { key: "days", header: <span className="num">固定应收账期</span>, render: row => <span className="num">{`${row.days} 天`}</span> },
    { key: "from", header: "生效日期", render: row => row.effectiveFrom },
    { key: "to", header: "结束日期", render: row => row.effectiveTo || "长期有效" },
    { key: "reason", header: "调整原因", render: row => row.reason },
    { key: "version", header: "版本", render: row => `v${row.version}` }
  ];
  const freezeReason = disabledReason("freeze");

  return (
    <div className="goods-flow-workspace">
      <div className="cash-cycle-scroll">
        <section className="cash-cycle-equation" aria-label="现金循环构成">
          <div><span>库存周转</span><strong>{metric(metrics.inventoryDays)}</strong></div>
          <b>+</b>
          <div><span>应收</span><strong>{metric(metrics.receivableDays)}</strong></div>
          <b>−</b>
          <div><span>应付</span><strong>{metric(metrics.payableDays)}</strong></div>
          <b>=</b>
          <div className="cash-cycle-result"><span>CCC</span><strong>{metric(metrics.cccDays)}</strong></div>
        </section>
      </div>

      <section className="cash-cycle-controlbar">
        <div><strong>计算版本 {metrics.version ? `v${metrics.version}` : "尚未生成"}</strong><span>{metrics.formulaVersion || "goods-flow-v1"} · {metrics.status === "frozen" ? `已由 ${metrics.frozenBy || "财务"} 冻结` : "草稿"}</span></div>
        <label>月份<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
        <Button disabled={!canRecalculateCcc || Boolean(busy)} disabledReason={disabledReason("recalculate")} onClick={recalculate}><RefreshCw size={15} />{busy === "recalculate" ? "计算中…" : "重新计算"}</Button>
        <Button variant="primary" disabled={Boolean(freezeReason) || Boolean(busy)} disabledReason={freezeReason} onClick={() => setFreezeOpen(true)}><LockKeyhole size={15} />冻结本版</Button>
      </section>

      {error ? <p className="supply-message error" role="alert">{error}</p> : null}
      {notice ? <p className="supply-message success" role="status">{notice}</p> : null}

      <section className="section-panel">
        <div className="section-head"><div><h2>平台应收账期</h2><p>由财务按平台和生效日期维护；历史月份使用当期有效版本。</p></div></div>
        <form className="goods-flow-term-form" onSubmit={saveTerm}>
          <fieldset disabled={!canEditTerms || Boolean(busy)}>
            <label>平台<input required value={draft.platform} onChange={event => setDraft(current => ({ ...current, platform: event.target.value }))} placeholder="如：天猫、抖音" /></label>
            <label>账期天数<input required type="number" min="0" value={draft.days} onChange={event => setDraft(current => ({ ...current, days: event.target.value }))} /></label>
            <label>生效日期<input required type="date" value={draft.effectiveFrom} onChange={event => setDraft(current => ({ ...current, effectiveFrom: event.target.value }))} /></label>
            <label>结束日期<input type="date" value={draft.effectiveTo} onChange={event => setDraft(current => ({ ...current, effectiveTo: event.target.value }))} /></label>
            <label className="term-reason">调整原因<input required value={draft.reason} onChange={event => setDraft(current => ({ ...current, reason: event.target.value }))} placeholder="平台约定或财务调整依据" /></label>
            <Button type="submit" variant="primary" disabled={!canEditTerms || Boolean(busy)} disabledReason={disabledReason("term")}>{busy === "term" ? "保存中…" : "保存账期"}</Button>
          </fieldset>
        </form>
        {!canEditTerms ? <p className="permission-note">{disabledReason("term")}</p> : null}
        <DataTable minWidth={780} columns={columns} rows={terms} empty={<div className="empty-state compact-empty">尚未维护平台账期，CCC 的应收天数暂不可计算。</div>} />
      </section>

      <Modal
        title="冻结月度 CCC"
        open={freezeOpen}
        onClose={() => setFreezeOpen(false)}
        size="confirm"
        footer={<><Button onClick={() => setFreezeOpen(false)}>取消</Button><Button variant="primary" disabled={busy === "freeze"} onClick={freeze}>{busy === "freeze" ? "冻结中…" : "确认冻结"}</Button></>}
      >
        <div className="cash-freeze-confirm"><LockKeyhole size={20} aria-hidden="true" /><div><strong>确认冻结 {month} 的计算版本 v{metrics.version}？</strong><p>冻结后本版本保持只读；后续补录将生成新版本，不会覆盖当前结果。</p></div></div>
      </Modal>
    </div>
  );
}
