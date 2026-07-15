import { useAuth } from "../../state/AuthProvider.jsx";
import { LoginPage } from "./LoginPage.jsx";

export function AuthGate({ children }) {
  const { status, error, retry } = useAuth();
  if (status === "checking") {
    return (
      <main className="auth-screen" aria-busy="true" aria-live="polite">
        <div className="auth-loading" role="status">
          <span className="auth-brand-mark" aria-hidden="true">P</span>
          <span><strong>正在验证钉钉账号</strong><small>正在连接企业组织与共享数据</small></span>
        </div>
      </main>
    );
  }
  if (status === "authenticated") return children;
  return <LoginPage error={status === "error" ? error : ""} onRetry={retry} />;
}
