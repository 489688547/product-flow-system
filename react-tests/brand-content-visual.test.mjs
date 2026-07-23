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

test("desktop sidebar flows with the document instead of scrolling internally", async () => {
  const css = await read("src/styles.css");
  assert.doesNotMatch(css, /\.sidebar nav\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.sidebar \{ min-height: 100dvh;/);
  assert.doesNotMatch(css, /\.sidebar \{ position: sticky/);
});
