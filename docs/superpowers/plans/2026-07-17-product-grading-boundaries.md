# 产品分级 GMV 边界实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the annual GMV grading reference use explicit business intervals so exactly 600万元 remains in the 300–600万元 band and only values above 600万元 receive score 5.

**Architecture:** Keep monthly GMV normalization and the existing product grading model unchanged. Add one focused annual-GMV scoring function backed by explicit inclusive/exclusive interval metadata, then make the existing monthly suggestion function delegate to it. Lock the exact 30/100/300/600万元 boundaries with unit tests before rebuilding and deploying the existing Cloudflare Pages release.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, React/Vite build, Cloudflare Pages/Wrangler.

## Global Constraints

- Product level, risk level, and delivery route remain separate outputs.
- C2 risk does not contribute to the C1 resource investment score.
- High risk increases management intensity and does not lower product level.
- The exact annual-GMV intervals are `<30万`, `30万 ≤ GMV < 100万`, `100万 ≤ GMV < 300万`, `300万 ≤ GMV ≤ 600万`, and `GMV > 600万`.
- No historical product-state migration and no grading-modal layout changes.
- Do not change product-level thresholds, risk weights, risk bands, route mappings, or O-level rules.

---

## File Structure

- Modify `src/domain/productGmv.js`: own explicit annual-GMV band metadata, boundary matching, and monthly-to-annual suggestion conversion.
- Modify `react-tests/product-gmv.test.mjs`: lock annual-GMV boundaries and preserve monthly suggestion behavior.
- Modify generated Pages release assets only through `npm run release:pages`; do not hand-edit production bundles.

### Task 1: Explicit annual-GMV interval scoring

**Files:**
- Modify: `src/domain/productGmv.js:3-49`
- Test: `react-tests/product-gmv.test.mjs:1-24`

**Interfaces:**
- Consumes: `normalizeMonthlyGmvTarget(value) -> number | null` and the existing two-decimal `round2(value)` behavior.
- Produces: `scoreAnnualGmv(value) -> { annualGmv: number, score: number, label: string } | null`.
- Preserves: `suggestAnnualGmvScore(monthlyGmvTarget) -> { annualGmv: number, score: number, label: string } | null`.

- [ ] **Step 1: Write the failing boundary tests**

Update the import and add a dedicated test in `react-tests/product-gmv.test.mjs`:

```js
import {
  buildProductGmvProgress,
  normalizeMonthlyGmvTarget,
  scoreAnnualGmv,
  suggestAnnualGmvScore
} from "../src/domain/productGmv.js";

test("annual GMV grading uses the confirmed inclusive and exclusive boundaries", () => {
  assert.deepEqual(scoreAnnualGmv(299_999.99), { annualGmv: 299_999.99, score: 1, label: "＜30万" });
  assert.deepEqual(scoreAnnualGmv(300_000), { annualGmv: 300_000, score: 2, label: "30-100万" });
  assert.deepEqual(scoreAnnualGmv(1_000_000), { annualGmv: 1_000_000, score: 3, label: "100-300万" });
  assert.deepEqual(scoreAnnualGmv(3_000_000), { annualGmv: 3_000_000, score: 4, label: "300-600万" });
  assert.deepEqual(scoreAnnualGmv(5_999_999.99), { annualGmv: 5_999_999.99, score: 4, label: "300-600万" });
  assert.deepEqual(scoreAnnualGmv(6_000_000), { annualGmv: 6_000_000, score: 4, label: "300-600万" });
  assert.deepEqual(scoreAnnualGmv(6_000_000.01), { annualGmv: 6_000_000.01, score: 5, label: "＞600万" });
  assert.equal(scoreAnnualGmv(0), null);
  assert.equal(scoreAnnualGmv(-1), null);
  assert.equal(scoreAnnualGmv("not-a-number"), null);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
node --test react-tests/product-gmv.test.mjs
```

Expected: FAIL because `scoreAnnualGmv` is not exported.

- [ ] **Step 3: Implement explicit interval matching**

Replace the current max-only band table and update the suggestion function in `src/domain/productGmv.js`:

```js
const GMV_SCORE_BANDS = [
  { min: 0, minInclusive: false, max: 300_000, maxInclusive: false, score: 1, label: "＜30万" },
  { min: 300_000, minInclusive: true, max: 1_000_000, maxInclusive: false, score: 2, label: "30-100万" },
  { min: 1_000_000, minInclusive: true, max: 3_000_000, maxInclusive: false, score: 3, label: "100-300万" },
  { min: 3_000_000, minInclusive: true, max: 6_000_000, maxInclusive: true, score: 4, label: "300-600万" },
  { min: 6_000_000, minInclusive: false, max: Infinity, maxInclusive: false, score: 5, label: "＞600万" }
];

function matchesGmvBand(annualGmv, band) {
  const aboveMinimum = band.minInclusive ? annualGmv >= band.min : annualGmv > band.min;
  const belowMaximum = band.max === Infinity
    ? true
    : band.maxInclusive
      ? annualGmv <= band.max
      : annualGmv < band.max;
  return aboveMinimum && belowMaximum;
}

export function scoreAnnualGmv(value) {
  const annualGmv = round2(Number(value));
  if (!Number.isFinite(annualGmv) || annualGmv <= 0) return null;
  const band = GMV_SCORE_BANDS.find(item => matchesGmvBand(annualGmv, item));
  return band ? { annualGmv, score: band.score, label: band.label } : null;
}

export function suggestAnnualGmvScore(monthlyGmvTarget) {
  const monthly = normalizeMonthlyGmvTarget(monthlyGmvTarget);
  return monthly ? scoreAnnualGmv(monthly * 12) : null;
}
```

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run:

```bash
node --test react-tests/product-gmv.test.mjs
```

Expected: all tests in `react-tests/product-gmv.test.mjs` PASS.

- [ ] **Step 5: Run grading-focused regressions**

Run:

```bash
node --test react-tests/product-gmv.test.mjs react-tests/shared-state.test.mjs react-tests/react-app.test.mjs
```

Expected: all selected tests PASS, including the existing risk separation and three-output assertions.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/domain/productGmv.js react-tests/product-gmv.test.mjs
git commit -m "fix(grading): correct annual GMV boundaries"
```

### Task 2: Release verification and production deployment

**Files:**
- Modify: generated release files produced by `npm run release:pages`
- Verify: `package.json`, `CLOUDFLARE_PAGES.md`

**Interfaces:**
- Consumes: the passing implementation commit from Task 1.
- Produces: a pushed branch and `main` commit, a successful Cloudflare Pages production deployment, and verified public application availability.

- [ ] **Step 1: Run the full verification suite**

Run each command separately:

```bash
npm test
npm run lint
npm run check:governance
npm run audit:dependencies
```

Expected: all tests PASS, ESLint exits 0, governance exits 0, and npm reports no vulnerability at or above the configured threshold.

- [ ] **Step 2: Build the production Pages release**

Run:

```bash
npm run release:pages
```

Expected: Vite build and chunk validation PASS; generated Pages assets contain the updated GMV interval logic.

- [ ] **Step 3: Commit generated release assets if changed**

Inspect `git status --short`. If release files changed, stage only generated release files and commit:

```bash
git add cloudflare-entry.html assets
git commit -m "build: publish grading boundary fix"
```

If those paths are unchanged, do not create an empty commit.

- [ ] **Step 4: Push the tested branch and update main**

```bash
git push -u origin codex/product-grading-boundaries
git push origin HEAD:main
```

Expected: both pushes succeed without force.

- [ ] **Step 5: Deploy the production branch to Cloudflare Pages**

```bash
npx wrangler pages deploy . --project-name product-flow-system --branch main
```

Expected: Wrangler reports a successful deployment for `product-flow-system`.

- [ ] **Step 6: Verify the deployed version**

Run:

```bash
npx wrangler pages deployment list --project-name product-flow-system
```

Expected: the newest production deployment is successful and references the release commit produced above. Open `https://product-flow-system.pages.dev`, confirm the application loads, and verify the production asset contains `300-600万` with the inclusive 600万元 scoring behavior.

- [ ] **Step 7: Confirm the worktree is clean**

Run:

```bash
git status --short
```

Expected: no output.
