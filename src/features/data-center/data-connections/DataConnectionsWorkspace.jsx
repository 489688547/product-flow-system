import { AlertTriangle, ChevronRight, LoaderCircle, Plus, RefreshCw, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import douyinLogo from "../../../assets/connectors/douyin.svg";
import { connectionDisplayState } from "../../../domain/dataConnections.js";
import { loadDataConnections } from "../../../state/dataConnectionsApi.js";
import { Button } from "../../../ui/Button.jsx";
import { DouyinConnectionDialog } from "./DouyinConnectionDialog.jsx";
import "./data-connections.css";

function ShopAvatar({ src }) {
  const [failed, setFailed] = useState(false);
  return <img className="data-connection-avatar" src={!failed && src ? src : douyinLogo} alt="" onError={() => setFailed(true)} />;
}

function LoadingRows() {
  return <div className="data-connection-loading" aria-busy="true" aria-label="正在加载数据连接">{[0, 1].map(item => <span key={item} />)}</div>;
}

export function DataConnectionsWorkspace({ canEdit = false }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const addButtonRef = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const payload = await loadDataConnections();
      setConnections(payload.connections || []);
    } catch (nextError) {
      setError(nextError?.message || "数据连接暂时无法读取。");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const pending = connections.some(item => !["connected", "failed", "disabled"].includes(item.status));
    if (!pending) return undefined;
    const interval = window.setInterval(() => load({ quiet: true }), 10_000);
    return () => window.clearInterval(interval);
  }, [connections, load]);

  const rows = useMemo(() => connections.flatMap(connection => {
    if (!connection.shops?.length) return [{ key: connection.id, connection, shop: null }];
    return connection.shops.map(shop => ({ key: `${connection.id}:${shop.shopId}`, connection, shop }));
  }), [connections]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openExisting(connection) {
    setEditing(connection);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }

  function handleSaved(saved) {
    setConnections(current => {
      const exists = current.some(item => item.id === saved.id);
      return exists ? current.map(item => item.id === saved.id ? { ...item, ...saved } : item) : [saved, ...current];
    });
  }

  return (
    <div className="automated-connections-workspace">
      <section className="section-panel data-connection-provider">
        <div className="data-connection-provider-identity">
          <img src={douyinLogo} alt="" />
          <div><h2>抖音电商</h2><p>保存账号后，公司 Mac 会打开抖音后台完成登录确认。</p></div>
        </div>
        <Button ref={addButtonRef} variant="primary" onClick={openNew} disabled={!canEdit} disabledReason="当前身份不能添加店铺"><Plus size={16} aria-hidden="true" />添加店铺</Button>
      </section>

      <section className="section-panel data-connection-instances">
        <div className="section-head">
          <div><h2>已接入店铺</h2><p>识别完成后这里只显示店铺头像、名称和连接状态。</p></div>
          <Button onClick={() => load()} disabled={loading}><RefreshCw size={16} aria-hidden="true" />刷新</Button>
        </div>
        {loading ? <LoadingRows /> : error ? (
          <div className="data-connection-error" role="alert"><AlertTriangle size={19} aria-hidden="true" /><span>{error}</span><Button onClick={() => load()}>重新加载</Button></div>
        ) : rows.length ? (
          <div className="data-connection-list">
            {rows.map(({ key, connection, shop }) => {
              const state = connectionDisplayState(connection);
              return (
                <button type="button" key={key} className="data-connection-row" onClick={() => openExisting(connection)} disabled={!canEdit}>
                  <ShopAvatar src={shop?.shopAvatarUrl} />
                  <span className="data-connection-name"><strong>{shop?.shopName || connection.loginEmail}</strong>{shop ? null : <small>等待识别店铺名称</small>}</span>
                  <span className={`data-connection-status ${state.tone}`}>{connection.status === "recognizing" ? <LoaderCircle size={15} aria-hidden="true" /> : <Store size={15} aria-hidden="true" />}{state.label}</span>
                  {canEdit ? <ChevronRight size={17} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="data-connection-empty"><img src={douyinLogo} alt="" /><div><strong>还没有抖音店铺</strong><p>添加邮箱和密码后，公司 Mac 会自动打开登录页并识别店铺。</p></div>{canEdit ? <Button variant="primary" onClick={openNew}>添加店铺</Button> : null}</div>
        )}
      </section>

      <DouyinConnectionDialog open={dialogOpen} connection={editing} onClose={closeDialog} onSaved={handleSaved} />
    </div>
  );
}
