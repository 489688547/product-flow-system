export const WEB_COLLECTION_ADAPTERS = Object.freeze([
  Object.freeze({
    id: "kuaimai",
    enabled: true,
    resources: Object.freeze([
      Object.freeze({ type: "orders", rangeKind: "daily_fact", scheduleVersion: "v2" }),
      Object.freeze({ type: "order_items", rangeKind: "daily_fact", scheduleVersion: "v1" }),
      Object.freeze({ type: "sales_items", rangeKind: "daily_fact", scheduleVersion: "v3" }),
      Object.freeze({ type: "products", rangeKind: "current_snapshot", scheduleVersion: "v1" }),
      Object.freeze({ type: "product_kits", rangeKind: "current_snapshot", scheduleVersion: "v1" }),
      Object.freeze({ type: "product_combinations", rangeKind: "current_snapshot", scheduleVersion: "v1" }),
      Object.freeze({ type: "inventory", rangeKind: "current_snapshot", scheduleVersion: "v1" })
    ])
  })
]);

function processorError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createProviderProcessorRegistry(processors = []) {
  const byId = new Map();
  for (const processor of processors) {
    const id = String(processor?.id || "").trim();
    if (!id || typeof processor?.process !== "function" || byId.has(id)) {
      throw processorError("PROCESSOR_REGISTRY_INVALID", "网页采集 processor 注册无效。");
    }
    byId.set(id, processor);
  }
  return Object.freeze({
    require(providerId) {
      const processor = byId.get(String(providerId || ""));
      if (!processor) {
        throw processorError("PROCESSOR_NOT_REGISTERED", "网页采集平台 processor 未登记。");
      }
      return processor;
    }
  });
}

export function createKuaimaiProcessor(processDownload) {
  if (typeof processDownload !== "function") {
    throw processorError("KUAIMAI_PROCESSOR_INVALID", "快麦下载处理器未配置。");
  }
  return Object.freeze({
    id: "kuaimai",
    process({ job, result, onValidated }) {
      const resourceType = job.resourceType === "inventory"
        ? "inventory_snapshot"
        : job.resourceType;
      return processDownload({
        jobId: job.id,
        fileName: result.safeFileName || result.fileName,
        resourceType,
        businessDate: job.businessDate,
        onValidated
      });
    }
  });
}
