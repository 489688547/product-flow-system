import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createCdpDouyinController } from "../scripts/web-data-collector/browser/providers/douyin.mjs";

const source = await readFile(
  new URL("../scripts/web-data-collector/browser/providers/douyin.mjs", import.meta.url),
  "utf8"
);

test("专用浏览器必须能发出可信鼠标事件", () => {
  // 罗盘的日期控件只认可信事件：element.click() 与合成 MouseEvent 都只改显示，
  // 不进表单模型——自助取数里填好日期后提交仍报「请输入时间」，真实鼠标点击
  // 同一个格子则校验立刻通过。扩展没有 debugger 权限发不出可信事件，
  // CDP 的 Input 域是唯一出路，也是专用浏览器模式存在的意义。
  assert.match(source, /Input\.dispatchMouseEvent/);
  assert.match(source, /"mousePressed"/);
  assert.match(source, /"mouseReleased"/);
});

test("点击坐标由页面实时给出，不得硬编码", () => {
  // 罗盘一改版硬编码坐标就失效，而且失效时不报错、只会点空——今天在快麦和罗盘
  // 上都因为坐标偏移白点过好几次。
  assert.match(source, /getBoundingClientRect/);
});

test("坐标非法时明确报错，不静默点空", async () => {
  const sent = [];
  const controller = createCdpDouyinController({
    browser: { endpoint: "http://127.0.0.1:9222" },
    downloadsDirectory: "/tmp/douyin",
    createSession: () => ({ send: async (method, params) => { sent.push({ method, params }); return {}; } })
  });
  await assert.rejects(
    () => controller.trustedClickAt(Number.NaN, 10),
    error => error.code === "DOUYIN_PAGE_NOT_OPEN" || error.code === "DOUYIN_CLICK_POINT_INVALID"
  );
  assert.equal(sent.some(item => item.method === "Input.dispatchMouseEvent"), false);
});
