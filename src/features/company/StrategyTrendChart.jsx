import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildMonthlyTrend } from "../../domain/strategyExecution.js";

export default function StrategyTrendChart({ snapshots }) {
  const data = buildMonthlyTrend(snapshots);
  if (!data.length) return <div className="strategy-trend-empty">完成首次月度经营检查后，这里会显示正常、风险与偏离目标的变化。</div>;
  return (
    <div className="strategy-trend-chart" role="img" aria-label="月度战略健康度趋势">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-hover)" }} contentStyle={{ border: "1px solid var(--border)", borderRadius: 8, boxShadow: "none", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
          <Bar dataKey="normal" name="正常" stackId="health" fill="var(--success)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="atRisk" name="风险" stackId="health" fill="var(--warning)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="offTrack" name="偏离" stackId="health" fill="var(--danger)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="completed" name="已完成" stackId="health" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
