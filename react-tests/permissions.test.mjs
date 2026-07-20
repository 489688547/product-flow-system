import assert from "node:assert/strict";
import test from "node:test";
import { canEditFeature, DEFAULT_PERMISSIONS } from "../src/domain/permissions.js";

test("data center edit defaults admit each governed definition department", () => {
  assert.deepEqual(DEFAULT_PERMISSIONS.features.dataCenter.editDepartments, [
    "总经办",
    "运营部",
    "财务部",
    "供应链部",
    "供应链",
    "供应链团队",
    "采购部"
  ]);
  for (const department of ["运营部", "财务部", "供应链部", "供应链", "供应链团队", "采购部"]) {
    assert.equal(canEditFeature(DEFAULT_PERMISSIONS, { department }, "dataCenter"), true, department);
  }
});

test("data center edit titles include finance and supply chain owners", () => {
  assert.deepEqual(DEFAULT_PERMISSIONS.features.dataCenter.editTitles, [
    "总经理",
    "运营负责人",
    "财务负责人",
    "供应链负责人",
    "采购负责人"
  ]);
  assert.equal(canEditFeature(DEFAULT_PERMISSIONS, { department: "其他", title: "财务负责人" }, "dataCenter"), true);
  assert.equal(canEditFeature(DEFAULT_PERMISSIONS, { department: "其他", title: "供应链负责人" }, "dataCenter"), true);
  assert.equal(canEditFeature(DEFAULT_PERMISSIONS, { department: "产品部", title: "产品负责人" }, "dataCenter"), false);
});
