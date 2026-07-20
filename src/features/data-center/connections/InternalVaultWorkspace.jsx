import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, Copy, KeyRound, LockKeyhole, Plus, Server, X } from "lucide-react";
import { INTERNAL_VAULT_TYPES } from "../../../domain/dataCenterConnectors.js";
import { Button } from "../../../ui/Button.jsx";

const VAULT_TYPE_LABELS = {
  nas: "NAS",
  email: "邮箱",
  finance: "财务系统",
  "government-saas": "政务 / SaaS",
  custom: "自定义内部系统"
};

const PROTOCOLS = ["HTTPS", "SMB", "WebDAV", "IMAP/SMTP", "其他"];

function emptyDraft(type) {
  return { itemType: type, name: "", companySubject: "", location: "", address: "", protocol: "HTTPS", resourcePath: "", owner: "", purpose: "", reviewDate: "", credentialEntryId: "", version: 0 };
}

export function InternalVaultWorkspace({
  items = [],
  vaultEntries = [],
  canManage = false,
  onSave,
  onReveal,
  initialType = "nas",
  visibleTypes = INTERNAL_VAULT_TYPES.map(item => item.id),
  onBack
}) {
  const allowedTypes = INTERNAL_VAULT_TYPES.filter(type => visibleTypes.includes(type.id));
  const [selectedType, setSelectedType] = useState(
    allowedTypes.some(type => type.id === initialType) ? initialType : allowedTypes[0]?.id || "nas"
  );
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(() => emptyDraft("nas"));
  const [secrets, setSecrets] = useState({ username: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revealTarget, setRevealTarget] = useState(null);
  const [revealPurpose, setRevealPurpose] = useState("");
  const [revealed, setRevealed] = useState(null);

  useEffect(() => {
    if (!revealed) return undefined;
    const timer = setTimeout(() => setRevealed(null), 60000);
    return () => clearTimeout(timer);
  }, [revealed]);

  const filtered = useMemo(() => items.filter(item => item.itemType === selectedType), [items, selectedType]);
  const metadataFor = item => vaultEntries.find(entry => entry.id === item.credentialEntryId);

  const openEditor = (type, item = null) => {
    setEditing(item || { itemType: type });
    setDraft(item ? { ...item } : emptyDraft(type));
    setSecrets({ username: "", password: "" });
    setError("");
  };

  const closeEditor = () => {
    setEditing(null);
    setSecrets({ username: "", password: "" });
    setError("");
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ item: draft, secretPayload: Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim())) });
      closeEditor();
    } catch (saveError) {
      setError(saveError.message || "保险箱条目保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const reveal = async event => {
    event.preventDefault();
    setError("");
    try {
      const payload = await onReveal(revealTarget.credentialEntryId, revealPurpose, "查看加密凭证");
      setRevealed({ item: revealTarget, values: payload.secretPayload, revealedAt: payload.revealedAt });
      setRevealTarget(null);
      setRevealPurpose("");
    } catch (revealError) {
      setError(revealError.message || "凭证查看失败。");
    }
  };

  return (
    <div className={`internal-vault${allowedTypes.length === 1 ? " single-type" : ""}`}>
      {onBack ? <button type="button" className="platform-connection-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />返回公司数据</button> : null}
      <section className="internal-vault-hero">
        <div><LockKeyhole size={20} /><span><strong>公司数据</strong><small>敏感信息加密保存，查看与复制全程留痕。</small></span></div>
        <span className="status-badge neutral">仅授权人员</span>
      </section>
      {allowedTypes.length > 1 ? <div className="internal-vault-types" role="tablist" aria-label="公司数据类型">
        {allowedTypes.map(type => <button key={type.id} type="button" role="tab" aria-selected={selectedType === type.id} onClick={() => setSelectedType(type.id)}><Server size={17} /><span>{VAULT_TYPE_LABELS[type.id]}<small>{type.description}</small></span></button>)}
      </div> : null}
      <section className="section-panel internal-vault-list">
        <div className="section-head"><div><h2>{VAULT_TYPE_LABELS[selectedType]}</h2><p>列表只显示非敏感元数据，不显示用户名、密码长度或 Token 前缀。</p></div>{canManage ? <Button variant="primary" onClick={() => openEditor(selectedType)}><Plus size={15} />添加条目</Button> : <span className="status-badge neutral">只读</span>}</div>
        {error ? <div className="connector-form-error" role="alert">{error}</div> : null}
        {filtered.length ? <div className="internal-vault-rows">{filtered.map(item => {
          const credential = metadataFor(item);
          return <article key={item.id}><div><Archive size={18} /><span><strong>{item.name}</strong><small>{[item.location, item.protocol, item.address].filter(Boolean).join(" · ") || "未补充位置与地址"}</small></span></div><span className={`status-badge ${credential?.hasSecret ? "success" : "warning"}`}>{credential?.hasSecret ? "凭证已加密" : "尚无凭证"}</span><div className="internal-vault-actions">{canManage ? <button type="button" onClick={() => openEditor(item.itemType, item)}>编辑</button> : null}{canManage && credential?.hasSecret ? <button type="button" onClick={() => setRevealTarget(item)}><KeyRound size={14} />查看加密凭证</button> : null}</div></article>;
        })}</div> : <div className="empty-state compact-empty">当前类型还没有保险箱条目。</div>}
      </section>

      {editing ? <div className="modal-layer" role="presentation"><form className="modal-sheet small connector-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-editor-title" onSubmit={submit}><header className="modal-header"><div><span>内部系统</span><h2 id="vault-editor-title">{editing.id ? "编辑" : "添加"}{VAULT_TYPE_LABELS[draft.itemType]}</h2></div><button className="modal-close" type="button" onClick={closeEditor} aria-label="关闭"><X size={18} /></button></header><div className="modal-body connector-dialog-body"><div className="connector-form-grid"><label>名称<input required value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label><label>公司主体<input value={draft.companySubject} onChange={event => setDraft(current => ({ ...current, companySubject: event.target.value }))} /></label><label>地点<input value={draft.location} placeholder="例如：杭州" onChange={event => setDraft(current => ({ ...current, location: event.target.value }))} /></label><label>协议<select value={draft.protocol} onChange={event => setDraft(current => ({ ...current, protocol: event.target.value }))}>{PROTOCOLS.map(protocol => <option key={protocol}>{protocol}</option>)}</select></label><label className="full">地址<input value={draft.address} onChange={event => setDraft(current => ({ ...current, address: event.target.value }))} /></label><label className="full">共享目录 / 资源路径<input value={draft.resourcePath} onChange={event => setDraft(current => ({ ...current, resourcePath: event.target.value }))} /></label><label>负责人<input value={draft.owner} onChange={event => setDraft(current => ({ ...current, owner: event.target.value }))} /></label><label>复核日期<input type="date" value={draft.reviewDate} onChange={event => setDraft(current => ({ ...current, reviewDate: event.target.value }))} /></label><label>用户名 / 登录标识<input autoComplete="off" value={secrets.username} placeholder={metadataFor(draft)?.hasSecret ? "已加密保存；留空不替换" : ""} onChange={event => setSecrets(current => ({ ...current, username: event.target.value }))} /></label><label>密码 / 应用专用密码<input type="password" autoComplete="new-password" value={secrets.password} placeholder={metadataFor(draft)?.hasSecret ? "已加密保存；留空不替换" : ""} onChange={event => setSecrets(current => ({ ...current, password: event.target.value }))} /></label></div><p className="data-security-note">验证码不会被保存；二维码、短信、滑块和设备确认需要人工完成。</p></div><footer className="modal-footer"><Button type="button" onClick={closeEditor}>取消</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "正在加密保存…" : "保存"}</Button></footer></form></div> : null}

      {revealTarget ? <div className="modal-layer" role="presentation"><form className="modal-sheet confirm connector-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-reveal-title" onSubmit={reveal}><header className="modal-header"><h2 id="vault-reveal-title">查看加密凭证</h2><button className="modal-close" type="button" onClick={() => setRevealTarget(null)} aria-label="关闭"><X size={18} /></button></header><div className="modal-body"><p>本次查看将记录条目、操作者、用途和时间，不记录凭证值。登录超过 15 分钟时需要重新登录。</p><label className="vault-reveal-purpose">查看用途<input required maxLength={200} value={revealPurpose} onChange={event => setRevealPurpose(event.target.value)} /></label></div><footer className="modal-footer"><Button type="button" onClick={() => setRevealTarget(null)}>取消</Button><Button type="submit" variant="primary">确认查看</Button></footer></form></div> : null}

      {revealed ? <section className="revealed-credential" role="status"><div><strong>{revealed.item.name} · 明文将在 60 秒后清除</strong><button type="button" onClick={() => setRevealed(null)} aria-label="立即清除"><X size={16} /></button></div>{Object.entries(revealed.values || {}).map(([key, value]) => <p key={key}><span>{key}</span><code>{value}</code><button type="button" onClick={() => navigator.clipboard?.writeText(value)}><Copy size={14} />复制</button></p>)}</section> : null}
    </div>
  );
}
