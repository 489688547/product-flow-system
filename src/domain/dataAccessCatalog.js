const categories = [
  { id: "ecommerce", label: "电商平台" },
  { id: "erp", label: "ERP" },
  { id: "company", label: "公司数据" }
];

const membership = {
  connector: {
    "douyin-ecommerce": "ecommerce",
    oceanengine: "ecommerce",
    kuaishou: "ecommerce",
    taobao: "ecommerce",
    pinduoduo: "ecommerce",
    xiaohongshu: "ecommerce",
    "jd-jingmai": "ecommerce",
    "kuaimai-erp": "erp"
  },
  platform: {
    kuaimai: "erp",
    dingtalk: "company",
    aliyun: "company"
  },
  vault: {
    nas: "company",
    email: "company",
    finance: "company",
    "government-saas": "company",
    custom: "company"
  }
};

export const DATA_ACCESS_CATEGORIES = Object.freeze(categories.map(item => Object.freeze(item)));

export function dataAccessCategoryFor(sourceKind, sourceId) {
  return membership[sourceKind]?.[sourceId] || "";
}

export function dataAccessSourceIds(categoryId, sourceKind) {
  return Object.entries(membership[sourceKind] || {})
    .filter(([, category]) => category === categoryId)
    .map(([sourceId]) => sourceId);
}
