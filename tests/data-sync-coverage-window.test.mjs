import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const domain = await readFile(new URL("../src/domain/dataCenter.js", import.meta.url), "utf8");
const server = await readFile(new URL("../functions/api/data-center/sales.js", import.meta.url), "utf8");
const workspace = await readFile(
  new URL("../src/features/data-center/DataGovernanceWorkspaces.jsx", import.meta.url),
  "utf8"
);

function windowOf(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  assert.ok(match, `未找到 ${name}`);
  return Number(match[1]);
}

test("事实窗口必须覆盖同步覆盖的判定窗口", () => {
  // 覆盖判定按 14 天逐日检查，事实却曾只截最近 8 天，缺的 6 天被当成「数据缺失」
  // 误报：2026-07-30 页面报 07-16 至 07-21 六天缺失，实际每天都有 520~553 行、
  // 13~15 万元。误报比漏报更糟——它让人反复去补根本不缺的数据，真问题被淹没。
    // 常量已收敛到 src/domain/dataCenter.js，服务端 SQL、前端取数与覆盖判定共用它。
  // 曾经服务端 SQL 写 LIMIT 8、前端又各写一遍，改了前端仍然误报——两处各写就会漂。
  const facts = windowOf(domain, "DAILY_FACTS_WINDOW_DAYS");
  const coverage = facts;
  assert.match(workspace, /COVERAGE_WINDOW_DAYS = DAILY_FACTS_WINDOW_DAYS/);
  assert.match(server, /LIMIT \$\{DAILY_FACTS_WINDOW_DAYS\}/);
  assert.ok(
    facts >= coverage,
    `事实窗口 ${facts} 天不足以支撑 ${coverage} 天的覆盖判定，缺的天会被误报为数据缺失`
  );
});
