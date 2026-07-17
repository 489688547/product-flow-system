import GithubSlugger from "github-slugger";

export const HANDBOOK_CATEGORIES = [
  { id: "all", label: "全部" },
  { id: "handbook", label: "员工使用手册" },
  { id: "product", label: "产品与设计" },
  { id: "platform", label: "平台能力" }
];

const normalizeWhitespace = value => String(value ?? "").replace(/\s+/g, " ").trim();
const isMarkdownStructure = value => /^#{1,6}\s|^(```|~~~|>|[-*+]\s|\d+[.)]\s|\|)/.test(value);

const cleanInlineMarkdown = value => normalizeWhitespace(
  value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
);

const deriveTitle = content => {
  const match = String(content ?? "").match(/^#\s+(.+?)\s*#*\s*$/m);
  return match ? cleanInlineMarkdown(match[1]) : "未命名说明";
};

const deriveSummary = content => {
  const lines = String(content ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const value = lines[index].trim();
    if (!value || isMarkdownStructure(value)) continue;

    const paragraph = [value];
    while (lines[index + 1]?.trim() && !isMarkdownStructure(lines[index + 1].trim())) {
      paragraph.push(lines[index + 1].trim());
      index += 1;
    }
    return cleanInlineMarkdown(paragraph.join(" "));
  }

  return "暂无摘要";
};

export function createHandbookDocument(entry) {
  const content = String(entry.content ?? "");

  return {
    ...entry,
    content,
    title: normalizeWhitespace(entry.title) || deriveTitle(content),
    summary: normalizeWhitespace(entry.summary) || deriveSummary(content)
  };
}

export function filterHandbookDocuments(documents, { query = "", category = "all" } = {}) {
  const normalizedQuery = normalizeWhitespace(query).toLocaleLowerCase("zh-CN");

  return documents.filter(document => {
    if (category && category !== "all" && document.category !== category) return false;
    if (!normalizedQuery) return true;

    const searchableText = [document.title, document.summary, document.content]
      .join("\n")
      .toLocaleLowerCase("zh-CN");

    return searchableText.includes(normalizedQuery);
  });
}

export function resolveHandbookDocument(documents, slug, defaultSlug) {
  if (!documents.length) return null;

  return documents.find(document => document.slug === slug)
    ?? documents.find(document => document.slug === defaultSlug)
    ?? documents[0];
}

export function extractMarkdownHeadings(markdown) {
  const slugger = new GithubSlugger();
  const headings = [];
  const headingPattern = /^(#{2,3})\s+(.+?)\s*#*\s*$/gm;
  let match;

  while ((match = headingPattern.exec(String(markdown ?? ""))) !== null) {
    const title = cleanInlineMarkdown(match[2]);
    headings.push({
      level: match[1].length,
      title,
      id: slugger.slug(title)
    });
  }

  return headings;
}

export function removeMarkdownLead(markdown) {
  const original = String(markdown ?? "");
  const lines = original.split(/\r?\n/);
  let index = 0;

  while (index < lines.length && !lines[index].trim()) index += 1;
  if (!/^#\s+/.test(lines[index]?.trim() ?? "")) return original;

  index += 1;
  while (index < lines.length && !lines[index].trim()) index += 1;

  if (lines[index]?.trim() && !isMarkdownStructure(lines[index].trim())) {
    while (index < lines.length && lines[index].trim()) index += 1;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }

  return lines.slice(index).join("\n").trim();
}
