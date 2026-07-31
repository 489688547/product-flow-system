import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createCdpDouyinController } from "../scripts/web-data-collector/browser/providers/douyin.mjs";

const source = await readFile(
  new URL("../scripts/web-data-collector/browser/providers/douyin.mjs", import.meta.url),
  "utf8"
);

test("真实控制器提供执行器调用的每个方法", () => {
  // 执行器曾调用 controller.awaitDownload?.()，而真实控制器并没有这个方法：
  // 可选链让它静默返回 undefined，再被判成「文件未落盘」，自助取数会 100% 失败，
  // 且失败原因具有误导性。用 stub 写的测试天然抓不到这类缺口——stub 里什么都有。
  const controller = createCdpDouyinController({
    browser: { endpoint: "http://127.0.0.1:9222" },
    downloadsDirectory: "/tmp/douyin"
  });
  for (const name of [
    "open", "inspect", "applyBusinessDate", "downloadOfficialReport",
    "captureStoreDaily", "awaitDownload", "evaluate",
    "trustedClickAt", "trustedClickElement", "trustedTypeText", "trustedClearAndType"
  ]) {
    assert.equal(typeof controller[name], "function", `控制器缺少 ${name}`);
  }
});

test("采集主路径不得用可选链调用控制器方法", () => {
  // 可选链会把「方法不存在」这种编程错误伪装成「数据不可用」这种业务结果。
  // captureFailureArtifact 与 close 属于错误兜底与清理，缺失时跳过是合理的；
  // 但凡是决定采集成败的调用，缺失必须立刻炸出来。
  const 兜底方法 = new Set(["captureFailureArtifact", "close"]);
  // 去掉注释再匹配：注释里引用这种写法是为了说明教训，不是代码。
  const code = source.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
  for (const match of code.matchAll(/controller\.(\w+)\?\.\(/g)) {
    assert.ok(兜底方法.has(match[1]), `采集主路径不得可选链调用 controller.${match[1]}`);
  }
});

test("下载地址按端点放行，不把白名单放宽成模糊匹配", async () => {
  const { isRegisteredDouyinUrl } = await import("../scripts/web-data-collector/browser/providers/douyin.mjs");
  assert.equal(isRegisteredDouyinUrl("https://compass.jinritemai.com/data_factory/download_file?task_id=7668269421552205839"), true);
  // 白名单的意义就是「只去该去的地方」，这几种都必须挡住。
  assert.equal(isRegisteredDouyinUrl("https://compass.jinritemai.com/data_factory/download_file?task_id=abc"), false);
  assert.equal(isRegisteredDouyinUrl("https://compass.jinritemai.com/data_factory/download_file?task_id=1&next=evil"), false);
  assert.equal(isRegisteredDouyinUrl("https://evil.example.com/data_factory/download_file?task_id=1"), false);
});

test("网络记录能力可用且必须能关掉", async () => {
  // 只用于摸接口，不参与正式采集。它会持续收所有请求，开着既费内存也没必要，
  // 因此必须给出明确的 stop。
  const { createCdpDouyinController } = await import("../scripts/web-data-collector/browser/providers/douyin.mjs");
  const controller = createCdpDouyinController({
    browser: { endpoint: "http://127.0.0.1:9222" },
    downloadsDirectory: "/tmp"
  });
  assert.equal(typeof controller.recordNetwork, "function");
  // 没打开页面时应当明确报错，而不是返回一个永远空的记录器。
  await assert.rejects(controller.recordNetwork(), error => error.code === "DOUYIN_PAGE_NOT_OPEN");
});
