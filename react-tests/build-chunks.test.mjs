import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_CHUNK_BYTES,
  findOversizedChunks,
  manualChunks
} from "../scripts/build-chunks.mjs";

test("build chunk policy separates heavy shared runtimes", () => {
  assert.equal(manualChunks("/repo/node_modules/react-dom/client.js"), "react-vendor");
  assert.equal(manualChunks("/repo/node_modules/react/index.js"), "react-vendor");
  assert.equal(manualChunks("/repo/node_modules/react-markdown/index.js"), "markdown-vendor");
  assert.equal(manualChunks("/repo/node_modules/remark-gfm/index.js"), "markdown-vendor");
  assert.equal(manualChunks("/repo/src/App.jsx"), undefined);
});

test("build chunk policy reports JavaScript files above 500 KB", () => {
  assert.equal(MAX_CHUNK_BYTES, 500_000);
  assert.deepEqual(
    findOversizedChunks([
      { name: "within-budget.js", size: MAX_CHUNK_BYTES },
      { name: "too-large.js", size: MAX_CHUNK_BYTES + 1 },
      { name: "large-source-map.js.map", size: MAX_CHUNK_BYTES + 1 }
    ]),
    [{ name: "too-large.js", size: MAX_CHUNK_BYTES + 1 }]
  );
});

test("Vite build applies and enforces the shared 500 KB chunk policy", async () => {
  const { default: config } = await import("../vite.config.js");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(config.build.chunkSizeWarningLimit, 500);
  assert.equal(
    config.build.rollupOptions.output.manualChunks("/repo/node_modules/react-dom/client.js"),
    "react-vendor"
  );
  assert.equal(pkg.scripts.build, "vite build && node scripts/check-build-chunks.mjs");
});

test("application pages load through route-level dynamic imports", () => {
  const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const deferredPages = [
    "archive/ProductArchivePage.jsx",
    "dashboard/DashboardPage.jsx",
    "demands/DemandPoolPage.jsx",
    "issues/IssuePage.jsx",
    "packages/PackagePage.jsx",
    "progress/ProductProgressPage.jsx",
    "settings/SettingsPage.jsx",
    "planning/ProductPlanningPage.jsx",
    "company/CompanyHomePage.jsx",
    "strategy/StrategyCenterPage.jsx",
    "projects/KeyProjectsPage.jsx",
    "reviews/OperatingReviewPage.jsx",
    "platform/AppCenterPage.jsx",
    "incentives/IncentiveProjectsPage.jsx",
    "handbook/HandbookPage.jsx"
  ];
  for (const page of deferredPages) {
    assert.match(appSource, new RegExp(`import\\("\\./features/${page.replaceAll(".", "\\.")}\\"\\)`));
  }
  assert.match(appSource, /const lazyNamed =/);
  assert.doesNotMatch(appSource, /import \{ ProductArchivePage \} from/);
  assert.match(appSource, /<Suspense fallback=.*pages\[activeScreen\]/s);
});
