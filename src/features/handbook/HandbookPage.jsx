import { BookOpenText, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  HANDBOOK_CATEGORIES,
  extractMarkdownHeadings,
  filterHandbookDocuments,
  resolveHandbookDocument
} from "../../domain/handbook.js";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { MarkdownDocument } from "./MarkdownDocument.jsx";
import { DEFAULT_HANDBOOK_SLUG, handbookDocuments } from "./handbookCatalog.js";
import "./handbook.css";

const CATEGORY_LABELS = Object.fromEntries(
  HANDBOOK_CATEGORIES.filter(category => category.id !== "all")
    .map(category => [category.id, category.label])
);

const KIND_LABELS = {
  guide: "使用说明",
  product: "产品说明",
  design: "设计书",
  specification: "设计规格",
  plan: "实施计划",
  platform: "平台能力"
};

const groupedDocuments = documents => Object.entries(CATEGORY_LABELS)
  .map(([category, label]) => ({
    category,
    label,
    documents: documents.filter(document => document.category === category)
  }))
  .filter(group => group.documents.length);

export default function HandbookPage({ selectedSlug, onSelectDocument }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const activeDocument = resolveHandbookDocument(
    handbookDocuments,
    selectedSlug,
    DEFAULT_HANDBOOK_SLUG
  );
  const filteredDocuments = useMemo(
    () => filterHandbookDocuments(handbookDocuments, { query, category }),
    [category, query]
  );
  const groups = useMemo(() => groupedDocuments(filteredDocuments), [filteredDocuments]);
  const headings = useMemo(
    () => extractMarkdownHeadings(activeDocument?.content),
    [activeDocument]
  );

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
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredDocuments.length && activeDocument ? (
        <div className="handbook-workspace">
          <nav className="handbook-catalog" aria-label="说明书目录">
            {groups.map(group => (
              <section key={group.category} className="handbook-catalog-group">
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

          <article className="handbook-article">
            <header className="handbook-document-header">
              <div className="handbook-document-kind">
                <BookOpenText size={15} aria-hidden="true" />
                {KIND_LABELS[activeDocument.kind] ?? activeDocument.kind}
              </div>
              <h1>{activeDocument.title}</h1>
              <p>{activeDocument.summary}</p>
              <time dateTime={activeDocument.updatedAt}>更新于 {activeDocument.updatedAt}</time>
            </header>
            <MarkdownDocument content={activeDocument.content} />
          </article>

          <aside className="handbook-toc" aria-label="本页目录">
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
          </aside>
        </div>
      ) : (
        <div className="handbook-empty">
          <BookOpenText size={24} aria-hidden="true" />
          <strong>没有找到匹配的说明</strong>
          <span>换一个关键词，或选择“全部”查看现有文档。</span>
          <button type="button" className="btn" onClick={() => { setQuery(""); setCategory("all"); }}>
            查看全部说明
          </button>
        </div>
      )}
    </section>
  );
}
