import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false }
  });
});

test.after(async () => {
  await vite.close();
});

async function loadModule(path) {
  return vite.ssrLoadModule(path);
}

test("shared button is safe inside forms and exposes a real loading state", async () => {
  const { Button } = await loadModule("/src/ui/Button.jsx");
  const idle = renderToStaticMarkup(React.createElement(Button, null, "保存"));
  const loading = renderToStaticMarkup(React.createElement(Button, {
    loading: true,
    loadingLabel: "正在保存"
  }, "保存"));

  assert.match(idle, /<button[^>]*type="button"[^>]*>保存<\/button>/);
  assert.match(loading, /<button[^>]*aria-busy="true"[^>]*>/);
  assert.match(loading, /<button[^>]*disabled=""[^>]*>/);
  assert.match(loading, />正在保存<\/button>/);
});

test("data overview exposes its core metrics and analysis areas as named regions", async () => {
  const { DataOverview } = await loadModule("/src/features/data-center/DataOverview.jsx");
  const metrics = [
    ["sales.net_sales", 120000],
    ["sales.quantity", 8000],
    ["sales.gross_profit", 60000],
    ["sales.refund_rate", 8],
    ["sales.gross_margin_rate", 50]
  ].map(([metricCode, value]) => ({
    metricCode,
    value,
    coverageRate: 1,
    from: "2026-07-01",
    to: "2026-07-07"
  }));
  const previous = metrics.map(item => ({ ...item, value: item.value * 0.9 }));
  const markup = renderToStaticMarkup(React.createElement(DataOverview, {
    factViews: {
      byDay: [{ date: "2026-07-01", sales: 120000, qty: 8000, grossProfit: 60000, platforms: [] }],
      trendByDay: [{ date: "2026-07-01", sales: 120000, qty: 8000, grossProfit: 60000, platforms: [] }],
      byPlatform: [{ platform: "抖店", sales: 120000 }]
    },
    range: { from: "2026-07-01", to: "2026-07-07" },
    setRange: () => {},
    metricResults: metrics,
    comparisonRange: { from: "2026-06-24", to: "2026-06-30" },
    comparisonResults: previous
  }));

  assert.match(markup, /role="region" aria-label="核心经营指标"/);
  assert.match(markup, /aria-labelledby="data-trend-title"/);
  assert.match(markup, /aria-labelledby="data-platform-title"/);
  assert.match(markup, />净销售额</);
  assert.match(markup, />经营趋势</);
});

test("workspace navigation exposes a named App rail and current App page navigation", async () => {
  const { WorkspaceNavigation } = await loadModule("/src/ui/WorkspaceNavigation.jsx");
  const Icon = () => React.createElement("span", { "aria-hidden": "true" });
  const markup = renderToStaticMarkup(React.createElement(WorkspaceNavigation, {
    groups: [
      { label: "公司经营", items: [["home", "公司首页", Icon]] },
      { label: "数据中心", items: [["data-overview", "数据总览", Icon], ["data-sync", "数据同步", Icon]] }
    ],
    activeScreen: "data-sync",
    onNavigate: () => {}
  }));

  assert.match(markup, /aria-label="业务 App"/);
  assert.match(markup, /aria-label="数据中心功能"/);
  assert.match(markup, /aria-current="page"[^>]*>[\s\S]*数据同步/);
  assert.doesNotMatch(markup, />公司首页<\/button>[\s\S]*>数据同步<\/button>/);
});

test("boss home and product overview lead with actionable summaries", () => {
  const home = new URL("../src/features/company/CompanyHomePage.jsx", import.meta.url);
  const dashboard = new URL("../src/features/dashboard/DashboardPage.jsx", import.meta.url);
  const homeSource = readFileSync(home, "utf8");
  const dashboardSource = readFileSync(dashboard, "utf8");

  assert.match(homeSource, /className="executive-pulse-grid"/);
  assert.match(homeSource, />待拍板</);
  assert.match(homeSource, />经营风险</);
  assert.match(homeSource, />产品待办</);
  assert.match(dashboardSource, /className="dashboard-action-grid"/);
  assert.ok(dashboardSource.indexOf('className="dashboard-action-grid"') < dashboardSource.indexOf('className="flow-summary"'));
  assert.match(dashboardSource, />需要处理</);
  assert.match(dashboardSource, />流程中的产品</);
});
