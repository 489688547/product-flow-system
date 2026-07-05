import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("package previews classify Office, PDF, archive, media, and generic files", () => {
  assert.match(html, /function fileExtension\(/);
  assert.match(html, /function inferAssetType\(name, mimeType = ""\)/);
  assert.match(html, /powerpoint|presentation|pptx\|ppt/i);
  assert.match(html, /spreadsheet|excel|xlsx\|xls\|csv/i);
  assert.match(html, /pdf/i);
  assert.match(html, /zip\|rar\|7z/i);
});

test("blob urls are not treated as images unless the file is actually an image", () => {
  assert.doesNotMatch(html, /png\|jpe\?g\|webp\|gif\|data:image\|blob:/);
  assert.match(html, /isImageAsset\(doc\)[\s\S]*data:image\//);
});

test("package cards show a stable file preview and file metadata", () => {
  assert.match(html, /class="file-preview-body"/);
  assert.match(html, /class="file-extension"/);
  assert.match(html, /function filePreviewBadge\(doc\)/);
  assert.match(html, /fileMetaText\(d\)/);
  assert.match(html, /filePreviewClass\(d\)/);
});

test("normalized deliverables refresh stale file types from name and url", () => {
  assert.match(html, /\.\.\.doc,[\s\S]*type: inferAssetType\(`\$\{doc\.name \|\| ""\} \$\{doc\.url \|\| ""\}`/);
  assert.match(html, /prd\|文档\|纪要\|报告\|说明\|方案\|需求\|规格书\|想法\|建议\|草案\|终版\|清单\|确认单\|确认书/);
  assert.match(html, /spreadsheet\|excel\|xlsx\|xls\|csv\|numbers\|排期表/);
  assert.match(html, /presentation: "PPT"/);
  assert.match(html, /spreadsheet: "XLS"/);
  assert.match(html, /document: "DOC"/);
});
