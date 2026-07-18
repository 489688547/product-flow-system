import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

export function DataQualityGate({ dataQuality }) {
  const coverageRate = Number(dataQuality?.coverageRate || 0);
  const difference = dataQuality?.difference;
  const reconciled = dataQuality?.reconciliationStatus === "reconciled" && coverageRate >= 1;
  const waiting = dataQuality?.reconciliationStatus === "waiting";
  const Icon = reconciled ? CheckCircle2 : waiting ? Clock3 : AlertTriangle;
  return (
    <section className={`data-quality-gate ${reconciled ? "success" : waiting ? "neutral" : "warning"}`} role="status" aria-label="数据质量门禁">
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{reconciled ? "数据已对平" : waiting ? "等待数据中心首次同步" : "公司总盘仍有差额，暂不能确认内容问题"}</strong>
        <span>截止 {dataQuality?.asOfDate || "—"} · 覆盖率 {Math.round(coverageRate * 100)}% · 差额 {difference == null ? "待提供" : `¥${Number(difference).toLocaleString("zh-CN")}`} · 指标版本 {dataQuality?.metricVersion || "—"}</span>
      </div>
      <em>{dataQuality?.sourceMode === "demo" ? "结构演示" : reconciled ? "可进入判断" : "判断已锁定"}</em>
    </section>
  );
}
