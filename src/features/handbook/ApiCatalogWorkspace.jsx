import {
  Check,
  Clipboard,
  Code2,
  FileText,
  Play,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { filterApiEndpoints } from "../../domain/apiCatalog.js";
import { runApiLiveTest } from "../../state/apiCatalogApi.js";
import { MarkdownDocument } from "./MarkdownDocument.jsx";
import "./api-catalog.css";

const STATUS_LABELS = {
  connected: "已接通",
  integrating: "接入中",
  unavailable: "暂无数据",
  deprecated: "已退役"
};

const METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const pretty = value => JSON.stringify(value, null, 2);

function requestText(endpoint) {
  const query = endpoint.requestExample?.query || {};
  const search = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)])
  ).toString();
  const firstLine = `${endpoint.method} ${endpoint.path}${search ? `?${search}` : ""}`;
  const details = {
    ...(endpoint.requestExample?.headers ? { headers: endpoint.requestExample.headers } : {}),
    ...(endpoint.requestExample?.body ? { body: endpoint.requestExample.body } : {})
  };
  return Object.keys(details).length ? `${firstLine}\n\n${pretty(details)}` : firstLine;
}

function CodeExample({ title, value, copyLabel, onCopy, copied }) {
  return (
    <section className="api-example">
      <header>
        <strong>{title}</strong>
        <button type="button" onClick={onCopy}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
          {copied ? "已复制" : copyLabel}
        </button>
      </header>
      <pre tabIndex="0"><code>{value}</code></pre>
    </section>
  );
}

export function ApiCatalogWorkspace({ registry, contractLoaders = {}, query = "" }) {
  const [appId, setAppId] = useState("all");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(registry.endpoints[0]?.id ?? "");
  const [copied, setCopied] = useState("");
  const [params, setParams] = useState({});
  const [liveState, setLiveState] = useState({ status: "idle", result: null, error: null });
  const [contractState, setContractState] = useState({
    status: "idle",
    content: "",
    error: ""
  });
  const endpoints = useMemo(
    () => filterApiEndpoints(registry.endpoints, { query, appId, method, status }),
    [appId, method, query, registry.endpoints, status]
  );
  const selected = endpoints.find(endpoint => endpoint.id === selectedId) ?? endpoints[0] ?? null;
  const contractSlug = selected ? `api/${selected.contract.replace(/\.md$/, "")}` : "";

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setParams(selected.requestExample?.query || {});
    setLiveState({ status: "idle", result: null, error: null });
    setContractState({ status: "idle", content: "", error: "" });
  }, [selected?.id]);

  const copy = async (key, value) => {
    await globalThis.navigator?.clipboard?.writeText?.(value);
    setCopied(key);
    globalThis.setTimeout?.(() => setCopied(""), 1500);
  };

  const testLive = async () => {
    if (!selected?.liveTest?.enabled) return;
    setLiveState({ status: "loading", result: null, error: null });
    try {
      const result = await runApiLiveTest({ endpoint: selected, params });
      setLiveState({ status: "success", result, error: null });
    } catch (error) {
      setLiveState({
        status: "error",
        result: null,
        error: { code: error?.code || "API_LIVE_TEST_FAILED", message: error?.message || "接口实测失败。" }
      });
    }
  };

  const loadContract = async () => {
    const loader = contractLoaders[contractSlug];
    if (!loader) {
      setContractState({ status: "error", content: "", error: "完整契约文件不可用。" });
      return;
    }
    setContractState({ status: "loading", content: "", error: "" });
    try {
      setContractState({ status: "success", content: await loader(), error: "" });
    } catch {
      setContractState({ status: "error", content: "", error: "完整契约加载失败。" });
    }
  };

  return (
    <div className="api-catalog-workspace">
      <header className="api-catalog-intro">
        <div>
          <span><Code2 size={15} aria-hidden="true" /> 公司 API 契约</span>
          <h1>按 App 浏览</h1>
          <p>查看当前真实输入、输出、权限和错误。仅登记的同源 GET 可安全实测，写接口只展示可复制示例。</p>
        </div>
        <div className="api-catalog-count">
          <strong>{registry.endpoints.length}</strong>
          <span>个已登记接口</span>
        </div>
      </header>

      <div className="api-catalog-filters">
        <label>
          <span>App</span>
          <select value={appId} onChange={event => setAppId(event.target.value)}>
            <option value="all">全部 App</option>
            {registry.apps.map(app => <option key={app.id} value={app.id}>{app.label}</option>)}
          </select>
        </label>
        <label>
          <span>方法</span>
          <select value={method} onChange={event => setMethod(event.target.value)}>
            <option value="all">全部方法</option>
            {METHOD_ORDER.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>状态</span>
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="all">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <div className="api-catalog-safety">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>仅 GET 可安全实测</span>
        </div>
      </div>

      <div className="api-catalog-body">
        <nav className="api-endpoint-list" aria-label="API 接口目录">
          <div className="api-endpoint-list-meta">
            <strong>{endpoints.length}</strong>
            <span>个匹配接口</span>
          </div>
          {endpoints.length ? endpoints.map(endpoint => (
            <button
              type="button"
              key={endpoint.id}
              className={selected?.id === endpoint.id ? "active" : ""}
              aria-current={selected?.id === endpoint.id ? "page" : undefined}
              onClick={() => setSelectedId(endpoint.id)}
            >
              <span>
                <b data-method={endpoint.method}>{endpoint.method}</b>
                <em data-status={endpoint.status}>{STATUS_LABELS[endpoint.status]}</em>
              </span>
              <strong>{endpoint.title}</strong>
              <code>{endpoint.path}</code>
            </button>
          )) : (
            <div className="api-catalog-empty">
              <FileText size={20} aria-hidden="true" />
              <strong>没有匹配接口</strong>
              <span>调整 App、方法、状态或搜索词。</span>
            </div>
          )}
        </nav>

        {selected ? (
          <article className="api-endpoint-detail">
            <header className="api-endpoint-header">
              <div className="api-endpoint-badges">
                <b data-method={selected.method}>{selected.method}</b>
                <span data-status={selected.status}>{STATUS_LABELS[selected.status]}</span>
              </div>
              <h2>{selected.title}</h2>
              <code>{selected.path}</code>
              <p>{selected.summary}</p>
            </header>

            <dl className="api-contract-basics">
              <div><dt>认证</dt><dd>{selected.auth}</dd></div>
              <div><dt>权限</dt><dd>{selected.permission}</dd></div>
              <div><dt>契约来源</dt><dd>{selected.contract}</dd></div>
            </dl>

            <CodeExample
              title="Input · 请求"
              value={requestText(selected)}
              copyLabel="复制请求示例"
              copied={copied === "request"}
              onCopy={() => copy("request", requestText(selected))}
            />
            <CodeExample
              title="Output · 成功响应"
              value={pretty(selected.responseExample)}
              copyLabel="复制响应示例"
              copied={copied === "response"}
              onCopy={() => copy("response", pretty(selected.responseExample))}
            />

            <section className="api-error-codes">
              <h3>稳定错误码</h3>
              {selected.errors.length ? (
                <ul>{selected.errors.map(code => <li key={code}><code>{code}</code></li>)}</ul>
              ) : <p>当前契约未登记业务错误码。</p>}
            </section>

            <section className="api-live-test" aria-live="polite">
              <header>
                <div>
                  <h3>当前会话实测</h3>
                  <p>使用当前登录身份和当前数据环境；不保存响应。</p>
                </div>
                <button
                  type="button"
                  disabled={!selected.liveTest.enabled || liveState.status === "loading"}
                  onClick={testLive}
                >
                  <Play size={14} aria-hidden="true" />
                  {liveState.status === "loading" ? "测试中…" : "测试 GET"}
                </button>
              </header>
              {selected.liveTest.enabled && selected.liveTest.query.length ? (
                <div className="api-live-params">
                  {selected.liveTest.query.map(key => (
                    <label key={key}>
                      <span>{key}</span>
                      <input
                        value={params[key] ?? ""}
                        onChange={event => setParams(current => ({ ...current, [key]: event.target.value }))}
                        placeholder="可选"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              {!selected.liveTest.enabled ? (
                <div className="api-live-disabled">
                  <ShieldCheck size={16} aria-hidden="true" />
                  写接口不会从说明书执行，请复制示例后在受控客户端调用。
                </div>
              ) : null}
              {liveState.status === "error" ? (
                <div className="api-live-error">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <div><strong>{liveState.error.code}</strong><span>{liveState.error.message}</span></div>
                </div>
              ) : null}
              {liveState.result ? (
                <div className="api-live-result">
                  <div>
                    <span>HTTP <strong>{liveState.result.status}</strong></span>
                    <span>{liveState.result.durationMs} ms</span>
                    <span>{liveState.result.dataEnvironment || "环境未返回"}</span>
                    <span>{liveState.result.requestId || "无 requestId"}</span>
                  </div>
                  <pre tabIndex="0"><code>{pretty(liveState.result.body)}</code></pre>
                  {liveState.result.truncated ? <small>响应已按安全预览上限截断。</small> : null}
                </div>
              ) : null}
            </section>

            <section className="api-contract-source">
              <button
                type="button"
                onClick={loadContract}
                disabled={contractState.status === "loading"}
              >
                {contractState.status === "loading" ? "加载中…" : "加载完整契约说明"}
              </button>
              {contractState.error ? <p role="alert">{contractState.error}</p> : null}
              {contractState.content ? <MarkdownDocument content={contractState.content} /> : null}
            </section>
          </article>
        ) : null}
      </div>
    </div>
  );
}
