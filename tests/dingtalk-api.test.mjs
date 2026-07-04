import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfigResponse,
  mapDingRole,
  publicUser
} from "../functions/api/dingtalk/_shared/dingtalk.js";

test("buildConfigResponse reports missing Cloudflare environment variables", () => {
  const result = buildConfigResponse({}, "https://flow.example.com");

  assert.deepEqual(result, {
    configured: false,
    missing: ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"],
    callbackUrl: "https://flow.example.com/?corpId=$CORPID$"
  });
});

test("buildConfigResponse accepts DingTalk app credentials", () => {
  const result = buildConfigResponse({
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret"
  }, "https://flow.example.com/");

  assert.equal(result.configured, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.callbackUrl, "https://flow.example.com/?corpId=$CORPID$");
});

test("mapDingRole maps product and finance job text to local permissions", () => {
  assert.equal(mapDingRole({ title: "高级产品经理" }), "product");
  assert.equal(mapDingRole({ role_list: [{ group_name: "财务部", name: "会计" }] }), "finance");
  assert.equal(mapDingRole({ title: "行政专员" }), "readonly");
});

test("publicUser masks mobile and preserves department and role metadata", () => {
  const result = publicUser(
    { userid: "u-1", unionid: "union-1" },
    {
      userid: "u-2",
      name: "周荣庆",
      mobile: "13812345678",
      dept_id_list: [1, 2],
      role_list: [{ name: "管理员" }]
    }
  );

  assert.equal(result.userid, "u-2");
  assert.equal(result.name, "周荣庆");
  assert.equal(result.mobileMasked, "138****5678");
  assert.deepEqual(result.deptIds, [1, 2]);
  assert.deepEqual(result.roles, [{ name: "管理员" }]);
}
);
