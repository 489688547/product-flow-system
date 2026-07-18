import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

import {
  createHandbookDocument,
  extractMarkdownHeadings,
  filterHandbookDocuments,
  removeMarkdownLead,
  resolveHandbookDocument
} from "../src/domain/handbook.js";
import { formatAppHash, parseAppHash } from "../src/domain/appNavigation.js";

const docs = [
  createHandbookDocument({
    slug: "handbook/getting-started",
    category: "handbook",
    kind: "guide",
    updatedAt: "2026-07-17",
    content: "# 开始使用\n\n员工登录与导航说明。\n\n## 登录\n\n使用钉钉登录。"
  }),
  createHandbookDocument({
    slug: "platform/api-catalog",
    category: "platform",
    kind: "platform",
    updatedAt: "2026-07-17",
    content: "# API 目录\n\n共享状态接口。"
  })
];

test("handbook documents derive titles and summaries from markdown", () => {
  assert.equal(docs[0].title, "开始使用");
  assert.equal(docs[0].summary, "员工登录与导航说明。");
});

test("handbook search covers title summary and body with category filtering", () => {
  assert.deepEqual(
    filterHandbookDocuments(docs, { query: "钉钉" }).map(item => item.slug),
    ["handbook/getting-started"]
  );
  assert.deepEqual(
    filterHandbookDocuments(docs, { category: "platform" }).map(item => item.slug),
    ["platform/api-catalog"]
  );
});

test("invalid handbook slugs fall back to the requested default", () => {
  assert.equal(
    resolveHandbookDocument(docs, "missing", "handbook/getting-started").slug,
    "handbook/getting-started"
  );
});

test("markdown table of contents uses stable unique H2 and H3 ids", () => {
  assert.deepEqual(extractMarkdownHeadings("## 登录\n### 权限\n## 登录"), [
    { level: 2, title: "登录", id: "登录" },
    { level: 3, title: "权限", id: "权限" },
    { level: 2, title: "登录", id: "登录-1" }
  ]);
});

test("rendered handbook bodies omit the title and already displayed summary", () => {
  assert.equal(
    removeMarkdownLead("# 开始使用\n\n这是摘要第一行，\n这是摘要第二行。\n\n## 登录\n\n使用钉钉登录。"),
    "## 登录\n\n使用钉钉登录。"
  );
});

test("handbook workspace exposes search, categories, and an empty state", async () => {
  const [pageSource, domainSource] = await Promise.all([
    readFile(new URL("../src/features/handbook/HandbookPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/domain/handbook.js", import.meta.url), "utf8")
  ]);
  const source = `${pageSource}\n${domainSource}`;

  assert.match(source, /搜索说明书/);
  assert.match(source, /使用手册/);
  assert.match(source, /产品与设计/);
  assert.match(source, /平台能力/);
  assert.doesNotMatch(source, /员工使用手册/);
  assert.doesNotMatch(source, /label: "全部"/);
  assert.match(pageSource, /activeDocument\?\.category \?\? "handbook"/);
  assert.match(source, /没有找到匹配的说明/);
  assert.match(source, /<MarkdownDocument/);
});

test("product and design navigation uses readable Chinese headings", async () => {
  const root = new URL("../", import.meta.url);
  const planDirectory = new URL("../docs/superpowers/plans/", import.meta.url);
  const planFiles = (await readdir(planDirectory)).filter(file => file.endsWith(".md"));
  const contents = await Promise.all([
    readFile(new URL("PRODUCT.md", root), "utf8"),
    readFile(new URL("DESIGN.md", root), "utf8"),
    ...planFiles.map(file => readFile(new URL(file, planDirectory), "utf8"))
  ]);

  for (const content of contents) {
    const title = content.match(/^#\s+(.+)$/m)?.[1] ?? "";
    const readableTitle = title.replace(/\b(?:API|D1|GMV)\b/g, "");
    assert.doesNotMatch(readableTitle, /[A-Za-z]{2,}/, `英文标题未中文化：${title}`);
  }

  for (const content of contents.slice(0, 2)) {
    const headings = [...content.matchAll(/^#{1,3}\s+(.+)$/gm)].map(match => match[1]);
    assert.equal(headings.some(heading => /[A-Za-z]{2,}/.test(heading)), false);
  }
});

test("product and design catalog excludes agent-only implementation plans", async () => {
  const source = await readFile(
    new URL("../src/features/handbook/handbookCatalog.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /docs\/superpowers\/specs\/\*\.md/);
  assert.doesNotMatch(source, /docs\/superpowers\/plans\/\*\.md/);
});

test("markdown renderer keeps repository documents safe and usable", async () => {
  const source = await readFile(
    new URL("../src/features/handbook/MarkdownDocument.jsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /from "react-markdown"/);
  assert.match(source, /from "remark-gfm"/);
  assert.match(source, /from "rehype-slug"/);
  assert.doesNotMatch(source, /rehype-raw/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
  assert.match(source, /handbook-table-wrap/);
});

test("application hash routes preserve handbook document slugs", () => {
  assert.deepEqual(parseAppHash("#handbook/platform/api-catalog"), {
    screen: "handbook",
    detail: "platform/api-catalog"
  });
  assert.equal(
    formatAppHash("handbook", "产品与设计/接口 目录"),
    "#handbook/%E4%BA%A7%E5%93%81%E4%B8%8E%E8%AE%BE%E8%AE%A1/%E6%8E%A5%E5%8F%A3%20%E7%9B%AE%E5%BD%95"
  );
  assert.deepEqual(parseAppHash(""), { screen: "", detail: "" });
  assert.doesNotThrow(() => parseAppHash("#handbook/%E0%A4%A"));
});

test("both application shells expose a lazy authenticated handbook route", async () => {
  const [appSource, permissionSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/domain/permissions.js", import.meta.url), "utf8")
  ]);

  assert.match(appSource, /BookOpenText/);
  assert.equal((appSource.match(/\["handbook", "说明书", BookOpenText/g) ?? []).length, 2);
  assert.match(appSource, /lazy\(\(\) => import\("\.\/features\/handbook\/HandbookPage\.jsx"\)\)/);
  assert.match(appSource, /<Suspense fallback=/);
  assert.match(appSource, /selectedSlug=/);
  assert.match(permissionSource, /if \(key === "handbook"\) return Boolean\(user\);/);
});

test("compact handbook layout scrolls documents by category", async () => {
  const source = await readFile(
    new URL("../src/features/handbook/handbook.css", import.meta.url),
    "utf8"
  );

  assert.match(source, /@media \(max-width: 820px\)[\s\S]*\.handbook-document-list\s*\{[\s\S]*display: flex;/);
  assert.match(source, /@media \(max-width: 820px\)[\s\S]*\.handbook-document-list button\s*\{[\s\S]*flex: 0 0 190px;/);
});
