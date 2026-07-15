import { AlertTriangle, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  calculateProductGrade,
  hasFormalProductGrading,
  PRODUCT_GRADING_DIMENSIONS,
  PRODUCT_GRADING_RISKS,
  RESERVE_LEVEL
} from "../../domain/productFlow.js";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

const EMPTY_ANSWERS = { strategy: 0, salesScale: 0, commercialValue: 0, resourceDemand: 0, risks: {} };

export function ProductGradingModal({ open, product, canEdit = false, onClose, onSave }) {
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);

  useEffect(() => {
    if (!open) return;
    setAnswers(product?.grading?.answers ? { ...product.grading.answers, risks: { ...(product.grading.answers.risks || {}) } } : EMPTY_ANSWERS);
  }, [open, product?.id, product?.grading]);

  const result = useMemo(() => calculateProductGrade(answers), [answers]);
  const isReserve = result.level === RESERVE_LEVEL;
  const levelClass = result.level ? `level-${result.level.slice(0, 2).toLowerCase()}` : "";
  const riskClass = result.riskBand === "高风险" ? "risk-high" : result.riskBand === "中风险" ? "risk-medium" : "risk-low";
  const setScore = (key, score) => setAnswers(current => ({ ...current, [key]: score }));
  const toggleRisk = key => setAnswers(current => ({ ...current, risks: { ...current.risks, [key]: !current.risks?.[key] } }));

  return (
    <Modal
      open={open}
      title={hasFormalProductGrading(product) ? "查看定级打分" : "产品定级"}
      size="large"
      onClose={onClose}
      footer={canEdit ? <><Button onClick={onClose}>取消</Button><Button variant={isReserve ? "danger" : "primary"} disabled={!result.complete} disabledReason="请完成四项基础评分" onClick={() => onSave(answers)}>{isReserve ? "退回需求池" : "确认定级"}</Button></> : null}
    >
      <div className="grading-intro"><strong>{product?.name}</strong><em>需求池参考等级：{product?.referenceLevel || product?.level || "未填写"}</em><span>价值与资源决定正式产品等级；C2 单独判断风险，并调整管理强度和推进方式。</span></div>
      <div className="grading-layout">
        <div className="grading-form">
          {PRODUCT_GRADING_DIMENSIONS.map(dimension => (
            <fieldset className="grading-dimension" key={dimension.key}>
              <legend>{dimension.title}</legend>
              <div className="grading-options">
                {dimension.options.map((label, index) => {
                  const score = index + 1;
                  const active = answers[dimension.key] === score;
                  return <button type="button" key={score} className={active ? "active" : ""} aria-pressed={active} disabled={!canEdit} title={!canEdit ? "只有产品负责人可以修改定级打分" : undefined} onClick={() => setScore(dimension.key, score)}><b>{score}</b><span>{label}</span>{active ? <Check size={14} /> : null}</button>;
                })}
              </div>
            </fieldset>
          ))}
          <fieldset className="grading-dimension grading-risks">
            <legend>C2. 风险核查</legend>
            <div className="grading-risk-grid">
              {PRODUCT_GRADING_RISKS.map(risk => <label key={risk.key} title={!canEdit ? "只有产品负责人可以修改风险评分" : undefined}><input type="checkbox" disabled={!canEdit} checked={Boolean(answers.risks?.[risk.key])} onChange={() => toggleRisk(risk.key)} /><span>{risk.label}</span><em>+{risk.adjustment}</em></label>)}
            </div>
          </fieldset>
        </div>
        <aside className={`grading-result ${isReserve ? "reserve" : ""}`}>
          <span>自动定级结果</span>
          {result.complete ? <>
            <div className="grading-output-list">
              <div><span>产品等级</span><strong className={levelClass}>{result.level}</strong></div>
              <div><span>风险等级</span><strong className={riskClass}>{result.riskBand}</strong></div>
              <div><span>推进方式</span><strong>{result.route}</strong></div>
            </div>
            <dl>
              <div><dt>价值分</dt><dd>{result.valueScore}/15</dd></div>
              <div><dt>资源投入</dt><dd>{result.resourceScore}/5 · {result.resourceBand}</dd></div>
              <div><dt>价值等级</dt><dd>{result.valueBand}</dd></div>
              <div><dt>风险核查</dt><dd>{result.riskScore}/5</dd></div>
            </dl>
            <p>{result.rule}</p>
            <p>{result.riskNote}</p>
            <small>{result.management}</small>
          </> : <strong>四项基础评分填写完整后自动计算。</strong>}
          {isReserve ? <div className="grading-reserve-warning"><AlertTriangle size={17} /><span>确认后将自动退回需求池，并清除该产品的任务、资料、会议和阶段进度。</span></div> : null}
        </aside>
      </div>
    </Modal>
  );
}
