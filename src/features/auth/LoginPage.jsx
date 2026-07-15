import { ArrowRight, Building2, RefreshCw } from "lucide-react";

export function LoginPage({ error = "", onRetry }) {
  function startDingTalkLogin() {
    window.location.assign("/api/auth/dingtalk/start");
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="auth-title">
        <header className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">P</span>
          <span><strong>产品全周期</strong><small>流程协同系统</small></span>
        </header>
        <div className="auth-copy">
          <span className="auth-context"><Building2 size={16} aria-hidden="true" /> 企业成员登录</span>
          <h1 id="auth-title">使用钉钉扫码登录</h1>
          <p>登录后将按组织架构自动匹配部门、岗位和操作权限。</p>
        </div>
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
        <div className="auth-actions">
          <button className="btn primary auth-login-button" type="button" onClick={startDingTalkLogin}>
            打开钉钉登录 <ArrowRight size={17} aria-hidden="true" />
          </button>
          {error && onRetry ? (
            <button className="btn" type="button" onClick={onRetry}>
              <RefreshCw size={16} aria-hidden="true" /> 重新检查
            </button>
          ) : null}
        </div>
        <small className="auth-note">仅限当前企业在职成员使用</small>
      </section>
    </main>
  );
}
