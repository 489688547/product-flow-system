import { BadgeInfo } from "lucide-react";
import { useMemo } from "react";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

function aggregateAccounts(state) {
  const byAccount = new Map();
  state.accounts.forEach(account => byAccount.set(account.id, { ...account, publications: 0, views: 0, interactions: 0, favorites: 0, shares: 0, followersGained: 0, completionNumerator: 0, spend: 0 }));
  state.publications.forEach(publication => {
    const row = byAccount.get(publication.accountId) || { id: publication.accountId, name: publication.accountName, platformLabel: publication.platformLabel, publications: 0, views: 0, interactions: 0, favorites: 0, shares: 0, followersGained: 0, completionNumerator: 0, spend: 0 };
    row.publications += 1;
    byAccount.set(publication.accountId, row);
  });
  state.performanceSnapshots.forEach(snapshot => {
    const row = byAccount.get(snapshot.accountId);
    if (!row) return;
    const views = Number(snapshot.contentViews || 0);
    row.views += views;
    row.interactions += Number(snapshot.interactions || 0);
    row.favorites += Number(snapshot.favorites || 0);
    row.shares += Number(snapshot.shares || 0);
    row.followersGained += Number(snapshot.followersGained || 0);
    row.completionNumerator += views * Number(snapshot.completionRate || 0);
    row.spend += Number(snapshot.spend || 0);
  });
  return [...byAccount.values()].map(row => ({ ...row, completionRate: row.views ? row.completionNumerator / row.views : null }));
}

export function BrandAccountPage() {
  const { state } = useBrandContent();
  const rows = useMemo(() => aggregateAccounts(state), [state]);
  const columns = [
    { key: "account", header: "平台 / 账号", render: row => <span className="content-product-cell"><strong>{row.name}</strong><small>{row.platformLabel} · {row.status === "waiting_import" ? "等待标准导入" : "账号有效"}</small></span> },
    { key: "published", header: "发布", render: row => <strong>{row.publications} 条</strong> },
    { key: "views", header: "自然播放", render: row => <strong>{row.views.toLocaleString("zh-CN")}</strong> },
    { key: "completion", header: "完播", render: row => <strong>{row.completionRate == null ? "—" : `${(row.completionRate * 100).toFixed(1)}%`}</strong> },
    { key: "engagement", header: "互动 / 收藏 / 分享", render: row => <span className="content-number-cell"><strong>{row.interactions.toLocaleString("zh-CN")} / {row.favorites.toLocaleString("zh-CN")} / {row.shares.toLocaleString("zh-CN")}</strong><small>均为自然内容字段</small></span> },
    { key: "followers", header: "涨粉", render: row => <strong>+{row.followersGained.toLocaleString("zh-CN")}</strong> },
    { key: "paid", header: "付费放大", render: row => row.spend > 0 ? <span className="paid-amplification"><BadgeInfo size={14} aria-hidden="true" />存在付费放大</span> : <span className="muted-copy">无付费标记</span> }
  ];
  return (
    <section className="page brand-content-page brand-account-page">
      <PageHeader title="品牌账号" description="自然播放、完播、互动、收藏、分享和涨粉单独复盘；付费数据只做放大标记。" />
      <section className="brand-account-note" role="note"><BadgeInfo size={17} aria-hidden="true" /><span>付费播放不会计入自然增长判断；快手和小红书等待数据中心标准导入时，页面明确显示数据截止与覆盖范围。</span></section>
      <section className="section-panel"><DataTable columns={columns} rows={rows} minWidth={980} empty={<div className="empty-state">尚未接入品牌账号数据。</div>} className="brand-account-table" /></section>
    </section>
  );
}
