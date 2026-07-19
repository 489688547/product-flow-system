import { Copy, ExternalLink, FileVideo2, FolderOpen, HardDrive } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { ContentStatusBadge } from "./ContentStatusBadge.jsx";

const formatBytes = value => {
  const bytes = Number(value || 0);
  if (!bytes) return "待重新索引";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function NasAssetDetail({ asset, versions, content, publications, nasOnline, onCopyPath }) {
  if (!asset) return <div className="brand-asset-detail-empty"><FileVideo2 size={24} aria-hidden="true" /><p>选择左侧素材，查看 NAS 元数据、版本历史与发布关系。</p></div>;
  return (
    <section className="brand-asset-detail" aria-label={`${asset.fileName}素材详情`}>
      <div className="brand-asset-preview"><FileVideo2 size={36} aria-hidden="true" /><span>{asset.durationSeconds ? `${asset.durationSeconds} 秒` : "媒体信息待恢复"}</span></div>
      <div className="brand-asset-heading"><div><strong>{asset.fileName}</strong><small>{content?.id} · {content?.productName}</small></div><ContentStatusBadge status={asset.indexStatus === "indexed" ? "tested" : "inconsistent"} label={asset.indexStatus === "indexed" ? "已索引" : "文件失联"} /></div>
      <dl className="brand-asset-metadata">
        <div><dt>相对路径</dt><dd>{asset.nasRelativePath}</dd></div>
        <div><dt>文件大小</dt><dd>{formatBytes(asset.fileSize)}</dd></div>
        <div><dt>修改时间</dt><dd>{asset.modifiedAt?.slice(0, 16).replace("T", " ") || "—"}</dd></div>
        <div><dt>审核状态</dt><dd>{asset.reviewStatus || "待审核"}</dd></div>
      </dl>
      <div className="brand-asset-actions">
        <Button onClick={() => onCopyPath(asset.nasRelativePath)}><Copy size={15} aria-hidden="true" />复制路径</Button>
        <Button disabled={!nasOnline} disabledReason="NAS 当前离线；索引记录仍可查看，重新连接后才能打开目录"><FolderOpen size={15} aria-hidden="true" />打开目录</Button>
      </div>
      <section className="brand-asset-subsection"><h3>版本历史</h3>{versions.map(version => <div className="brand-version-row" key={version.id}><HardDrive size={15} aria-hidden="true" /><span><strong>v{version.version} · {version.fileName}</strong><small>{version.createdBy} · {version.modifiedAt?.slice(0, 10)}</small></span></div>)}</section>
      <section className="brand-asset-subsection"><h3>发布关系</h3>{publications.length ? publications.map(publication => <div className="brand-version-row" key={publication.id}><ExternalLink size={15} aria-hidden="true" /><span><strong>{publication.platformLabel} · {publication.accountName}</strong><small>{publication.materialIds?.join(" / ") || "缺素材 ID"}</small></span></div>) : <p>尚未建立发布记录。</p>}</section>
    </section>
  );
}
