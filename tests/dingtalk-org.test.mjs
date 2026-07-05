import test from "node:test";
import assert from "node:assert/strict";
import {
  filterOrgUsers,
  syncDingOrg
} from "../functions/api/dingtalk/_shared/dingtalk.js";

function okJson(body) {
  return {
    ok: true,
    json: async () => body
  };
}

test("syncDingOrg fetches departments and sanitizes user directory", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (String(url).includes("/topapi/v2/department/listsub")) {
      return okJson({
        errcode: 0,
        result: [
          { dept_id: 1, parent_id: 0, name: "产品部" },
          { dept_id: 2, parent_id: 0, name: "运营部" }
        ]
      });
    }
    if (String(url).includes("/topapi/v2/user/list")) {
      const deptId = JSON.parse(options.body).dept_id;
      return okJson({
        errcode: 0,
        result: {
          has_more: false,
          list: deptId === 1 ? [{
            userid: "u-product",
            unionid: "union-product",
            name: "张产品",
            title: "产品经理",
            mobile: "13812345678",
            org_email: "private@example.com",
            dept_id_list: [1],
            role_list: [{ group_name: "产品部", name: "产品经理" }]
          }] : [{
            userid: "u-ops",
            unionid: "union-ops",
            name: "李运营",
            title: "运营",
            dept_id_list: [2],
            role_list: [{ group_name: "运营部", name: "店长" }]
          }]
        }
      });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const org = await syncDingOrg("token-1", fetchImpl, new Date("2026-07-05T00:00:00.000Z"));

  assert.equal(org.version, "org-v1");
  assert.equal(org.departments.length, 2);
  assert.equal(org.users.length, 2);
  const productUser = org.users.find(user => user.userId === "u-product");
  assert.equal(productUser.role, "product");
  assert.equal(productUser.mobile, undefined);
  assert.equal(productUser.org_email, undefined);
  assert.match(org.syncedAt, /^2026-07-05T00:00:00\.000Z$/);
  assert.match(org.expiresAt, /^2026-07-06T00:00:00\.000Z$/);
  assert.equal(calls.filter(call => String(call.url).includes("/topapi/v2/user/list")).length, 2);
});

test("filterOrgUsers searches name, title, department, and role", () => {
  const org = {
    users: [
      { userId: "u1", name: "张产品", title: "产品经理", departmentNames: ["产品部"], role: "product" },
      { userId: "u2", name: "李运营", title: "店长", departmentNames: ["运营部"], role: "ops" }
    ]
  };

  assert.deepEqual(filterOrgUsers(org, "产品").map(user => user.userId), ["u1"]);
  assert.deepEqual(filterOrgUsers(org, "运营部").map(user => user.userId), ["u2"]);
  assert.deepEqual(filterOrgUsers(org, "").map(user => user.userId), ["u1", "u2"]);
});
