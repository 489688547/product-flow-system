import { orgUsers } from "./productFlow.js";

function clean(value) {
  return String(value || "").trim();
}

function userId(user) {
  return clean(user?.userid || user?.userId || user?.id);
}

function unionId(user) {
  return clean(user?.unionid || user?.unionId);
}

export function productManagerAssignment(name, orgCache = {}) {
  const productManager = clean(name);
  const member = orgUsers(orgCache).find(user => clean(user.name) === productManager);
  return {
    productManager,
    productManagerUserId: userId(member),
    productManagerUnionId: unionId(member)
  };
}

export function isProductOwnedBy(product, currentUser) {
  if (!product || !currentUser) return false;
  const managerUserId = clean(product.productManagerUserId);
  const currentUserId = userId(currentUser);
  if (managerUserId && currentUserId) return managerUserId === currentUserId;

  const managerUnionId = clean(product.productManagerUnionId);
  const currentUnionId = unionId(currentUser);
  if (managerUnionId && currentUnionId) return managerUnionId === currentUnionId;

  const managerName = clean(product.productManager);
  return Boolean(managerName && managerName === clean(currentUser.name));
}

export function prioritizeOwnedProducts(products = [], currentUser) {
  return [...products]
    .map((product, index) => ({ product, index, owned: isProductOwnedBy(product, currentUser) }))
    .sort((left, right) => Number(right.owned) - Number(left.owned) || left.index - right.index)
    .map(item => item.product);
}

export function preferredProgressProductId(products = [], currentUser, explicitProductId = "") {
  const explicit = clean(explicitProductId);
  if (explicit && products.some(product => product.id === explicit)) return explicit;
  const owned = prioritizeOwnedProducts(products, currentUser).find(product => isProductOwnedBy(product, currentUser));
  return owned?.id || products[0]?.id || "";
}
