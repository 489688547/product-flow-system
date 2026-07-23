import assert from "node:assert/strict";
import test from "node:test";

import {
  DemoDataMaskingError,
  maskDemoRecord,
  maskPersonalJson
} from "../functions/api/platform/_shared/demoDataMasking.js";

const key = "test-only-demo-masking-key-with-enough-entropy";

test("masking is deterministic, format-safe and does not retain source values", async () => {
  const input = {
    id: "employee-1",
    user_id: "ding-user-123",
    union_id: "union-123",
    name: "张三",
    payload: JSON.stringify({
      mobile: "13800138000",
      email: "zhangsan@example.com",
      address: "上海市某路 1 号",
      emergencyContact: "李四"
    })
  };
  const strategy = {
    maskFields: { user_id: "identity", union_id: "identity", name: "name" },
    maskJsonFields: ["payload"]
  };
  const first = await maskDemoRecord(input, strategy, { key, namespace: "hr_employees" });
  const second = await maskDemoRecord(input, strategy, { key, namespace: "hr_employees" });

  assert.deepEqual(first, second);
  assert.equal(first.id, input.id);
  assert.match(first.name, /^成员-/);
  assert.match(JSON.parse(first.payload).email, /@example\.invalid$/);
  assert.equal(JSON.stringify(first).includes("13800138000"), false);
  assert.equal(JSON.stringify(first).includes("张三"), false);
});

test("missing masking key fails closed for personal tables", async () => {
  await assert.rejects(
    () => maskDemoRecord({ name: "张三" }, { maskFields: { name: "name" } }, { key: "" }),
    error => error instanceof DemoDataMaskingError && error.code === "DEMO_MASKING_KEY_MISSING"
  );
});

test("personal JSON recursively masks known personal fields but keeps business values", async () => {
  const output = await maskPersonalJson({
    customer: { phone: "13800138000", privateEmail: "a@b.com" },
    sales: 120,
    platform: "天猫"
  }, { key, namespace: "payload" });

  assert.equal(output.sales, 120);
  assert.equal(output.platform, "天猫");
  assert.notEqual(output.customer.phone, "13800138000");
  assert.match(output.customer.privateEmail, /@example\.invalid$/);
});
