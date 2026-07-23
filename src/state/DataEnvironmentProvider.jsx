import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { loadDataEnvironment, switchDataEnvironment } from "./dataEnvironmentApi.js";
import { activateDataEnvironment } from "./dataEnvironmentClient.js";

const DataEnvironmentContext = createContext(null);
const PRODUCTION_ENVIRONMENT = {
  current: { id: "production", version: 1, versionRequired: false },
  display: { enabled: false, status: "empty", version: 1 },
  permissions: { canManage: false }
};

function normalizeEnvironment(payload = {}) {
  return {
    current: {
      id: payload.current?.id === "display" ? "display" : "production",
      version: Math.max(1, Number(payload.current?.version || 1)),
      versionRequired: Boolean(payload.current?.versionRequired)
    },
    display: {
      enabled: Boolean(payload.display?.enabled),
      status: String(payload.display?.status || "empty"),
      version: Math.max(1, Number(payload.display?.version || 1)),
      activeJobId: String(payload.display?.activeJobId || ""),
      ruleVersion: String(payload.display?.ruleVersion || ""),
      sourceUpdatedAt: String(payload.display?.sourceUpdatedAt || ""),
      coverage: payload.display?.coverage || {},
      validation: payload.display?.validation || {},
      lastErrorCode: String(payload.display?.lastErrorCode || ""),
      lastUpdatedAt: String(payload.display?.lastUpdatedAt || "")
    },
    permissions: { canManage: Boolean(payload.permissions?.canManage) }
  };
}

export function DataEnvironmentProvider({ children }) {
  const { user } = useAuth();
  const [environment, setEnvironment] = useState(PRODUCTION_ENVIRONMENT);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [lastSwitchAt, setLastSwitchAt] = useState(0);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (user?.role !== "executive") {
      activateDataEnvironment(PRODUCTION_ENVIRONMENT.current);
      setEnvironment(PRODUCTION_ENVIRONMENT);
      setError("");
      setReady(true);
      setLoading(false);
      return PRODUCTION_ENVIRONMENT;
    }
    setLoading(true);
    try {
      const next = normalizeEnvironment(await loadDataEnvironment());
      activateDataEnvironment(next.current);
      setEnvironment(next);
      setError("");
      setReady(true);
      return next;
    } catch (loadError) {
      setError(loadError?.message || "数据环境读取失败，请重试。");
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const switchEnvironment = useCallback(async environmentId => {
    if (environmentId === environment.current.id) return environment;
    setSwitching(true);
    setError("");
    try {
      const next = normalizeEnvironment(await switchDataEnvironment(environmentId));
      activateDataEnvironment(next.current);
      setEnvironment(next);
      setLastSwitchAt(Date.now());
      return next;
    } catch (switchError) {
      setError(switchError?.message || "数据环境切换失败，请重试。");
      throw switchError;
    } finally {
      setSwitching(false);
    }
  }, [environment]);

  const value = useMemo(() => ({
    ...environment,
    loading,
    switching,
    error,
    lastSwitchAt,
    refresh,
    switchEnvironment
  }), [environment, error, lastSwitchAt, loading, refresh, switchEnvironment, switching]);

  if (loading) {
    return (
      <main className="auth-screen" aria-busy="true" aria-live="polite">
        <div className="auth-loading" role="status">
          <span className="auth-brand-mark" aria-hidden="true">P</span>
          <span><strong>正在读取数据环境</strong><small>正在连接当前账号的业务数据</small></span>
        </div>
      </main>
    );
  }
  if (!ready) {
    return (
      <main className="auth-screen">
        <div className="auth-loading" role="alert">
          <span className="auth-brand-mark" aria-hidden="true">!</span>
          <span><strong>数据环境读取失败</strong><small>{error}</small></span>
          <button className="btn primary" type="button" onClick={() => refresh().catch(() => {})}>重新读取</button>
        </div>
      </main>
    );
  }

  return (
    <DataEnvironmentContext.Provider value={value}>
      <Fragment key={`${environment.current.id}:${environment.current.version}`}>{children}</Fragment>
    </DataEnvironmentContext.Provider>
  );
}

export function useDataEnvironment() {
  const context = useContext(DataEnvironmentContext);
  if (!context) throw new Error("useDataEnvironment must be used inside DataEnvironmentProvider");
  return context;
}
