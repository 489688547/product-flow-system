import {
  buildKuaimaiActionPlan,
  classifyKuaimaiPage,
  kuaimaiResources
} from "./kuaimai.js";

const taskFields = new Set([
  "jobId",
  "providerId",
  "resourceType",
  "businessDate",
  "status",
  "attempt",
  "scheduleVersion"
]);

const providers = Object.freeze({
  kuaimai: Object.freeze({
    id: "kuaimai",
    resources: kuaimaiResources,
    classifyPage: classifyKuaimaiPage,
    buildActionPlan: buildKuaimaiActionPlan
  })
});

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function registeredProvider(providerId) {
  const provider = providers[String(providerId || "")];
  if (!provider) throw contractError("EXTENSION_TASK_NOT_REGISTERED", "平台尚未在插件中登记。");
  return provider;
}

export function registeredResource(providerId, resourceType) {
  const provider = registeredProvider(providerId);
  const resource = provider.resources[String(resourceType || "")];
  if (!resource) throw contractError("EXTENSION_TASK_NOT_REGISTERED", "资源尚未在插件中登记。");
  return resource;
}

export function assertRegisteredTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw contractError("EXTENSION_TASK_INVALID", "插件任务格式无效。");
  }
  const unknownFields = Object.keys(task).filter(field => !taskFields.has(field));
  if (unknownFields.length) {
    throw contractError("EXTENSION_TASK_UNSAFE_FIELDS", "插件任务包含不允许的字段。");
  }
  if (!/^[-_a-zA-Z0-9]{1,128}$/.test(String(task.jobId || ""))) {
    throw contractError("EXTENSION_TASK_INVALID", "插件任务 ID 无效。");
  }
  registeredResource(task.providerId, task.resourceType);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(task.businessDate || ""))) {
    throw contractError("EXTENSION_TASK_INVALID", "插件任务业务日期无效。");
  }
  return task;
}

export function registeredTaskRuntime(task) {
  assertRegisteredTask(task);
  const provider = registeredProvider(task.providerId);
  return {
    provider,
    resource: registeredResource(task.providerId, task.resourceType),
    actionPlan: provider.buildActionPlan(task)
  };
}

export const registeredProviders = providers;
