import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LockKeyhole, X } from "lucide-react";
import { Button } from "../../../ui/Button.jsx";

const METHOD_LABELS = { api: "API 接口", browser: "网页登录", export: "文件导出" };
const ACCOUNT_TYPE_LABELS = {
  shop: "店铺",
  advertiser: "广告账户",
  qianchuan: "巨量千川",
  tmall: "天猫店铺",
  taobao: "淘宝店铺",
  chengfeng: "乘风账户",
  erp: "ERP 账户"
};
const DATASET_LABELS = {
  orders: "订单",
  products: "商品",
  "shop-performance": "店铺经营",
  campaigns: "广告计划",
  materials: "广告素材",
  "advertising-performance": "投放效果",
  inventory: "库存",
  sales: "销售"
};

function initialDraft(definition, instance) {
  return {
    id: instance?.id || "",
    connectorId: definition.id,
    name: instance?.name || "",
    companySubject: instance?.companySubject || "",
    accountType: instance?.accountType || definition.accountTypes[0] || "",
    captureMethod: instance?.captureMethod || definition.methods[0],
    consoleUrl: instance?.consoleUrl || "",
    datasets: instance?.datasets || [],
    owner: instance?.owner || "运营部",
    credentialEntryId: instance?.credentialEntryId || "",
    version: instance?.version || 0,
    enabled: instance?.enabled !== false
  };
}

export function ConnectorConfigDialog({ definition, instance, credentialMetadata, onSave, onClose }) {
  const [draft, setDraft] = useState(() => initialDraft(definition, instance));
  const [secretValues, setSecretValues] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef(null);
  const titleId = `connector-dialog-${definition.id}`;

  useEffect(() => {
    setDraft(initialDraft(definition, instance));
    setSecretValues({});
    setError("");
  }, [definition, instance]);

  useEffect(() => {
    const sheet = sheetRef.current;
    const first = sheet?.querySelector("input, select, button");
    first?.focus();
    const keydown = event => {
      if (event.key === "Escape" && !saving) onClose();
      if (event.key !== "Tab" || !sheet) return;
      const focusable = [...sheet.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")];
      if (!focusable.length) return;
      const firstItem = focusable[0];
      const lastItem = focusable.at(-1);
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose, saving]);

  const visibleFields = useMemo(() => definition.fields.filter(field => (
    !field.methods || field.methods.includes(draft.captureMethod)
  )), [definition.fields, draft.captureMethod]);

  const toggleDataset = dataset => setDraft(current => ({
    ...current,
    datasets: current.datasets.includes(dataset)
      ? current.datasets.filter(item => item !== dataset)
      : [...current.datasets, dataset]
  }));

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ instance: draft, secretPayload: secretValues });
      setSecretValues({});
      onClose();
    } catch (saveError) {
      setError(saveError.message || "连接保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="modal-sheet large connector-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={sheetRef} onSubmit={submit}>
        <header className="modal-header">
          <div><span>平台专属连接</span><h2 id={titleId}>{instance ? `管理${definition.name}` : `添加${definition.name}`}</h2></div>
          <button className="modal-close" type="button" onClick={onClose} disabled={saving} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body connector-dialog-body">
          <section className="connector-dialog-intro">
            <LockKeyhole size={20} /><div><strong>敏感信息会在服务端加密保存</strong><p>验证码不会被保存；遇到扫码、短信、滑块或设备确认时，任务会进入“等待人工验证”。</p></div>
          </section>
          {error ? <div className="connector-form-error" role="alert">{error}</div> : null}
          <div className="connector-form-grid">
            <label>连接名称<input required maxLength={120} value={draft.name} placeholder={`${definition.name}账号或店铺名称`} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
            <label>公司主体<input maxLength={160} value={draft.companySubject} onChange={event => setDraft(current => ({ ...current, companySubject: event.target.value }))} /></label>
            {definition.accountTypes.length ? <label>账户类型<select value={draft.accountType} onChange={event => setDraft(current => ({ ...current, accountType: event.target.value }))}>{definition.accountTypes.map(type => <option key={type} value={type}>{ACCOUNT_TYPE_LABELS[type] || type}</option>)}</select></label> : null}
            <label>接入方式<select value={draft.captureMethod} onChange={event => setDraft(current => ({ ...current, captureMethod: event.target.value }))}>{definition.methods.map(method => <option key={method} value={method}>{METHOD_LABELS[method]}</option>)}</select></label>
            <label className="full">后台地址<input type="url" value={draft.consoleUrl} placeholder="https://" onChange={event => setDraft(current => ({ ...current, consoleUrl: event.target.value }))} /></label>
            <label>负责人<input maxLength={120} value={draft.owner} onChange={event => setDraft(current => ({ ...current, owner: event.target.value }))} /></label>
            {visibleFields.map(field => (
              <label key={field.key}>{field.label}
                <input
                  type={field.type === "password" || field.type === "secret" ? "password" : field.type === "email" ? "email" : "text"}
                  value={secretValues[field.key] || ""}
                  required={field.required && !credentialMetadata?.hasSecret}
                  maxLength={field.maxLength}
                  autoComplete="new-password"
                  placeholder={credentialMetadata?.hasSecret && field.sensitive ? "已加密保存；留空表示不替换" : ""}
                  onChange={event => setSecretValues(current => ({ ...current, [field.key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <fieldset className="connector-datasets"><legend>同步数据</legend>{definition.datasets.map(dataset => <label key={dataset}><input type="checkbox" checked={draft.datasets.includes(dataset)} onChange={() => toggleDataset(dataset)} />{DATASET_LABELS[dataset] || dataset}</label>)}</fieldset>
          <div className="connector-verification-note"><AlertTriangle size={17} /><p><strong>首次保存状态：等待首次验证</strong>。保存配置不会直接标记为已接通；真实验证需要后续平台适配器或公司 Mac 采集器。</p></div>
        </div>
        <footer className="modal-footer"><Button type="button" onClick={onClose} disabled={saving}>取消</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "正在加密保存…" : "保存并验证"}</Button></footer>
      </form>
    </div>
  );
}
