import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const provider = readFileSync(new URL("../src/state/DataStandardsProvider.jsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const dataCenter = readFileSync(new URL("../src/state/DataCenterProvider.jsx", import.meta.url), "utf8");

test("shared provider owns governed definitions, results and cancellable bounded polling", () => {
  assert.match(provider, /useProductFlow/);
  assert.match(provider, /canEditFeature\([\s\S]*"dataCenter"/);
  assert.match(provider, /AbortController/);
  assert.match(provider, /pollMetricResults/);
  assert.match(provider, /maxAttempts: 20/);
  assert.match(provider, /setTimeout\([\s\S]*250/);
  assert.match(provider, /runAuthorizedDataStandardsWrite\(canWrite, operation\)/);
  assert.doesNotMatch(provider, /localStorage/);
});

test("comparison results use an independent cancellable request and error boundary", () => {
  assert.match(provider, /resolveMetricResults/);
  assert.match(provider, /comparisonRequest/);
  assert.match(provider, /comparisonResults/);
  assert.match(provider, /comparisonRun/);
  assert.match(provider, /comparisonLoading/);
  assert.match(provider, /comparisonError/);
  assert.match(provider, /ensureComparisonResults/);
  assert.match(provider, /scheduleComparisonResults/);
  assert.match(provider, /comparisonRequest\.current\?\.abort\(\)/);
  assert.match(provider, /setComparisonError\(errorState/);
});

test("provider is mounted inside product flow and outside all business app providers", () => {
  assert.match(main, /<ProductFlowProvider>[\s\S]*<DataStandardsProvider enabled=\{hasDataCenterAccess\}>[\s\S]*<DataCenterProvider/);
  assert.match(main, /<DataStandardsProvider[\s\S]*<SupplyChainProvider/);
  assert.doesNotMatch(dataCenter, /createDataStandard|publishDataStandardVersion|archiveDataStandard|requestMetricCalculation/);
  assert.match(dataCenter, /persistableMetadata/);
  assert.doesNotMatch(dataCenter, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/);
});
