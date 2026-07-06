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

  assert.equal(org.version, "org-v2");
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

test("syncDingOrg recursively fetches nested departments and root users", async () => {
  const userLists = {
    1: [{
      userid: "u-boss",
      unionid: "union-boss",
      name: "周总",
      title: "总经理",
      dept_id_list: [1],
      role_list: [{ group_name: "主管理员", name: "管理员" }]
    }],
    10: [{
      userid: "u-product",
      unionid: "union-product",
      name: "张产品",
      title: "产品经理",
      dept_id_list: [10],
      role_list: [{ group_name: "产品部", name: "产品经理" }]
    }],
    11: [{
      userid: "u-design",
      unionid: "union-design",
      name: "王设计",
      title: "设计师",
      dept_id_list: [11],
      role_list: [{ group_name: "设计组", name: "设计师" }]
    }],
    20: [{
      userid: "u-ops",
      unionid: "union-ops",
      name: "李运营",
      title: "运营",
      dept_id_list: [20],
      role_list: [{ group_name: "运营部", name: "店长" }]
    }]
  };
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/topapi/v2/department/listsub")) {
      const children = {
        1: [
          { dept_id: 10, parent_id: 1, name: "产品部" },
          { dept_id: 20, parent_id: 1, name: "运营部" }
        ],
        10: [
          { dept_id: 11, parent_id: 10, name: "设计组" }
        ],
        11: [],
        20: []
      };
      return okJson({ errcode: 0, result: children[body.dept_id] || [] });
    }
    if (String(url).includes("/topapi/v2/user/list")) {
      return okJson({
        errcode: 0,
        result: {
          has_more: false,
          list: userLists[body.dept_id] || []
        }
      });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const org = await syncDingOrg("token-1", fetchImpl, new Date("2026-07-05T00:00:00.000Z"));

  assert.deepEqual(org.departments.map(dept => dept.deptId).sort(), ["10", "11", "20"]);
  assert.deepEqual(org.users.map(user => user.userId).sort(), ["u-boss", "u-design", "u-ops", "u-product"]);
  assert.equal(org.users.find(user => user.userId === "u-design").departmentNames[0], "设计组");
});

test("syncDingOrg discovers departments that listsub omits by using sub department ids", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url: String(url), body });
    if (String(url).includes("/topapi/v2/department/listsubid")) {
      const children = { 1: [10], 10: [11], 11: [] };
      return okJson({ errcode: 0, result: { dept_id_list: children[body.dept_id] || [] } });
    }
    if (String(url).includes("/topapi/v2/department/listsub")) {
      return okJson({ errcode: 0, result: body.dept_id === 1 ? [{ dept_id: 10, parent_id: 1, name: "产品部" }] : [] });
    }
    if (String(url).includes("/topapi/v2/department/get")) {
      return okJson({ errcode: 0, result: { dept_id: body.dept_id, parent_id: 10, name: "隐藏设计组" } });
    }
    if (String(url).includes("/topapi/v2/user/list")) {
      return okJson({
        errcode: 0,
        result: {
          has_more: false,
          list: body.dept_id === 11 ? [{
            userid: "u-hidden",
            unionid: "union-hidden",
            name: "隐藏成员",
            title: "设计师",
            dept_id_list: [11],
            role_list: [{ group_name: "隐藏设计组", name: "设计师" }]
          }] : []
        }
      });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const org = await syncDingOrg("token-1", fetchImpl, new Date("2026-07-05T00:00:00.000Z"));
  const userListCall = calls.find(call => call.url.includes("/topapi/v2/user/list"));

  assert.equal(org.version, "org-v2");
  assert.ok(org.departments.some(dept => dept.deptId === "11" && dept.name === "隐藏设计组"));
  assert.equal(org.users.find(user => user.userId === "u-hidden").departmentNames[0], "隐藏设计组");
  assert.equal(userListCall.body.contain_access_limit, false);
  assert.equal(userListCall.body.order_field, "modify_desc");
});

test("syncDingOrg keeps available users and reports unreadable departments", async () => {
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/topapi/v2/department/listsubid")) {
      return okJson({ errcode: 0, result: { dept_id_list: [] } });
    }
    if (String(url).includes("/topapi/v2/department/listsub")) {
      return okJson({ errcode: 0, result: [{ dept_id: 10, parent_id: 1, name: "产品部" }] });
    }
    if (String(url).includes("/topapi/v2/user/list")) {
      if (body.dept_id === 10) {
        return okJson({ errcode: 50004, errmsg: "部门不在权限范围内" });
      }
      return okJson({
        errcode: 0,
        result: {
          has_more: false,
          list: [{ userid: "u-root", unionid: "union-root", name: "根成员", title: "总经理", dept_id_list: [1] }]
        }
      });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const org = await syncDingOrg("token-1", fetchImpl, new Date("2026-07-05T00:00:00.000Z"));

  assert.deepEqual(org.users.map(user => user.userId), ["u-root"]);
  assert.equal(org.syncWarnings.length, 1);
  assert.equal(org.syncWarnings[0].deptId, "10");
  assert.equal(org.syncWarnings[0].code, 50004);
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
