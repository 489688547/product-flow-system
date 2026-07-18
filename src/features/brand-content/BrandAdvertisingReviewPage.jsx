import { CircleSlash2 } from "lucide-react";
import { useMemo } from "react";
import { deriveContentDataStatus } from "../../domain/brandContent.js";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ContentStatusBadge } from "./ContentStatusBadge.jsx";
import { DataQualityGate } from "./DataQualityGate.jsx";

const money = value => value == null ? "—" : `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;

export function BrandAdvertisingReviewPage() {
  const { state } = useBrandContent();
  const contentMap = useMemo(() => new Map(state.contents.map(content => [content.id, content])), [state.contents]);
  const publicationMap = useMemo(() => new Map(state.publications.flatMap(publication => (publication.materialIds || []).map(materialId => [String(materialId), publication]))), [state.publications]);
  const rows = state.performanceSnapshots.map(snapshot => {
    const content = contentMap.get(snapshot.contentId);
    const publication = publicationMap.get(String(snapshot.materialId));
    return { ...snapshot, content, publication, status: deriveContentDataStatus(content, state.publications, state.performanceSnapshots, state.settings, new Date()) };
  });
  const canJudge = state.dataQuality.reconciliationStatus === "reconciled" && Number(state.dataQuality.coverageRate) >= 1 && state.dataQuality.sourceMode !== "demo";
  const columns = [
    { key: "content", header: "内容 / 产品", render: row => <span className="content-product-cell"><strong>{row.content?.title || row.materialId}</strong><small>{row.content?.productName || "未映射产品"}</small></span> },
    { key: "link", header: "产品链接", render: row => <span className="content-number-cell"><strong>{row.publication?.productLinkName || row.productLinkId || "未映射"}</strong><small>{row.publication?.accountName || row.accountId}</small></span> },
    { key: "material", header: "素材归因", render: row => <span className="content-number-cell"><strong>{row.materialId}</strong><small>{row.deliverySystem} · {row.selectionMode} · {row.deliveryStrategy}</small></span> },
    { key: "spend", header: "消耗 / GMV", render: row => <span className="content-number-cell"><strong>{money(row.spend)} / {money(row.gmv)}</strong><small>ROI {row.roi == null ? "—" : Number(row.roi).toFixed(2)}</small></span> },
    { key: "status", header: "判断门槛", render: row => <ContentStatusBadge status={row.status} /> }
  ];
  return (
    <section className="page brand-content-page brand-review-page">
      <PageHeader title="投放复盘" description="先确认公司、账户、模式、产品链接和素材归因已经对平，再判断内容方向。">
        <Button variant="primary" disabled={!canJudge} disabledReason={state.dataQuality.sourceMode === "demo" ? "当前为结构演示数据，不能确认生产内容问题" : "数据尚未对平，暂不能确认内容问题"}>确认内容问题</Button>
      </PageHeader>
      <DataQualityGate dataQuality={state.dataQuality} />
      <section className="brand-review-sequence" aria-label="判断顺序"><span>1 完整性</span><span>2 数据对平</span><span>3 学习期</span><span>4 有效测试</span><span>5 同龄对比</span><span>6 形成动作</span></section>
      <section className="section-panel">
        <div className="panel-title"><div><h2>产品链接与素材归因</h2><small>全域、乘方、GMV、实付、链接消耗与素材消耗分别保留</small></div></div>
        {rows.length ? <DataTable columns={columns} rows={rows} minWidth={1080} empty="暂无表现快照" className="brand-review-table" /> : <div className="empty-state"><CircleSlash2 size={22} aria-hidden="true" />数据中心尚未返回标准表现快照；生产协同仍可继续使用。</div>}
      </section>
    </section>
  );
}
