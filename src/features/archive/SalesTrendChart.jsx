import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatDay(value) {
  return String(value).slice(5);
}

function formatMoneyShort(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return `${Math.round(value)}`;
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="sales-trend-tooltip" role="status">
      <strong>{label}</strong>
      <span>净销售额 ¥{day.netSales.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</span>
      <span>净销量 {day.qty.toLocaleString("zh-CN")} 件</span>
    </div>
  );
}

export default function SalesTrendChart({ series }) {
  const tickGap = Math.max(1, Math.ceil(series.length / 10));
  return (
    <div className="sales-trend-chart" role="img" aria-label="日净销售额折线图">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDay}
            interval={tickGap - 1}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatMoneyShort}
            width={52}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }} />
          <Line
            type="monotone"
            dataKey="netSales"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
