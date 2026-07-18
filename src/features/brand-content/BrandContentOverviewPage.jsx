import { AlertTriangle, CircleDollarSign, CircleGauge, FileWarning, Plus, Send, TimerReset } from "lucide-react";
import { useMemo, useState } from "react";
import { canAccessCompanyPlatform } from "../../domain/permissions.js";
import { summarizeBrandOverview } from "../../domain/brandContent.js";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ContentBriefModal } from "./ContentBriefModal.jsx";
import { ContentOperationsTable } from "./ContentOperationsTable.jsx";
import { ContentStatusBadge } from "./ContentStatusBadge.jsx";

const FOCUS_ITEMS = [
  { key: "unpublished", label: "未发布", Icon: Send, route: "content-workbench" },
  { key: "missingId", label: "缺素材 ID", Icon: FileWarning, route: "content-issues" },
  { key: "learning", label: "学习期到期", Icon: TimerReset, route: "content-review" },
  { key: "untested", label: "未获有效测试", Icon: CircleDollarSign, route: "content-review" },
  { key: "dataIssues", label: "数据问题", Icon: AlertTriangle, route: "content-issues" }
];

const STATUS_EXAMPLES = {
  untested: { code: "untested", label: "追加有效测试" },
  learning: { code: "learning", label: "继续观察" },
  tested: { code: "tested", label: "复盘成熟素材" },
  notPublished: { code: "not_published", label: "推进发布" }
};

export function BrandContentOverviewPage({ onNavigate }) {
  const { state, loading, saving, error, currentUser, dispatch } = useBrandContent();
  const { state: productState, orgCache } = useProductFlow();
  const [briefOpen, setBriefOpen] = useState(false);
  const summary = useMemo(() => summarizeBrandOverview(state, new Date()), [state]);
  const isExecutive = canAccessCompanyPlatform(currentUser);
  const assigned = state.contents.filter(content => isExecutive || [content.directorName, content.editorName, content.operatorName].includes(currentUser?.name));
  const queue = (assigned.length ? assigned : state.contents).slice(0, 6);

  const createBrief = async record => {
    await dispatch({ type: "create_content", record });
    setBriefOpen(false);
  };

  return (
    <section className="page brand-content-page brand-overview-page">
      <PageHeader title="内容总览" description="先处理生产与数据断点，再决定补什么、给谁做、何时复盘。">
        <Button variant="primary" onClick={() => setBriefOpen(true)}><Plus size={16} aria-hidden="true" />创建 Brief</Button>
      </PageHeader>

      <section className={`brand-data-banner ${summary.dataQuality.sourceMode === "demo" ? "demo" : ""}`} role="status">
        <CircleGauge size={18} aria-hidden="true" />
        <div><strong>{summary.dataQuality.sourceMode === "demo" ? "当前为结构演示数据" : `数据中心已同步至 ${summary.dataQuality.asOfDate || "待首次同步"}`}</strong><span>{summary.dataQuality.sourceMode === "demo" ? "生产协同已可使用；真实投放与自然内容表现等待数据中心标准契约。" : `覆盖率 ${Math.round(Number(summary.dataQuality.coverageRate || 0) * 100)}% · 指标版本 ${summary.dataQuality.metricVersion || "未提供"}`}</span></div>
        {error ? <em>{error}</em> : null}
      </section>

      <section className="brand-focus-strip" aria-label="今日焦点">
        {FOCUS_ITEMS.map(({ key, label, Icon, route }) => <button key={key} type="button" onClick={() => onNavigate(route)}><Icon size={17} aria-hidden="true" /><span><strong>{loading ? "—" : summary.focus[key]}</strong><small>{label}</small></span></button>)}
      </section>

      <section className="section-panel brand-operations-panel">
        <div className="panel-title"><div><h2>产品内容作战表</h2><small>同屏查看归因表现、上线结构、测试覆盖和下一动作</small></div></div>
        <ContentOperationsTable products={summary.products} statuses={STATUS_EXAMPLES} onOpenWorkbench={productId => onNavigate("content-workbench", productId)} />
      </section>

      <section className="brand-overview-grid">
        <section className="section-panel brand-responsibility-panel">
          <div className="panel-title"><div><h2>责任队列</h2><small>{isExecutive ? "管理视角 · 全团队待推进内容" : `${currentUser?.name || "当前用户"}需要处理的内容`}</small></div></div>
          <div className="brand-responsibility-list">
            {queue.length ? queue.map(content => <button key={content.id} type="button" onClick={() => onNavigate("content-workbench", content.id)}><span><strong>{content.title}</strong><small>{content.id} · {content.productName}</small></span><ContentStatusBadge status={content.productionStatus} kind="production" /></button>) : <div className="empty-state">当前没有待处理内容。新建 Brief 后，责任事项会按角色进入这里。</div>}
          </div>
        </section>
        <section className="section-panel brand-contribution-panel">
          <div className="panel-title"><div><h2>内容贡献</h2><small>付费表现与自然增长分开统计</small></div></div>
          <dl>
            <div><dt>归因消耗</dt><dd>¥{summary.paid.spend.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</dd></div>
            <div><dt>归因 GMV</dt><dd>¥{summary.paid.gmv.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</dd></div>
            <div><dt>自然播放</dt><dd>{summary.organic.views.toLocaleString("zh-CN")}</dd></div>
            <div><dt>自然涨粉</dt><dd>{summary.organic.followersGained.toLocaleString("zh-CN")}</dd></div>
          </dl>
          <p>演示快照只用于验证页面与判断顺序，不代表公司生产投放数据。</p>
        </section>
      </section>

      <ContentBriefModal open={briefOpen} products={productState.products} currentUser={currentUser} orgCache={orgCache} saving={saving} onClose={() => setBriefOpen(false)} onSave={createBrief} />
    </section>
  );
}
