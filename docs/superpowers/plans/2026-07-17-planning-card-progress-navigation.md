# 产品规划卡片跳转产品进度实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each initiated product card in the planning tray open that product's progress page while preserving the card's planning action.

**Architecture:** Reuse the existing `App.openProgress(productId)` navigation boundary. Pass it through `ProductPlanningPage` to `PlanningDemandTray`, where cards with a `productId` receive pointer and keyboard activation while the nested planning button stops propagation.

**Tech Stack:** React 19, Vite, Node test runner, existing CSS design tokens.

## Global Constraints

- Only cards with a non-empty `productId` navigate to product progress.
- Card activation must work with pointer, Enter, and Space.
- The nested calendar button must continue opening the planning modal without navigating.
- Do not change demand records, product records, or planning persistence.

---

### Task 1: Wire planning cards to explicit product progress navigation

**Files:**
- Modify: `react-tests/react-app.test.mjs`
- Modify: `src/App.jsx`
- Modify: `src/features/planning/ProductPlanningPage.jsx`
- Modify: `src/features/planning/PlanningDemandTray.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `App.openProgress(productId, stage?)` from the existing application shell.
- Produces: `ProductPlanningPage({ onOpenProgress })` and `PlanningDemandTray({ demands, currentUser, canEdit, onArrange, onOpenProgress })`.

- [ ] **Step 1: Write the failing source-contract test**

Add this focused test to `react-tests/react-app.test.mjs`:

```js
test("initiated planning cards open product progress without hijacking the arrange action", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/planning/ProductPlanningPage.jsx");
  const tray = read("src/features/planning/PlanningDemandTray.jsx");
  const styles = read("src/styles.css");

  assert.match(app, /<ProductPlanningPage onOpenProgress=\{openProgress\}/);
  assert.match(page, /onOpenProgress=\{onOpenProgress\}/);
  assert.match(tray, /onOpenProgress\?\.\(demand\.productId\)/);
  assert.match(tray, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(tray, /event\.stopPropagation\(\)/);
  assert.match(styles, /\.planning-demand-chip\.is-progress-link/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test --test-name-pattern="initiated planning cards" react-tests/react-app.test.mjs
```

Expected: FAIL because `ProductPlanningPage` does not yet receive `onOpenProgress`.

- [ ] **Step 3: Pass the existing navigation callback through the component tree**

In `src/App.jsx`, render:

```jsx
planning: <ProductPlanningPage onOpenProgress={openProgress} />,
```

In `src/features/planning/ProductPlanningPage.jsx`, replace the component signature:

```jsx
export function ProductPlanningPage({ onOpenProgress }) {
}
```

Replace the current one-line tray render with:

```jsx
<PlanningDemandTray
  demands={candidates}
  currentUser={currentUser}
  canEdit={canEdit}
  onArrange={openNewPlan}
  onOpenProgress={onOpenProgress}
/>
```

- [ ] **Step 4: Add accessible card activation and preserve the arrange button**

In `src/features/planning/PlanningDemandTray.jsx`, derive `canOpenProgress` for each demand and add only the interaction needed by initiated products:

```jsx
const canOpenProgress = Boolean(demand.productId);

<article
  className={`planning-demand-chip ${canEdit ? "is-draggable" : ""} ${canOpenProgress ? "is-progress-link" : ""}`}
  role={canOpenProgress ? "link" : undefined}
  tabIndex={canOpenProgress ? 0 : undefined}
  onClick={() => {
    if (canOpenProgress) onOpenProgress?.(demand.productId);
  }}
  onKeyDown={event => {
    if (!canOpenProgress || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onOpenProgress?.(demand.productId);
  }}
>
  {/* existing product content */}
  <Button
    className="compact planning-arrange-button"
    onClick={event => {
      event.stopPropagation();
      onArrange(demand);
    }}
  >
    <CalendarPlus size={15} aria-hidden="true" />安排
  </Button>
</article>
```

Keep the existing drag handler, disabled state, and disabled reason unchanged.

- [ ] **Step 5: Add focus and pointer affordances using existing tokens**

Add to `src/styles.css` beside the existing planning tray styles:

```css
.planning-demand-chip.is-progress-link {
  cursor: pointer;
}

.planning-demand-chip.is-progress-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Run focused and full automated verification**

Run:

```bash
node --test --test-name-pattern="initiated planning cards" react-tests/react-app.test.mjs
npm test
npm run build
```

Expected: the focused test passes, all React and API tests pass, and the Vite production build exits 0.

- [ ] **Step 7: Verify behavior in the browser**

Start the local preview, then confirm:

1. Clicking an initiated product card changes the hash to `#progress` and keeps that product selected.
2. Focusing the card and pressing Enter or Space performs the same jump.
3. Clicking the calendar button opens the planning modal and leaves the page on `#planning`.
4. A candidate without `productId` has no link role, no tab stop, and no progress navigation.

- [ ] **Step 8: Commit the implementation**

```bash
git add react-tests/react-app.test.mjs src/App.jsx src/features/planning/ProductPlanningPage.jsx src/features/planning/PlanningDemandTray.jsx src/styles.css
git commit -m "feat(planning): open product progress from cards"
```
