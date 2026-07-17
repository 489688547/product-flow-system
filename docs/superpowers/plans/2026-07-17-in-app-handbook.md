# 应用内说明书实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated, searchable “说明书” workspace to both application sidebars and render the repository handbook, product, design, PRD/plan, and platform Markdown as the only content source.

**Architecture:** Keep Markdown in allowlisted repository directories, transform it into a build-time catalog inside a lazy-loaded handbook feature, and render it with safe Markdown defaults. Use pure domain helpers for filtering, slug resolution, deep links, and table-of-contents extraction. Keep handbook-specific layout in a feature CSS file so the existing global stylesheet does not continue growing.

**Tech Stack:** React 19 lazy/Suspense, Vite 7 raw Markdown imports and glob imports, react-markdown, remark-gfm, rehype-slug, github-slugger, JavaScript ES modules, Node test runner, existing OKLCH tokens.

## Global Constraints

- The handbook is visible to every authenticated company user in both navigation shells and remains unavailable before authentication.
- Markdown in `PRODUCT.md`, `DESIGN.md`, `docs/handbook`, `docs/product`, `docs/platform`, `docs/superpowers/specs`, and `docs/superpowers/plans` is the only displayed content source.
- Do not scan arbitrary repository files or enable raw HTML rendering.
- The handbook feature is lazy-loaded and must not add the Markdown renderer to the initial application chunk.
- Default document is `handbook/getting-started`; invalid slugs fall back safely and never read arbitrary paths.
- Support title, summary, and body search; category filters; empty results; stable deep links; and H2/H3 table of contents.
- Preserve the restrained product UI: no nested cards, decorative motion, gradient text, or oversized radii.
- Use the existing color, spacing, focus, radius, and typography tokens. Body text remains readable at WCAG AA contrast.
- Existing App navigation, explicit product navigation, authentication, and permission behavior must not regress.

---

### Task 1: Handbook domain and build-time catalog

**Files:**
- Create: `src/domain/handbook.js`
- Create: `src/features/handbook/handbookCatalog.js`
- Create: `react-tests/handbook.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `HANDBOOK_CATEGORIES`, `createHandbookDocument(entry)`, `filterHandbookDocuments(documents, options)`, `resolveHandbookDocument(documents, slug)`, and `extractMarkdownHeadings(markdown)`.
- Produces: `handbookDocuments` containing `{ slug, category, kind, title, summary, updatedAt, content }` and `DEFAULT_HANDBOOK_SLUG`.

- [x] **Step 1: Write failing pure domain tests**

Create tests for:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createHandbookDocument,
  extractMarkdownHeadings,
  filterHandbookDocuments,
  resolveHandbookDocument
} from "../src/domain/handbook.js";

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
  assert.deepEqual(filterHandbookDocuments(docs, { query: "钉钉" }).map(item => item.slug), ["handbook/getting-started"]);
  assert.deepEqual(filterHandbookDocuments(docs, { category: "platform" }).map(item => item.slug), ["platform/api-catalog"]);
});

test("invalid handbook slugs fall back to the requested default", () => {
  assert.equal(resolveHandbookDocument(docs, "missing", "handbook/getting-started").slug, "handbook/getting-started");
});

test("markdown table of contents uses stable unique H2 and H3 ids", () => {
  assert.deepEqual(extractMarkdownHeadings("## 登录\n### 权限\n## 登录"), [
    { level: 2, title: "登录", id: "登录" },
    { level: 3, title: "权限", id: "权限" },
    { level: 2, title: "登录", id: "登录-1" }
  ]);
});
```

- [x] **Step 2: Run the focused test and verify missing-module failure**

Run: `node --test react-tests/handbook.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/handbook.js`.

- [x] **Step 3: Install safe Markdown dependencies**

Run: `npm install react-markdown@^10.0.0 remark-gfm@^4.0.0 rehype-slug@^6.0.0 github-slugger@^2.0.0`

- [x] **Step 4: Implement the pure handbook domain**

Use `GithubSlugger` for heading IDs. Strip the first H1 from the summary search, choose the first non-heading non-list paragraph as summary, normalize whitespace, and compare search text with `toLocaleLowerCase("zh-CN")`. `resolveHandbookDocument` returns the matching slug, then the default slug, then the first document, or `null`.

- [x] **Step 5: Build the allowlisted Markdown catalog**

`handbookCatalog.js` explicitly imports `PRODUCT.md` and `DESIGN.md` with `?raw`, then uses `import.meta.glob` with eager raw imports only for:

```js
[
  "../../../docs/handbook/*.md",
  "../../../docs/product/*.md",
  "../../../docs/platform/*.md",
  "../../../docs/superpowers/specs/*.md",
  "../../../docs/superpowers/plans/*.md"
]
```

Map the paths to stable categories and slugs. Derive `updatedAt` from a leading `YYYY-MM-DD` filename when present, otherwise use `2026-07-17`. Sort by category order, kind order, then title. Export `DEFAULT_HANDBOOK_SLUG = "handbook/getting-started"`.

- [x] **Step 6: Run focused tests and production build**

Run: `node --test react-tests/handbook.test.mjs && npm run build`

Expected: domain tests pass and Vite resolves every allowlisted raw Markdown import.

- [x] **Step 7: Commit the domain and catalog**

```bash
git add src/domain/handbook.js src/features/handbook/handbookCatalog.js react-tests/handbook.test.mjs package.json package-lock.json
git commit -m "feat(handbook): build documentation catalog"
```

### Task 2: Safe Markdown document renderer and handbook workspace

**Files:**
- Create: `src/features/handbook/MarkdownDocument.jsx`
- Create: `src/features/handbook/HandbookPage.jsx`
- Create: `src/features/handbook/handbook.css`
- Modify: `react-tests/handbook.test.mjs`

**Interfaces:**
- Consumes: `handbookDocuments`, `DEFAULT_HANDBOOK_SLUG`, filtering/resolution/heading helpers.
- Produces: default export `HandbookPage({ selectedSlug, onSelectDocument })`.

- [x] **Step 1: Add failing source-contract tests**

Assert that the page contains search label `搜索说明书`, category labels `员工使用手册`, `产品与设计`, `平台能力`, empty copy `没有找到匹配的说明`, and renders `MarkdownDocument`. Assert the renderer imports `react-markdown`, `remark-gfm`, and `rehype-slug`, does not import `rehype-raw`, gives external links `target="_blank"`, and renders table wrappers.

- [x] **Step 2: Run the focused test and verify missing component files**

Run: `node --test react-tests/handbook.test.mjs`

Expected: FAIL because `HandbookPage.jsx` and `MarkdownDocument.jsx` do not exist.

- [x] **Step 3: Implement `MarkdownDocument`**

Render Markdown with GFM and heading IDs. Override links so internal `#heading` links stay in the page and HTTP links receive `target="_blank" rel="noreferrer"`. Wrap tables in `.handbook-table-wrap`, keep code blocks horizontally scrollable, and do not enable raw HTML.

- [x] **Step 4: Implement the three-column handbook page**

State contains `query` and `category`, while selected document remains controlled by the route. The page must:

- Render a page header and concise description.
- Render an accessible search input with clear button.
- Render category filter buttons with `aria-pressed`.
- Group filtered documents by category in the left column.
- Resolve invalid selected slugs to the default and notify `onSelectDocument` only from user selection.
- Render title, summary, kind label, updated date, Markdown body, and H2/H3 table of contents.
- Render an instructional empty state when no result matches.

- [x] **Step 5: Add restrained responsive CSS**

Use `grid-template-columns: minmax(210px, 250px) minmax(0, 1fr) minmax(150px, 190px)`, existing tokens, full dividers rather than nested cards, 65-75ch article text, stable tables, visible focus, and sticky directory/TOC only when height permits. At 1180px hide the right TOC; at 820px use one column and make the document list horizontally scrollable. Respect `prefers-reduced-motion`.

- [x] **Step 6: Run focused test and lint**

Run: `node --test react-tests/handbook.test.mjs && npm run lint`

Expected: focused tests pass and ESLint exits 0.

- [x] **Step 7: Commit the handbook workspace**

```bash
git add src/features/handbook react-tests/handbook.test.mjs
git commit -m "feat(handbook): add searchable document workspace"
```

### Task 3: Deep-link route helpers and sidebar integration

**Files:**
- Create: `src/domain/appNavigation.js`
- Modify: `src/App.jsx`
- Modify: `src/domain/permissions.js`
- Modify: `react-tests/handbook.test.mjs`

**Interfaces:**
- Produces: `parseAppHash(hash) -> { screen, detail }` and `formatAppHash(screen, detail) -> string`.
- Consumes: lazy default export from `HandbookPage.jsx`.

- [x] **Step 1: Add failing route and navigation tests**

Test round trips for `#handbook/platform/api-catalog`, percent-encoded Chinese segments, and empty hashes. Source assertions require `BookOpenText`, a `handbook` item in both `COMPANY_NAV` and `PRODUCT_NAV`, `lazy(() => import("./features/handbook/HandbookPage.jsx"))`, a Suspense fallback, and `if (key === "handbook") return Boolean(user);` in permissions.

- [x] **Step 2: Run the focused test and verify missing route helper**

Run: `node --test react-tests/handbook.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/appNavigation.js`.

- [x] **Step 3: Implement pure hash parsing and formatting**

Split the hash into encoded path segments, decode each safely, and never throw on malformed encoding. `formatAppHash` encodes each detail segment separately so slash-delimited handbook slugs remain readable and stable.

- [x] **Step 4: Integrate lazy handbook navigation into App**

- Add `handbook` to company “平台” group and product navigation before issue feedback.
- Keep screen validation against existing navigation and hidden screens.
- Track route detail on `hashchange` and pass it as `selectedSlug`.
- `onSelectDocument(slug)` updates `#handbook/<slug>` without remounting unrelated providers.
- Render a lightweight page skeleton inside Suspense.
- Preserve existing `navigate`, product progress focus, and default screen behavior.

- [x] **Step 5: Make handbook navigation unconditionally visible after login**

Return `Boolean(user)` for `key === "handbook"` before configurable navigation rules. Do not add handbook to the permission-settings matrix because employees must not accidentally lose access to company instructions.

- [x] **Step 6: Run handbook, app, and access tests**

Run: `node --test react-tests/handbook.test.mjs react-tests/react-app.test.mjs react-tests/company-access-gate.test.mjs`

Expected: all selected tests pass, 0 fail.

- [x] **Step 7: Commit navigation integration**

```bash
git add src/domain/appNavigation.js src/App.jsx src/domain/permissions.js react-tests/handbook.test.mjs
git commit -m "feat(handbook): add sidebar entry and deep links"
```

### Task 4: Production verification and visual audit

**Files:**
- Modify only handbook or route files if verification exposes a defect.

**Interfaces:**
- Consumes: Complete handbook feature.
- Produces: Test, build, responsive, accessibility, and lazy-chunk evidence.

- [x] **Step 1: Run every repository gate**

Run: `npm run lint && npm run check:governance && npm test && npm run build`

Expected: all commands exit 0.

- [x] **Step 2: Verify code splitting from build output**

Inspect `dist/assets` and confirm a separate handbook JavaScript chunk contains Markdown renderer code while the primary entry remains separate.

- [x] **Step 3: Start local preview and inspect real UI**

Run: `npm run dev`

Open `http://127.0.0.1:8132/#handbook/handbook/getting-started` and verify:

- Company sidebar displays “说明书” in the platform group.
- Search, category filters, document switching, deep links, external links, tables, code, and TOC work.
- Keyboard focus is visible and directory buttons are reachable in order.
- Empty search explains how to recover.
- Invalid slug safely shows the getting-started document.

- [x] **Step 4: Audit laptop and narrow widths**

Check approximately 1440px, 1180px, 820px, and 390px widths. Confirm no clipped sidebar, heading, table, search control, or document navigation; right TOC hides at 1180px and the document directory becomes compact at 820px.

- [x] **Step 5: Inspect final diff and commits**

Run: `git status --short && git diff --check && git log -10 --oneline`

Expected: worktree clean, no whitespace errors, task commits are focused, and unrelated main-worktree files were not touched.
