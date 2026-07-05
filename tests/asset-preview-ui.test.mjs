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

test("opening local package files uses an HTML viewer instead of raw data urls", () => {
  assert.match(html, /function openPackageViewer\(/);
  assert.match(html, /function packageViewerHtml\(/);
  assert.match(html, /URL\.createObjectURL\(new Blob\(\[html\]/);
  assert.match(html, /if \(assetKind\(doc\) === "link" && \/\^\(https\?:\|mailto:\)\/\.test\(href\)\)/);
  assert.match(html, /openPackageViewer\(doc, href\);/);
});

test("dropped package files persist non-image files as data urls too", () => {
  assert.match(html, /reader\.readAsDataURL\(file\)/);
  assert.doesNotMatch(html, /fileType\.startsWith\("image\/"\)[\s\S]*reader\.readAsDataURL\(file\)/);
  assert.match(html, /doc\.url = String\(reader\.result \|\| ""\);/);
});

test("bad dropped package files are rejected before they enter the package", () => {
  assert.match(html, /const MAX_LOCAL_PACKAGE_FILE_SIZE = 12 \* 1024 \* 1024;/);
  assert.match(html, /function validatePackageFile\(file\)/);
  assert.match(html, /Number\(file\.size \|\| 0\) <= 0/);
  assert.match(html, /Number\(file\.size \|\| 0\) > MAX_LOCAL_PACKAGE_FILE_SIZE/);
  assert.match(html, /toast\(`已跳过 \$\{rejected\.length\} 个异常文件/);
});

test("file reader failures are reported instead of saving stale object urls", () => {
  assert.match(html, /reader\.onerror = \(\) => \{/);
  assert.match(html, /toast\(`文件「\$\{file\.name\}」读取失败，未加入资料包。`\);/);
  assert.doesNotMatch(html, /reader\.onerror = \(\) => \{[\s\S]*URL\.createObjectURL\(file\)[\s\S]*commitDoc\(doc\)/);
});

test("empty placeholder package files are pruned from defaults and restored state", () => {
  assert.match(html, /function hasOpenablePackageContent\(doc = \{\}\)/);
  assert.match(html, /function pruneUnopenableDeliverables\(deliverables = \[\]\)/);
  assert.match(html, /data\.deliverables = pruneUnopenableDeliverables\(\(data\.deliverables \|\| \[\]\)\.map\(doc =>/);
  assert.match(html, /function buildInitialDeliverables\(products\) \{\s*return \[\];\s*\}/);
  assert.match(html, /if \(doc\.source === "流程自动" && !String\(doc\.url \|\| ""\)\.trim\(\)\) return false/);
  assert.match(html, /if \(!raw \|\| raw\.startsWith\("blob:"\)\) return false/);
});
