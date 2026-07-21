import { useCallback, useEffect, useState } from "react";
import {
  disablePlatformConnection,
  loadPlatformConnections,
  savePlatformConnection
} from "./platformConnectionsApi.js";

export function usePlatformConnections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const replaceConnection = useCallback(next => {
    setConnections(current => [
      ...current.filter(item => item.platformId !== next.platformId),
      next
    ]);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await loadPlatformConnections();
      setConnections(payload.connections || []);
      return payload.connections || [];
    } catch (nextError) {
      setError(nextError?.message || "平台连接暂时无法读取。");
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const save = useCallback(async input => (
    replaceConnection(await savePlatformConnection(input))
  ), [replaceConnection]);

  const disable = useCallback(async input => (
    replaceConnection(await disablePlatformConnection(input))
  ), [replaceConnection]);

  return { connections, loading, error, refresh, save, disable };
}
