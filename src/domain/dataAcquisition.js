import { DOUYIN_ECOMMERCE } from "./dataConnections.js";

const PROVIDERS = Object.freeze({
  "douyin-ecommerce": Object.freeze({
    id: "douyin-ecommerce",
    name: "抖音电商",
    loginUrl: DOUYIN_ECOMMERCE.loginUrl,
    allowedOrigins: Object.freeze(["https://fxg.jinritemai.com"]),
    credentialSchema: Object.freeze({
      id: "email-password-v1",
      accountField: "loginEmail",
      publicFields: Object.freeze(["loginEmail"]),
      secretFields: Object.freeze(["password"])
    }),
    tasks: Object.freeze({
      douyin_login_verification: Object.freeze({
        type: "douyin_login_verification",
        resourceTypes: Object.freeze(["connection_identity"]),
        schemaVersion: "v1"
      })
    })
  })
});

export function dataAcquisitionContract(providerId, taskType, resourceType) {
  const provider = PROVIDERS[String(providerId || "")];
  if (!provider) throw new Error(`数据采集 provider 未登记：${String(providerId || "unknown")}`);
  const task = provider.tasks[String(taskType || "")];
  if (!task) throw new Error(`数据采集任务类型未登记：${String(taskType || "unknown")}`);
  if (!task.resourceTypes.includes(String(resourceType || ""))) {
    throw new Error(`数据采集资源类型未登记：${String(resourceType || "unknown")}`);
  }
  return { ...provider, task };
}

export function registeredDataAcquisitionProviders() {
  return Object.values(PROVIDERS);
}
