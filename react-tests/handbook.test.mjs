import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createHandbookDocument,
  extractMarkdownHeadings,
  filterHandbookDocuments,
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

test("handbook workspace exposes search, categories, and an empty state", async () => {
  const [pageSource, domainSource] = await Promise.all([
    readFile(new URL("../src/features/handbook/HandbookPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/domain/handbook.js", import.meta.url), "utf8")
  ]);
  const source = `${pageSource}\n${domainSource}`;

  assert.match(source, /搜索说明书/);
  assert.match(source, /员工使用手册/);
  assert.match(source, /产品与设计/);
  assert.match(source, /平台能力/);
  assert.match(source, /没有找到匹配的说明/);
  assert.match(source, /<MarkdownDocument/);
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
