import { CheckCircle2, CloudOff, DatabaseZap, HardDrive, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

export function BrandContentSettingsPage() {
  const { state, saving, dispatch } = useBrandContent();
  const [form, setForm] = useState(state.settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(state.settings), [state.settings]);
  const updatePlatform = (key, field, value) => setForm(current => ({ ...current, [field]: { ...current[field], [key]: Number(value) } }));
  const save = async () => {
    await dispatch({ type: "update_settings", patch: form });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };
  return (
    <section className="page brand-content-page brand-content-settings-page">
      <PageHeader title="品牌内容设置" description="维护判断阈值、内容编号和只读接入状态；外部系统凭据不进入本页面。">
        <Button variant="primary" onClick={save} disabled={saving} disabledReason="正在同步上一项设置"><Save size={16} aria-hidden="true" />{saving ? "正在保存…" : "保存设置"}</Button>
      </PageHeader>
      {saved ? <div className="brand-settings-saved" role="status"><CheckCircle2 size={16} aria-hidden="true" />设置已保存，新判断将使用更新后的阈值。</div> : null}
      <section className="brand-settings-matrix" aria-label="平台判断阈值">
        <header><strong>平台</strong><strong>学习期（完整日）</strong><strong>有效测试阈值（元）</strong><strong>数据接入</strong></header>
        {[["douyin", "抖音"], ["kuaishou", "快手"], ["xiaohongshu", "小红书"]].map(([key, label]) => <div key={key}><strong>{label}</strong><label><span className="sr-only">{label}学习期</span><input type="number" min="0" max="30" value={form.learningDays[key]} onChange={event => updatePlatform(key, "learningDays", event.target.value)} /></label><label><span className="sr-only">{label}有效测试阈值</span><input type="number" min="0" value={form.effectiveSpend[key]} onChange={event => updatePlatform(key, "effectiveSpend", event.target.value)} /></label><span>{key === "douyin" ? "等待数据中心契约" : "标准导入"}</span></div>)}
      </section>
      <section className="brand-settings-connections">
        <article><DatabaseZap size={19} aria-hidden="true" /><div><strong>数据中心</strong><span>状态：{state.settings.dataCenterContractStatus === "planned" ? "计划中" : state.settings.dataCenterContractStatus}</span><small>品牌 App 只读取标准快照，不直接访问投放或内容平台。</small></div></article>
        <article><HardDrive size={19} aria-hidden="true" /><div><strong>绿联 NAS</strong><span>状态：{state.settings.nasIndexStatus === "online" ? "索引在线" : "索引离线"}</span><small>目录：{form.nasRootLabel}；仅保存相对路径和媒体元数据。</small></div><CloudOff size={16} aria-hidden="true" /></article>
      </section>
      <section className="brand-settings-fields"><label>内容编号前缀<input value={form.idPrefix} maxLength="12" onChange={event => setForm(current => ({ ...current, idPrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") }))} /></label><label>NAS 公开目录标签<input value={form.nasRootLabel} onChange={event => setForm(current => ({ ...current, nasRootLabel: event.target.value }))} /></label></section>
    </section>
  );
}
