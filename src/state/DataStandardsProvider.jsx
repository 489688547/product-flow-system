import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { canEditFeature } from "../domain/permissions.js";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const definitionRequest = useRef(null);
  const resultRequest = useRef(null);
  const resultDebounce = useRef(null);
  const canWrite = enabled && currentUser?.role !== "readonly" && currentUser?.readonly !== true
    && canEditFeature(productState.permissions, currentUser, "dataCenter");

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
      setError(null);
      return payload;
    } catch (loadError) {
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
    const payload = await loadDataStandard(id);
    setDetail(payload.definition || null);
    return payload.definition || null;
  }, []);

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
    loading,
    saving,
    error,
    canWrite,
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
  }), [archiveDefinition, canWrite, createDefinition, definitions, detail, ensureResults, error, filters, loadDefinition, loadDefinitions, loading, previewDefinition, publishVersion, recalculate, results, run, saving, scheduleEnsureResults]);

  return <DataStandardsContext.Provider value={value}>{children}</DataStandardsContext.Provider>;
}

export function useDataStandards() {
  const context = useContext(DataStandardsContext);
  if (!context) throw new Error("useDataStandards must be used inside DataStandardsProvider");
  return context;
}
