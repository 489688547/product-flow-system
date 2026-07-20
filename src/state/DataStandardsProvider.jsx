import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { canEditFeature } from "../domain/permissions.js";
import { canManageDataStandard, collectFormulaDependencies, CORE_DATA_STANDARDS, DATA_STANDARD_OWNER_DEPARTMENTS } from "../domain/dataStandards.js";
import { useProductFlow } from "./ProductFlowProvider.jsx";
import {
  archiveDataStandard,
  createDataStandard,
  DataStandardsApiError,
  loadDataStandard,
  loadDataStandards,
  loadMetricResults,
  pollMetricResults,
  previewDataStandard,
  publishDataStandardVersion,
  requestMetricCalculation,
  runAuthorizedDataStandardsWrite
} from "./dataStandardsApi.js";

const DataStandardsContext = createContext(null);
const LOCAL_STORAGE_MESSAGE = "本地测试模式没有 D1，共享数据口径只读目录可用，但不能计算或保存。";
const BUILTIN_DEFINITIONS = CORE_DATA_STANDARDS.map(definition => {
  const effectiveFrom = "2026-07-01";
  const dependencies = collectFormulaDependencies(definition.formulaAst);
  const version = {
    ...definition,
    definitionId: definition.id,
    version: 1,
    effectiveFrom,
    sourceFields: [],
    dependencies
  };
  return {
    ...definition,
    currentVersion: 1,
    effectiveFrom,
    dependencies,
    versions: [version]
  };
});

function builtinDefinitions(filters = {}) {
  return BUILTIN_DEFINITIONS.filter(definition => (
    (!filters.category || definition.category === filters.category)
    && (!filters.ownerDepartment || definition.ownerDepartment === filters.ownerDepartment)
    && (!filters.status || definition.status === filters.status)
  ));
}

function errorState(error, fallback = "数据口径暂不可用。") {
  return {
    message: error?.message || fallback,
    code: error?.code || "INTERNAL_UNEXPECTED",
    status: Number(error?.status || 0),
    details: error?.details,
    retryable: Boolean(error?.retryable)
  };
}

export function DataStandardsProvider({ children, enabled = true }) {
  const { state: productState, currentUser } = useProductFlow();
  const [definitions, setDefinitions] = useState([]);
  const [filters, setFilters] = useState({ status: "active" });
  const [detail, setDetail] = useState(null);
  const [results, setResults] = useState([]);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [resultLoading, setResultLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const definitionRequest = useRef(null);
  const resultRequest = useRef(null);
  const resultDebounce = useRef(null);
  const actor = useMemo(() => {
    const departments = [...new Set([
      currentUser?.department,
      ...(currentUser?.departments || []),
      ...(currentUser?.departmentNames || [])
    ].map(value => String(value || "").replace("供应链团队", "供应链部").replace("采购部", "供应链部")).filter(Boolean))];
    return {
      departments,
      executive: departments.includes("总经办"),
      readonly: currentUser?.role === "readonly" || currentUser?.readonly === true
    };
  }, [currentUser]);
  const canWrite = enabled && !storageUnavailable && !actor.readonly && canEditFeature(productState.permissions, currentUser, "dataCenter")
    && (actor.executive || actor.departments.some(department => DATA_STANDARD_OWNER_DEPARTMENTS.includes(department)));
  const canManageDefinition = useCallback(definition => canWrite && canManageDataStandard(actor, definition), [actor, canWrite]);
  const ownerDepartments = actor.executive
    ? DATA_STANDARD_OWNER_DEPARTMENTS
    : actor.departments.filter(department => DATA_STANDARD_OWNER_DEPARTMENTS.includes(department));

  const loadDefinitions = useCallback(async (nextFilters = filters) => {
    if (!enabled) return { definitions: [] };
    definitionRequest.current?.abort();
    const controller = new AbortController();
    definitionRequest.current = controller;
    setLoading(true);
    try {
      const payload = await loadDataStandards(nextFilters, fetch, controller.signal);
      setDefinitions(payload.definitions || []);
      setFilters(nextFilters);
      setStorageUnavailable(false);
      setError(null);
      return payload;
    } catch (loadError) {
      if (loadError?.status === 501) {
        const fallback = builtinDefinitions(nextFilters);
        setDefinitions(fallback);
        setFilters(nextFilters);
        setStorageUnavailable(true);
        setError(errorState({ ...loadError, message: LOCAL_STORAGE_MESSAGE }, LOCAL_STORAGE_MESSAGE));
        return { definitions: fallback, local: true };
      }
      if (loadError?.name !== "AbortError") setError(errorState(loadError, "数据口径目录加载失败。"));
      throw loadError;
    } finally {
      if (definitionRequest.current === controller) setLoading(false);
    }
  }, [enabled, filters]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    const timer = setTimeout(() => loadDefinitions({ status: "active" }).catch(() => {}), 250);
    return () => {
      clearTimeout(timer);
      definitionRequest.current?.abort();
    };
  }, [enabled]);

  const loadDefinition = useCallback(async id => {
    if (storageUnavailable) {
      const fallback = BUILTIN_DEFINITIONS.find(definition => definition.id === id) || null;
      setDetail(fallback);
      return fallback;
    }
    try {
      const payload = await loadDataStandard(id);
      setDetail(payload.definition || null);
      return payload.definition || null;
    } catch (loadError) {
      if (loadError?.status !== 501) throw loadError;
      const fallback = BUILTIN_DEFINITIONS.find(definition => definition.id === id) || null;
      setStorageUnavailable(true);
      setError(errorState({ ...loadError, message: LOCAL_STORAGE_MESSAGE }, LOCAL_STORAGE_MESSAGE));
      setDetail(fallback);
      return fallback;
    }
  }, [storageUnavailable]);

  const runWrite = useCallback(async operation => {
    setSaving(true);
    setError(null);
    try {
      const payload = await runAuthorizedDataStandardsWrite(canWrite, operation);
      await loadDefinitions(filters);
      if (payload.definition) setDetail(payload.definition);
      return payload;
    } catch (writeError) {
      setError(errorState(writeError));
      throw writeError;
    } finally {
      setSaving(false);
    }
  }, [canWrite, filters, loadDefinitions]);

  const createDefinition = useCallback(input => runWrite(() => createDataStandard(input)), [runWrite]);
  const publishVersion = useCallback((id, input) => runWrite(() => publishDataStandardVersion(id, input)), [runWrite]);
  const archiveDefinition = useCallback((id, input) => runWrite(() => archiveDataStandard(id, input)), [runWrite]);
  const previewDefinition = useCallback(input => runWrite(() => previewDataStandard(input)), [runWrite]);
  const recalculate = useCallback(input => runWrite(async () => {
    resultRequest.current?.abort();
    const controller = new AbortController();
    resultRequest.current = controller;
    const requested = await requestMetricCalculation({ ...input, mode: "explicit_recalculation", confirmed: true }, fetch, controller.signal);
    setRun(requested.run || null);
    const completed = await pollMetricResults({ metricCodes: input.metricCodes, from: input.from, to: input.to, runId: requested.run.id }, {
      signal: controller.signal,
      interval: 800,
      maxAttempts: 20
    });
    setResults(completed.results || []);
    setRun(completed.run || requested.run || null);
    if (completed.run?.status === "failed") {
      throw new DataStandardsApiError("数据口径重算失败，请稍后重试。", {
        status: 500,
        code: completed.run.errorCode || "DATA_STANDARD_CALCULATION_FAILED",
        retryable: true
      });
    }
    return completed;
  }), [runWrite]);

  const ensureResults = useCallback(async (range, metricCodes) => {
    if (!enabled) return { results: [] };
    resultRequest.current?.abort();
    const controller = new AbortController();
    resultRequest.current = controller;
    const query = { metricCodes, from: range.from, to: range.to };
    setResultLoading(true);
    try {
      const current = await loadMetricResults(query, fetch, controller.signal);
      const availableCodes = new Set((current.results || []).map(result => result.metricCode));
      if (metricCodes.every(code => availableCodes.has(code))) {
        setResults(current.results || []);
        setRun(current.run || null);
        setError(null);
        return current;
      }
      const requested = await requestMetricCalculation({ ...query, targetVersions: {}, mode: "ensure_current" }, fetch, controller.signal);
      setRun(requested.run || null);
      const completed = await pollMetricResults({ ...query, runId: requested.run.id }, { signal: controller.signal, interval: 800, maxAttempts: 20 });
      setResults(completed.results || []);
      setRun(completed.run || requested.run || null);
      if (completed.run?.status === "failed") {
        throw new DataStandardsApiError("数据口径计算失败，请稍后重试。", {
          status: 500,
          code: completed.run.errorCode || "DATA_STANDARD_CALCULATION_FAILED",
          retryable: true
        });
      }
      setError(null);
      return completed;
    } catch (resultError) {
      if (resultError?.name !== "AbortError") setError(errorState(resultError, "数据口径结果加载失败。"));
      throw resultError;
    } finally {
      if (resultRequest.current === controller) setResultLoading(false);
    }
  }, [enabled]);

  const scheduleEnsureResults = useCallback((range, metricCodes) => {
    clearTimeout(resultDebounce.current);
    resultRequest.current?.abort();
    resultDebounce.current = setTimeout(() => ensureResults(range, metricCodes).catch(() => {}), 250);
  }, [ensureResults]);

  useEffect(() => () => {
    clearTimeout(resultDebounce.current);
    definitionRequest.current?.abort();
    resultRequest.current?.abort();
  }, []);

  const value = useMemo(() => ({
    definitions,
    filters,
    detail,
    results,
    run,
    resultLoading,
    loading,
    saving,
    error,
    storageUnavailable,
    canWrite,
    canTransferOwner: actor.executive,
    ownerDepartments,
    canManageDefinition,
    setFilters,
    loadDefinitions,
    loadDefinition,
    createDefinition,
    publishVersion,
    archiveDefinition,
    previewDefinition,
    recalculate,
    ensureResults,
    scheduleEnsureResults,
    clearError: () => setError(null)
  }), [actor.executive, archiveDefinition, canManageDefinition, canWrite, createDefinition, definitions, detail, ensureResults, error, filters, loadDefinition, loadDefinitions, loading, ownerDepartments, previewDefinition, publishVersion, recalculate, resultLoading, results, run, saving, scheduleEnsureResults, storageUnavailable]);

  return <DataStandardsContext.Provider value={value}>{children}</DataStandardsContext.Provider>;
}

export function useDataStandards() {
  const context = useContext(DataStandardsContext);
  if (!context) throw new Error("useDataStandards must be used inside DataStandardsProvider");
  return context;
}
