import { BadgeInfo } from "lucide-react";
import { useMemo } from "react";
import { buildBrandTeamMetrics } from "../../domain/brandContent.js";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

const percent = value => value == null ? "—" : `${Math.round(value * 100)}%`;

function RoleTable({ title, description, rows }) {
  const columns = [
    { key: "person", header: title, render: row => <span className="content-product-cell"><strong>{row.name}</strong><small>{row.rankStatus === "insufficient" ? "成熟样本不足，暂不排名" : "同口径成熟样本"}</small></span> },
    { key: "delivered", header: "交付", render: row => <strong>{row.delivered}</strong> },
    { key: "ontime", header: "按时率", render: row => <strong>{percent(row.onTimeRate)}</strong> },
    { key: "online", header: "上线率", render: row => <strong>{percent(row.publishedRate)}</strong> },
    { key: "tested", header: "有效测试率", render: row => <strong>{percent(row.effectiveTestRate)}</strong> },
    { key: "tier", header: "第二梯队", render: row => <strong>{row.secondTier}</strong> },
    { key: "sample", header: "成熟样本", render: row => <span className={row.rankStatus === "insufficient" ? "sample-insufficient" : "sample-ready"}>{row.matureSamples} 条 · {row.rankStatus === "insufficient" ? "暂不排名" : "可比较"}</span> }
  ];
  return <section className="section-panel brand-role-panel"><div className="panel-title"><div><h2>{title}</h2><small>{description}</small></div></div><DataTable columns={columns} rows={rows} minWidth={820} empty="当前角色暂无内容记录" /></section>;
}

export function BrandTeamPage() {
  const { state } = useBrandContent();
  const metrics = useMemo(() => buildBrandTeamMetrics(state, new Date()), [state]);
  return (
    <section className="page brand-content-page brand-team-page">
      <PageHeader title="团队效能" description="按主责任人和角色分别统计；学习中、未测试和样本不足不会用于能力结论。" />
      <section className="brand-team-note" role="note"><BadgeInfo size={17} aria-hidden="true" /><span>协作者不重复累计团队产量。人员比较需限定同产品、同平台、同账户角色和相近上线时间。</span></section>
      <RoleTable title="编导" description="关注交付、上线、有效测试和成熟方向" rows={metrics.directors} />
      <RoleTable title="剪辑" description="关注交付、上线、有效测试和进入第二梯队" rows={metrics.editors} />
      <RoleTable title="运营" description="关注发布及时、素材 ID 完整、测试覆盖和数据问题闭环" rows={metrics.operators} />
    </section>
  );
}
