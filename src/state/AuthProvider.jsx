import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthSession, logoutAuthSession } from "../domain/authSession.js";
import { detectDingTalkEnvironment, loginWithDingTalkRuntime } from "../domain/dingTalkLogin.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ status: "checking", user: null, error: "" });
  const bootstrapStarted = useRef(false);

  const refreshSession = useCallback(async () => {
    const result = await fetchAuthSession();
    if (result.authenticated && result.user) {
      setAuth({ status: "authenticated", user: result.user, error: "" });
      return result.user;
    }
    setAuth({ status: "anonymous", user: null, error: "" });
    return null;
  }, []);

  const bootstrap = useCallback(async () => {
    setAuth(current => ({ ...current, status: "checking", error: "" }));
    try {
      const sessionUser = await refreshSession();
      if (sessionUser) return;

      const environment = detectDingTalkEnvironment(window);
      if (environment.inDingTalk) {
        await loginWithDingTalkRuntime(window);
        await refreshSession();
        return;
      }
      setAuth({ status: "anonymous", user: null, error: "" });
    } catch (error) {
      setAuth({
        status: "error",
        user: null,
        error: error?.message || "钉钉登录失败，请重试。"
      });
    }
  }, [refreshSession]);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    bootstrap();
  }, [bootstrap]);

  const logout = useCallback(async () => {
    await logoutAuthSession();
    setAuth({ status: "anonymous", user: null, error: "" });
  }, []);

  const value = useMemo(() => ({
    ...auth,
    refreshSession,
    retry: bootstrap,
    logout
  }), [auth, bootstrap, logout, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
