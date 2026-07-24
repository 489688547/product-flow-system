import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appSource = readFileSync(resolve("src/App.jsx"), "utf8");

function navBlock(name, nextMarker) {
  const start = appSource.indexOf(`const ${name} = [`);
  const end = appSource.indexOf(nextMarker, start);
  return appSource.slice(start, end);
}

test("development backlog appears after handbook and before issues in both shells", () => {
  for (const block of [
    navBlock("COMPANY_NAV", "const PRODUCT_NAV = ["),
    navBlock("PRODUCT_NAV", "const HIDDEN_SCREENS = new Set")
  ]) {
    assert.match(block, /\["handbook", "说明书"[\s\S]*\["development-backlog", "研发待办"[\s\S]*\["issues", "问题反馈"/);
  }
  assert.match(appSource, /const DevelopmentBacklogPage = lazyNamed/);
  assert.match(appSource, /"development-backlog": <DevelopmentBacklogPage/);
});

test("backlog page separates editable filters from applied query and exposes explicit refresh", () => {
  const path = resolve("src/features/development-backlog/DevelopmentBacklogPage.jsx");
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, "utf8");
  assert.match(source, /filterDraft/);
  assert.match(source, /appliedFilters/);
  assert.match(source, />查询</);
  assert.match(source, />刷新</);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{[\s\S]{0,300}filterDraft/);
});

test("backlog page includes accessible loading empty error conflict and responsive result states", () => {
  const page = readFileSync(resolve("src/features/development-backlog/DevelopmentBacklogPage.jsx"), "utf8");
  const table = readFileSync(resolve("src/features/development-backlog/DevelopmentBacklogTable.jsx"), "utf8");
  const css = readFileSync(resolve("src/features/development-backlog/development-backlog.css"), "utf8");
  assert.match(page, /aria-busy/);
  assert.match(page, /role="alert"/);
  assert.match(page, /暂无研发待办/);
  assert.match(table, /BACKLOG_STATUS_LABELS/);
  assert.match(table, /conflicts/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /focus-visible/);
});

test("AI intake routes configuration errors and keeps retryable failures in place", () => {
  const page = readFileSync(resolve("src/features/development-backlog/DevelopmentBacklogPage.jsx"), "utf8");
  const editor = readFileSync(resolve("src/features/development-backlog/DevelopmentBacklogEditor.jsx"), "utf8");
  assert.match(page, /isAiConfigurationError/);
  assert.match(page, /sessionStorage\.setItem\(BACKLOG_DRAFT_KEY/);
  assert.match(page, /onNavigate\("data-services", "development-backlog"\)/);
  assert.match(editor, /重新生成/);
  assert.match(`${page}\n${editor}`, /手工新增/);
});

test("detail actions send expected version branch evidence and resume condition", () => {
  const path = resolve("src/features/development-backlog/DevelopmentBacklogDetail.jsx");
  assert.equal(existsSync(path), true);
  const detail = readFileSync(path, "utf8");
  assert.match(detail, /expectedVersion/);
  assert.match(detail, /claimedBranch/);
  assert.match(detail, /acceptanceEvidence/);
  assert.match(detail, /resumeCondition/);
});
