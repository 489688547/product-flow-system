import { douyinEcommerceProvider } from "./douyin-ecommerce.mjs";
import { dataAcquisitionContract } from "../../../src/domain/dataAcquisition.js";

const PROVIDERS = new Map([[douyinEcommerceProvider.id, douyinEcommerceProvider]]);

export function providerForTask(task = {}) {
  dataAcquisitionContract(task.platformId, task.type, String(task.resourceType || "connection_identity"));
  const provider = PROVIDERS.get(String(task.platformId || ""));
  if (!provider) throw new Error(`公司 Mac provider adapter 未安装：${String(task.platformId || "unknown")}`);
  const resourceType = String(task.resourceType || "connection_identity");
  if (!provider.taskTypes.includes(task.type) || !provider.resourceTypes.includes(resourceType)) throw new Error("公司 Mac provider adapter 版本不兼容。");
  return provider;
}

export function registeredProviders() {
  return [...PROVIDERS.values()].map(provider => ({ id: provider.id, taskTypes: provider.taskTypes, resourceTypes: provider.resourceTypes }));
}
