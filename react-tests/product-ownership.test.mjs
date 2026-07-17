import test from "node:test";
import assert from "node:assert/strict";
import {
  isProductOwnedBy,
  preferredProgressProductId,
  prioritizeOwnedProducts,
  productManagerAssignment
} from "../src/domain/productOwnership.js";

const currentUser = { userid: "u-zhao", unionid: "union-zhao", name: "赵雨涵" };

test("product owner assignment resolves organization identifiers", () => {
  const assignment = productManagerAssignment("赵雨涵", {
    users: [{ userid: "u-zhao", unionid: "union-zhao", name: "赵雨涵" }]
  });
  assert.deepEqual(assignment, {
    productManager: "赵雨涵",
    productManagerUserId: "u-zhao",
    productManagerUnionId: "union-zhao"
  });
});

test("ownership prefers organization identifiers and supports legacy names", () => {
  assert.equal(isProductOwnedBy({ productManagerUserId: "u-zhao", productManager: "旧姓名" }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManagerUnionId: "union-zhao", productManager: "旧姓名" }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManager: " 赵雨涵 " }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManager: "叶津成" }, currentUser), false);
});

test("owned products are moved first without changing order inside either group", () => {
  const products = [
    { id: "p1", productManager: "叶津成" },
    { id: "p2", productManager: "赵雨涵" },
    { id: "p3", productManager: "赵雨涵" },
    { id: "p4", productManager: "陈菲" }
  ];
  assert.deepEqual(prioritizeOwnedProducts(products, currentUser).map(product => product.id), ["p2", "p3", "p1", "p4"]);
  assert.deepEqual(products.map(product => product.id), ["p1", "p2", "p3", "p4"]);
});

test("explicit progress product wins over the personal default", () => {
  const products = [
    { id: "other", productManager: "叶津成" },
    { id: "mine", productManagerUserId: "u-zhao", productManager: "赵雨涵" }
  ];
  assert.equal(preferredProgressProductId(products, currentUser, "other"), "other");
  assert.equal(preferredProgressProductId(products, currentUser, ""), "mine");
});
