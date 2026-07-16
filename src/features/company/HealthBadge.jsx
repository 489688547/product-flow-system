import { HEALTH_META } from "../../domain/strategyExecution.js";

export function HealthBadge({ health = "normal", suffix = "" }) {
  const meta = HEALTH_META[health] || HEALTH_META.normal;
  return <span className={`health-badge ${meta.tone}`}><i aria-hidden="true" />{meta.label}{suffix}</span>;
}
