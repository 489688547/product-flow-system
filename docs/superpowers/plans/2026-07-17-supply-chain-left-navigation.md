# Supply Chain Left Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the supply chain App's top workspace tabs with a page-internal secondary left navigation that follows the existing product lifecycle shell.

**Architecture:** Keep section selection and business permissions in `SupplyChainAppPage`. Extract a presentation-only navigation component that renders grouped items, then place it beside a flexible content region. CSS owns the desktop two-column layout and collapses the same navigation to a horizontally scrollable strip below 900px.

**Tech Stack:** React 19, Lucide React, plain CSS design tokens, Node test runner, Vite.

## Global Constraints

- Keep the system-wide primary sidebar unchanged.
- Do not change supply chain data, permissions, DingTalk approval, ERP, Kuaimai, or quality sync behavior.
- Reuse the current system font, spacing tokens, blue selected state, control radii, and focus treatment.
- At desktop and laptop widths, render a 176px secondary left navigation and a flexible content region.
- At widths below 900px, render the secondary navigation as a horizontally scrollable strip and hide group headings.
- Prevent document-level horizontal overflow; tables continue to scroll only inside their own containers.
- Do not deploy as part of this plan.

---

### Task 1: Grouped supply chain secondary navigation

**Files:**
- Create: `src/features/supply-chain/SupplyChainSectionNav.jsx`
- Modify: `src/features/supply-chain/SupplyChainAppPage.jsx`
- Test: `react-tests/supply-chain-ui.test.mjs`

**Interfaces:**
- Consumes: `section: string`, `onChange(nextSection: string): void`.
- Produces: `SupplyChainSectionNav({ section, onChange })`, grouped navigation with `aria-current="page"` on the selected item.
- Preserves: the existing section keys `overview`, `suppliers`, `approvals`, `products`, `inventory`, `quality`, `records`, and `settings`.

- [ ] **Step 1: Write the failing navigation structure tests**

Add `existsSync` to the `node:fs` import and add these tests to `react-tests/supply-chain-ui.test.mjs`:

```js
test("supply chain App uses a page-internal secondary navigation", () => {
  const page = read("src/features/supply-chain/SupplyChainAppPage.jsx");
  assert.match(page, /SupplyChainSectionNav/);
  assert.match(page, /className="supply-chain-layout"/);
  assert.match(page, /className="supply-chain-content"/);
  assert.doesNotMatch(page, /<nav className="supply-chain-nav"/);
});

test("supply chain secondary navigation groups daily work and configuration", () => {
  const navPath = new URL("../src/features/supply-chain/SupplyChainSectionNav.jsx", import.meta.url);
  assert.equal(existsSync(navPath), true);
  const nav = read("src/features/supply-chain/SupplyChainSectionNav.jsx");
  assert.match(nav, /日常业务/);
  assert.match(nav, /数据与配置/);
  assert.match(nav, /aria-current=\{section === key \? "page" : undefined\}/);
  for (const key of ["overview", "suppliers", "approvals", "products", "inventory", "quality", "records", "settings"]) {
    assert.match(nav, new RegExp(`"${key}"`));
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test react-tests/supply-chain-ui.test.mjs
```

Expected: FAIL because `SupplyChainSectionNav`, `supply-chain-layout`, and `supply-chain-content` do not exist yet.

- [ ] **Step 3: Create the presentation-only navigation component**

Create `src/features/supply-chain/SupplyChainSectionNav.jsx`:

```jsx
import {
  Boxes,
  Building2,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck
} from "lucide-react";

const SECTION_GROUPS = [
  {
    label: "日常业务",
    items: [
      ["overview", "供应链总览", LayoutDashboard],
      ["suppliers", "供应商管理", Building2],
      ["approvals", "采购与付款", ClipboardCheck],
      ["products", "产品供应链", PackageSearch],
      ["inventory", "库存盘点", Boxes],
      ["quality", "质量管理", ShieldCheck]
    ]
  },
  {
    label: "数据与配置",
    items: [
      ["records", "同步记录", FileClock],
      ["settings", "设置", Settings]
    ]
  }
];

export function SupplyChainSectionNav({ section, onChange }) {
  return (
    <nav className="supply-chain-section-nav" aria-label="供应链管理二级导航">
      {SECTION_GROUPS.map(group => (
        <div className="supply-chain-nav-group" key={group.label}>
          <span className="supply-chain-nav-label">{group.label}</span>
          {group.items.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              className={section === key ? "active" : ""}
              aria-current={section === key ? "page" : undefined}
              onClick={() => onChange(key)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Wire the navigation into the supply chain page**

In `src/features/supply-chain/SupplyChainAppPage.jsx`:

1. Remove the eight navigation icons and `SECTIONS` from the page file; keep `ArrowLeft`.
2. Import `SupplyChainSectionNav`.
3. Replace the top navigation and loose content with:

```jsx
<div className="supply-chain-layout">
  <SupplyChainSectionNav section={section} onChange={setSection} />
  <div className="supply-chain-content">
    {error ? <p className="supply-message error" role="alert">{error}</p> : null}
    {loading
      ? <div className="supply-loading" aria-label="正在加载供应链数据"><span /><span /><span /></div>
      : content[section]}
  </div>
</div>
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
node --test react-tests/supply-chain-ui.test.mjs
```

Expected: all supply-chain UI tests PASS.

- [ ] **Step 6: Commit the component change**

```bash
git add react-tests/supply-chain-ui.test.mjs src/features/supply-chain/SupplyChainAppPage.jsx src/features/supply-chain/SupplyChainSectionNav.jsx
git commit -m "feat(supply): add section side navigation"
```

---

### Task 2: Product-lifecycle-aligned layout and responsive behavior

**Files:**
- Modify: `src/styles.css`
- Test: `react-tests/supply-chain-ui.test.mjs`

**Interfaces:**
- Consumes: `.supply-chain-layout`, `.supply-chain-section-nav`, `.supply-chain-nav-group`, `.supply-chain-nav-label`, and `.supply-chain-content` from Task 1.
- Produces: desktop two-column layout and mobile horizontal navigation without changing workspace component CSS.

- [ ] **Step 1: Write the failing layout tests**

Replace the navigation assertions in `supply chain workbench has stable responsive structure` with:

```js
assert.match(css, /\.supply-chain-layout\s*\{[^}]*grid-template-columns:\s*176px minmax\(0, 1fr\)/);
assert.match(css, /\.supply-chain-section-nav\s*\{/);
assert.match(css, /\.supply-chain-section-nav button\.active::before/);
assert.match(css, /\.supply-chain-content\s*\{[^}]*min-width:\s*0/);
assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.supply-chain-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.supply-chain-nav-label\s*\{[^}]*display:\s*none/);
assert.match(css, /\.supply-chain-section-nav button:focus-visible/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test react-tests/supply-chain-ui.test.mjs
```

Expected: FAIL because the new layout selectors have no styles.

- [ ] **Step 3: Implement the desktop two-column layout**

Replace the old `.supply-chain-nav` rules in `src/styles.css` with:

```css
.supply-chain-layout {
  min-width: 0;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  align-items: start;
  gap: var(--space-4);
}
.supply-chain-section-nav {
  min-width: 0;
  padding: var(--space-2);
  display: grid;
  gap: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  background: var(--surface);
}
.supply-chain-nav-group { min-width: 0; display: grid; gap: 2px; }
.supply-chain-nav-label {
  min-height: 26px;
  padding: 7px 9px 3px;
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 750;
}
.supply-chain-section-nav button {
  position: relative;
  width: 100%;
  min-height: 36px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  white-space: nowrap;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}
.supply-chain-section-nav button::before {
  content: "";
  position: absolute;
  left: 0;
  width: 3px;
  height: 16px;
  border-radius: 3px;
  background: transparent;
}
.supply-chain-section-nav button:hover { background: var(--surface-hover); color: var(--text-primary); }
.supply-chain-section-nav button.active { background: var(--primary-soft); color: var(--primary); font-weight: 650; }
.supply-chain-section-nav button.active::before { background: var(--primary); }
.supply-chain-section-nav button:focus-visible { outline: 2px solid color-mix(in oklch, var(--primary), white 28%); outline-offset: 1px; }
.supply-chain-content { min-width: 0; }
```

- [ ] **Step 4: Implement the below-900px horizontal navigation**

Inside the existing `@media (max-width: 900px)` block, replace the old `.supply-chain-nav` rules with:

```css
.supply-chain-layout { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
.supply-chain-section-nav {
  margin-left: calc(var(--space-4) * -1);
  margin-right: calc(var(--space-4) * -1);
  padding: var(--space-1) var(--space-4);
  display: flex;
  gap: var(--space-1);
  overflow-x: auto;
  border-left: 0;
  border-right: 0;
  border-radius: 0;
}
.supply-chain-nav-group { display: contents; }
.supply-chain-nav-label { display: none; }
.supply-chain-section-nav button { width: auto; min-width: max-content; }
.supply-chain-section-nav button::before {
  left: 50%;
  bottom: 0;
  width: 16px;
  height: 3px;
  transform: translateX(-50%);
}
```

Update the reduced-motion selector from `.supply-chain-nav button` to `.supply-chain-section-nav button`.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
node --test react-tests/supply-chain-ui.test.mjs
npm test
npm run build
git diff --check
```

Expected: all supply-chain UI tests PASS, all React and API tests PASS, Vite production build succeeds, and `git diff --check` prints no errors.

- [ ] **Step 6: Verify the running UI in the browser**

Open `http://127.0.0.1:8134/#supply-chain` and verify:

1. At 1440px, the global sidebar, 176px supply chain navigation, and main content are distinct.
2. At 1024px, the secondary navigation remains usable and the content region does not create document-level horizontal overflow.
3. At 390px, group headings disappear, the navigation scrolls horizontally, and the document width equals the viewport width.
4. Each of the eight navigation items switches to the correct workspace.
5. The selected item exposes `aria-current="page"` and keyboard focus remains visible.
6. Browser error logs are empty.

- [ ] **Step 7: Commit the responsive layout**

```bash
git add react-tests/supply-chain-ui.test.mjs src/styles.css
git commit -m "style(supply): align navigation with product shell"
```

