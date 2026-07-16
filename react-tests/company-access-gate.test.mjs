import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canAccessCompanyPlatform } from "../src/domain/permissions.js";

test("only members of 总经办 can access the company platform", () => {
  assert.equal(canAccessCompanyPlatform({ department: "总经办" }), true);
  assert.equal(canAccessCompanyPlatform({ department: "产品部 / 总经办" }), true);
  assert.equal(canAccessCompanyPlatform({ departments: ["财务部", "总经办"] }), true);
  assert.equal(canAccessCompanyPlatform({ department: "产品部", role: "executive" }), false);
  assert.equal(canAccessCompanyPlatform({ department: "运营部" }), false);
});

test("the app preserves the legacy product shell for non-executive-office users", async () => {
  const html = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(html, /const COMPANY_NAV =/);
  assert.match(html, /const PRODUCT_NAV =/);
  assert.match(html, /const hasCompanyAccess = canAccessCompanyPlatform\(sessionUser\)/);
  assert.match(html, /const navigation = hasCompanyAccess \? COMPANY_NAV : PRODUCT_NAV/);
  assert.match(html, /hasCompanyAccess \? "经营执行平台" : "产品全周期"/);
  assert.match(html, /hasCompanyAccess \? "战略与业务协同" : "流程协同系统"/);
  assert.match(html, /const activeScreen = screenAllowed \? screen : defaultScreen/);
});

test("non-executive-office sessions do not mount platform synchronization", async () => {
  const html = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(html, /enabled=\{hasCompanyAccess\}/);
  assert.match(html, /hasCompanyAccess \? <ProductFlowPlatformBridge \/> : null/);
});
