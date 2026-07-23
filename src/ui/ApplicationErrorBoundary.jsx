import { Component, createRef } from "react";
import { clearCachesAndReload, reloadApplication } from "../state/applicationRecovery.js";

export class ApplicationErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.titleRef = createRef();
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.titleRef.current?.focus();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fatal-error-screen" role="alert" aria-labelledby="fatal-error-title">
        <section className="fatal-error-panel">
          <div className="fatal-error-brand" aria-hidden="true">企</div>
          <div className="fatal-error-copy">
            <span>经营执行平台</span>
            <h1 id="fatal-error-title" ref={this.titleRef} tabIndex={-1}>页面遇到问题</h1>
            <p>应用没有删除线上数据。你可以先重新加载；如果问题持续，再清理本机缓存后重试。</p>
          </div>
          <div className="fatal-error-actions">
            <button type="button" className="btn primary" onClick={() => reloadApplication()}>
              重新加载
            </button>
            <button type="button" className="btn" onClick={() => clearCachesAndReload()}>
              清理本机缓存后重试
            </button>
          </div>
          <small>清理只影响当前浏览器中的本机业务缓存，不会删除线上数据库或其他人的数据。</small>
        </section>
      </div>
    );
  }
}
