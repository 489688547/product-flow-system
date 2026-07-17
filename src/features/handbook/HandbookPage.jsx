import { BookOpenText, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  HANDBOOK_CATEGORIES,
  extractMarkdownHeadings,
  filterHandbookDocuments,
  removeMarkdownLead,
  resolveHandbookDocument
} from "../../domain/handbook.js";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { MarkdownDocument } from "./MarkdownDocument.jsx";
import { DEFAULT_HANDBOOK_SLUG, handbookDocuments } from "./handbookCatalog.js";
import { IntegrationPlatformMap } from "./IntegrationPlatformMap.jsx";
import "./handbook.css";

const CATEGORY_LABELS = Object.fromEntries(
  HANDBOOK_CATEGORIES.map(category => [category.id, category.label])
);

const KIND_LABELS = {
  guide: "使用说明",
  product: "产品说明",
  design: "设计书",
  specification: "设计规格",
  platform: "平台能力"
};

const groupedDocuments = documents => Object.entries(CATEGORY_LABELS)
  .map(([category, label]) => ({
    category,
    label,
    documents: documents.filter(document => document.category === category)
  }))
  .filter(group => group.documents.length);

export default function HandbookPage({ selectedSlug, onSelectDocument, sessionUser }) {
  const [query, setQuery] = useState("");
  const activeDocument = resolveHandbookDocument(
    handbookDocuments,
    selectedSlug,
    DEFAULT_HANDBOOK_SLUG
  );
  const [category, setCategory] = useState(() => activeDocument?.category ?? "handbook");
  const filteredDocuments = useMemo(
    () => filterHandbookDocuments(handbookDocuments, { query, category }),
    [category, query]
  );
  const groups = useMemo(() => groupedDocuments(filteredDocuments), [filteredDocuments]);
  const isIntegrationMap = activeDocument?.slug === "platform/external-platform-map";
  const headings = useMemo(
    () => extractMarkdownHeadings(activeDocument?.content),
    [activeDocument]
  );

  useEffect(() => {
    if (selectedSlug && activeDocument?.category) {
      setCategory(activeDocument.category);
    }
  }, [activeDocument?.category, selectedSlug]);

  const selectCategory = nextCategory => {
    setCategory(nextCategory);

    if (activeDocument?.category !== nextCategory) {
      const firstDocument = handbookDocuments.find(document => document.category === nextCategory);
      if (firstDocument) onSelectDocument?.(firstDocument.slug);
    }
  };

  const jumpToHeading = (event, id) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="page handbook-page">
      <PageHeader
        title="说明书"
        description="公司的工作方法、产品定义、设计决策与共享平台能力，以仓库文档为准。"
      />

      <div className="handbook-tools" role="search">
        <label className="handbook-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">搜索说明书</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索说明书"
          />
          {query ? (
            <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}>
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="handbook-filters" aria-label="说明书分类">
          {HANDBOOK_CATEGORIES.map(item => (
            <button
              key={item.id}
              type="button"
              className={category === item.id ? "active" : ""}
              aria-pressed={category === item.id}
              onClick={() => selectCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredDocuments.length && activeDocument ? (
        <div className={`handbook-workspace${isIntegrationMap ? " platform-map-open" : ""}`}>
          <nav className="handbook-catalog" aria-label="说明书目录">
            {groups.map(group => (
              <section key={group.category} className="handbook-catalog-group" data-category={group.category}>
                <h2>{group.label}</h2>
                <div className="handbook-document-list">
                  {group.documents.map(document => (
                    <button
                      type="button"
                      key={document.slug}
                      className={activeDocument.slug === document.slug ? "active" : ""}
                      aria-current={activeDocument.slug === document.slug ? "page" : undefined}
                      onClick={() => onSelectDocument?.(document.slug)}
                    >
                      <strong>{document.title}</strong>
                      <small>{KIND_LABELS[document.kind] ?? document.kind}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </nav>

          <article className={`handbook-article${isIntegrationMap ? " handbook-article-platform-map" : ""}`}>
            <header className="handbook-document-header">
              <div className="handbook-document-kind">
                <BookOpenText size={15} aria-hidden="true" />
                {KIND_LABELS[activeDocument.kind] ?? activeDocument.kind}
              </div>
              <h1>{activeDocument.title}</h1>
              <p>{activeDocument.summary}</p>
              <time dateTime={activeDocument.updatedAt}>更新于 {activeDocument.updatedAt}</time>
            </header>
            {isIntegrationMap
              ? <IntegrationPlatformMap sessionUser={sessionUser} />
              : <MarkdownDocument content={removeMarkdownLead(activeDocument.content)} />}
          </article>

          {!isIntegrationMap ? <aside className="handbook-toc" aria-label="本页目录">
            <strong>本页目录</strong>
            {headings.length ? (
              <ol>
                {headings.map(heading => (
                  <li key={`${heading.id}-${heading.level}`} className={`level-${heading.level}`}>
                    <a href={`#${heading.id}`} onClick={event => jumpToHeading(event, heading.id)}>
                      {heading.title}
                    </a>
                  </li>
                ))}
              </ol>
            ) : <small>本页没有分节标题</small>}
          </aside> : null}
        </div>
      ) : (
        <div className="handbook-empty">
          <BookOpenText size={24} aria-hidden="true" />
          <strong>没有找到匹配的说明</strong>
          <span>换一个关键词，或返回使用手册查看现有文档。</span>
          <button type="button" className="btn" onClick={() => { setQuery(""); selectCategory("handbook"); }}>
            返回使用手册
          </button>
        </div>
      )}
    </section>
  );
}
