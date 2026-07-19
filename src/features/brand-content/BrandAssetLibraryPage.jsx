import { CloudOff, FileVideo2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { NasAssetDetail } from "./NasAssetDetail.jsx";

export function BrandAssetLibraryPage() {
  const { state } = useBrandContent();
  const [selectedId, setSelectedId] = useState(state.assetVersions[0]?.id || "");
  const [query, setQuery] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const contents = useMemo(() => new Map(state.contents.map(content => [content.id, content])), [state.contents]);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return state.assetVersions.filter(asset => !value || [asset.fileName, asset.nasRelativePath, asset.contentId, contents.get(asset.contentId)?.productName].some(item => String(item || "").toLowerCase().includes(value)));
  }, [contents, query, state.assetVersions]);
  const selected = state.assetVersions.find(asset => asset.id === selectedId) || filtered[0];
  const versions = state.assetVersions.filter(asset => asset.contentId === selected?.contentId).sort((a, b) => Number(b.version) - Number(a.version));
  const publications = state.publications.filter(publication => publication.contentId === selected?.contentId);
  const nasOnline = state.settings.nasIndexStatus === "online";
  const copyPath = async path => {
    try {
      await navigator.clipboard.writeText(path);
      setCopyMessage("相对路径已复制");
    } catch {
      setCopyMessage("浏览器未允许复制，请手动选择路径");
    }
  };

  return (
    <section className="page brand-content-page brand-assets-page">
      <PageHeader title="素材资产" description="查看绿联 NAS 已索引素材、版本历史和发布关系；系统只保存相对路径与媒体元数据。" />
      <section className={`brand-nas-status ${nasOnline ? "online" : "offline"}`} role="status"><CloudOff size={17} aria-hidden="true" /><div><strong>{nasOnline ? "NAS 索引在线" : "NAS 索引暂不可用，当前显示上次扫描结果"}</strong><span>受控目录：{state.settings.nasRootLabel} · 上次索引 {state.settings.nasLastScannedAt?.slice(0, 16).replace("T", " ") || "尚未完成"}</span></div>{copyMessage ? <em>{copyMessage}</em> : null}</section>
      <section className="brand-asset-layout">
        <section className="section-panel brand-asset-list-panel">
          <label className="brand-search-field"><Search size={15} aria-hidden="true" /><span>搜索素材</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="文件名、内容 ID、产品或相对路径" /></label>
          <div className="brand-asset-list" role="listbox" aria-label="NAS 素材列表">
            {filtered.length ? filtered.map(asset => {
              const content = contents.get(asset.contentId);
              const publicationCount = state.publications.filter(publication => publication.contentId === asset.contentId).length;
              return <button key={asset.id} type="button" role="option" aria-selected={selected?.id === asset.id} className={selected?.id === asset.id ? "active" : ""} onClick={() => setSelectedId(asset.id)}><FileVideo2 size={18} aria-hidden="true" /><span><strong>{asset.fileName}</strong><small>{content?.productName || "未映射产品"} · v{asset.version} · {publicationCount} 次发布</small><em>相对路径：{asset.nasRelativePath}</em></span><i>{asset.indexStatus === "indexed" ? "已索引" : "文件失联"}</i></button>;
            }) : <div className="empty-state">当前筛选没有素材。NAS 尚未索引时，已有业务记录仍会保留。</div>}
          </div>
        </section>
        <section className="section-panel brand-asset-detail-panel"><NasAssetDetail asset={selected} versions={versions} content={contents.get(selected?.contentId)} publications={publications} nasOnline={nasOnline} onCopyPath={copyPath} /></section>
      </section>
    </section>
  );
}
