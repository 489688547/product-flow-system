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

export function summarizePlatformConnectionHealth({ connection, loading = false, error = "", available = true } = {}) {
  if (!available) return ["准备接入", "neutral"];
  if (error) return ["状态暂不可用", "danger"];
  if (loading && !connection) return ["正在读取", "neutral"];
  if (connection?.status === "connected") return ["已接通", "success"];
  if (["needs_attention", "incomplete"].includes(connection?.status)) return ["需处理", "danger"];
  if (connection?.status === "configured") return ["已配置", "warning"];
  return ["尚未连接", "neutral"];
}

export function summarizeErpAccessHealth({ connection, instances = [], loading = false, error = "" } = {}) {
  if (error) return ["状态暂不可用", "danger"];
  const needsAttention = new Set(["waiting_verification", "schema_changed", "failed", "login_required", "stale"]);
  if (instances.some(instance => needsAttention.has(instance.status))) return ["需处理", "danger"];
  if (instances.some(instance => instance.status === "running")) return ["同步中", "warning"];
  if (instances.some(instance => instance.status === "pending_validation")) return ["需处理", "warning"];
  return summarizePlatformConnectionHealth({ connection, loading });
}
