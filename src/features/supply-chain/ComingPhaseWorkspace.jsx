import { CircleDashed, Database, Route } from "lucide-react";

export function ComingPhaseWorkspace({ title, phase, description, availableEvidence = [], requiredSources = [] }) {
  return (
    <section className="goods-flow-coming" aria-labelledby={`coming-${phase}`}>
      <header>
        <span className="status-badge neutral">{phase}</span>
        <h2 id={`coming-${phase}`}>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="goods-flow-readiness">
        <section>
          <h3><Database size={16} aria-hidden="true" />当前可用依据</h3>
          <ul>{availableEvidence.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3><Route size={16} aria-hidden="true" />上线所需数据</h3>
          <ul>{requiredSources.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
      </div>
      <p className="goods-flow-coming-note"><CircleDashed size={16} aria-hidden="true" />尚未启用自动决策；数据与业务规则达到验收条件后再开放。</p>
    </section>
  );
}
