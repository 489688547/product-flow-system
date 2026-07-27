import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("brand content uses an isolated responsive stylesheet", async () => {
  const [main, css] = await Promise.all([
    read("src/main.jsx"),
    read("src/features/brand-content/brand-content.css")
  ]);
  assert.match(main, /brand-content\/brand-content\.css/);
  for (const token of [
    ".brand-focus-strip",
    ".brand-content-row",
    ".brand-asset-layout",
    ".brand-settings-matrix",
    "@media (max-width: 1120px)",
    "@media (max-width: 760px)",
    "@media (max-width: 420px)",
    "prefers-reduced-motion"
  ]) assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("brand content styling stays restrained and does not recreate top navigation", async () => {
  const [app, css] = await Promise.all([
    read("src/App.jsx"),
    read("src/features/brand-content/brand-content.css")
  ]);
  assert.doesNotMatch(app, /brand-content-tabs|brand-subnav|role="tablist"/);
  assert.doesNotMatch(css, /linear-gradient|background-clip\s*:\s*text/);
  assert.doesNotMatch(css, /border-left\s*:\s*[2-9]px/);
});

test("desktop sidebar scrolls independently so switching tabs never drags the nav away", async () => {
  const css = await read("src/styles.css");
  // 左右共用文档滚动条时，showScreen 的 window.scrollTo(0,0) 会把刚点击的导航项一起甩走。
  assert.match(css, /\.sidebar \{ position: sticky; top: 0; height: 100dvh;/);
  assert.match(css, /\.sidebar nav\s*\{[^}]*overflow-y:\s*auto/s);
  // cbdd44b：侧栏滚到底后滚轮量必须接力给页面，不能重新引入 overscroll-behavior: contain。
  assert.doesNotMatch(css, /\.sidebar nav\s*\{[^}]*overscroll-behavior:\s*contain/s);
});

test("horizontal clipping uses clip so sticky sidebar and topbar keep working", async () => {
  const css = await read("src/styles.css");
  // overflow-x: hidden 会把 html/body/main 变成滚动容器，令后代的 position: sticky 静默失效。
  assert.match(css, /html, body \{ overflow-x: clip; \}/);
  assert.match(css, /^main \{[^}]*overflow-x: clip;/m);
  assert.doesNotMatch(css, /^(html, body|main) \{[^}]*overflow-x:\s*hidden/m);
});
