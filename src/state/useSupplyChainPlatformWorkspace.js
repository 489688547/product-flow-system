import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSupplyChainWorkflowEntity,
  executeSupplyChainWorkflowAction,
  loadSupplyChainWorkflowResources,
  supplyChainWorkflowResultNotice
} from "./supplyChainApi.js";
import { loadSupplyChainWorkspaceData } from "./supplyChainDataApi.js";
import {
  mergeSupplyChainWorkflowEntity,
  supplyChainWorkflowResourcesForWorkspace
} from "./supplyChainPlatformState.js";

function operationKey(resource, id, action) {
  return [resource, id, action].filter(Boolean).join(":");
}

function randomIdempotencyKey(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${suffix}`;
}

export function useSupplyChainPlatformWorkspace({
  workspace,
  filters = {},
  enabled = true
} = {}) {
  const workflowResources = useMemo(
    () => supplyChainWorkflowResourcesForWorkspace(workspace),
    [workspace]
  );
  const filterKey = JSON.stringify(filters);
  const [facts, setFacts] = useState({});
  const [factQuality, setFactQuality] = useState({
    status: "unavailable",
    lastSuccessfulSyncAt: null,
    coverage: null,
    confidence: null,
    missing: []
  });
  const [factErrors, setFactErrors] = useState([]);
  const [workflows, setWorkflows] = useState({});
  const [workflowErrors, setWorkflowErrors] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async ({ signal } = {}) => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    const [factResult, workflowResult] = await Promise.allSettled([
      loadSupplyChainWorkspaceData({ workspace, filters, signal }),
      loadSupplyChainWorkflowResources({ resources: workflowResources, signal })
    ]);
    if (factResult.status === "fulfilled") {
      setFacts(factResult.value.data);
      setFactQuality(factResult.value.quality);
      setFactErrors(factResult.value.errors);
    } else if (factResult.reason?.name !== "AbortError") {
      setFactErrors([{
        resource: "workspace",
        code: String(factResult.reason?.code || "SUPPLY_CHAIN_SHARED_DATA_UNAVAILABLE"),
        message: String(factResult.reason?.message || "供应链共享事实加载失败。"),
        requestId: String(factResult.reason?.requestId || ""),
        retryable: Boolean(factResult.reason?.retryable)
      }]);
    }
    if (workflowResult.status === "fulfilled") {
      setWorkflows(workflowResult.value.resources);
      setWorkflowErrors(workflowResult.value.errors);
    } else if (workflowResult.reason?.name !== "AbortError") {
      setWorkflowErrors([{
        resource: "workflow",
        code: String(workflowResult.reason?.code || "SUPPLY_WORKFLOW_STORAGE_UNAVAILABLE"),
        message: String(workflowResult.reason?.message || "供应链工作流加载失败。"),
        requestId: String(workflowResult.reason?.requestId || ""),
        retryable: Boolean(workflowResult.reason?.retryable)
      }]);
    }
    setLoading(false);
    return {
      facts: factResult.status === "fulfilled" ? factResult.value : null,
      workflows: workflowResult.status === "fulfilled" ? workflowResult.value : null
    };
  }, [enabled, filterKey, workflowResources, workspace]);

  useEffect(() => {
    const controller = new AbortController();
    reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  const create = useCallback(async ({
    resource,
    id,
    fields,
    idempotencyKey
  }) => {
    const key = operationKey(resource, id, "create");
    setBusy(key);
    setNotice(null);
    try {
      const payload = await createSupplyChainWorkflowEntity({
        resource,
        id,
        fields,
        idempotencyKey: idempotencyKey || randomIdempotencyKey(key)
      });
      setWorkflows(current => mergeSupplyChainWorkflowEntity(current, payload.entity));
      const resultNotice = supplyChainWorkflowResultNotice(payload);
      setNotice(resultNotice);
      return payload;
    } catch (error) {
      setNotice({
        tone: "error",
        title: "操作未保存",
        message: String(error?.message || "供应链工作流写入失败。"),
        requestId: String(error?.requestId || ""),
        pendingManual: false
      });
      throw error;
    } finally {
      setBusy("");
    }
  }, []);

  const act = useCallback(async ({
    resource,
    id,
    action,
    expectedVersion,
    reason,
    fields,
    idempotencyKey
  }) => {
    const key = operationKey(resource, id, action);
    setBusy(key);
    setNotice(null);
    try {
      const payload = await executeSupplyChainWorkflowAction({
        resource,
        id,
        action,
        expectedVersion,
        reason,
        fields,
        idempotencyKey: idempotencyKey || randomIdempotencyKey(key)
      });
      setWorkflows(current => mergeSupplyChainWorkflowEntity(current, payload.entity));
      const resultNotice = supplyChainWorkflowResultNotice(payload);
      setNotice(resultNotice);
      return payload;
    } catch (error) {
      setNotice({
        tone: "error",
        title: error?.code === "SUPPLY_WORKFLOW_VERSION_CONFLICT" ? "版本已更新" : "操作未保存",
        message: String(error?.message || "供应链工作流写入失败。"),
        requestId: String(error?.requestId || ""),
        pendingManual: false
      });
      throw error;
    } finally {
      setBusy("");
    }
  }, []);

  const resourceAvailable = useCallback(
    resource => workflows[resource]?.available === true,
    [workflows]
  );

  return {
    facts,
    factQuality,
    factErrors,
    workflows,
    workflowErrors,
    loading,
    busy,
    notice,
    setNotice,
    reload,
    create,
    act,
    resourceAvailable
  };
}
