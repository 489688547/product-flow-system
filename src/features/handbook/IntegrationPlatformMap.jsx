import {
  AlertTriangle,
  Check,
  Database,
  ExternalLink,
  Link2,
  Pencil,
  Search,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import integrationRegistry from "../../../docs/platform/integration-registry.json";
import {
  countIntegrationStatuses,
  filterIntegrations,
  isIntegrationProfileStale,
  mergeIntegrationProfiles,
  resolveIntegrationRelations
} from "../../domain/integrations.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { loadIntegrationProfiles, saveIntegrationProfile } from "../../state/integrationProfilesApi.js";
import "./integration-platform-map.css";

const STATUS_OPTIONS = [
  { id: "all", label: "全部" },
  { id: "connected", label: "已连接" },
  { id: "integrating", label: "集成中" },
  { id: "planned", label: "计划中" },
  { id: "retired", label: "已停用" }
];

const EMPTY_FORM = {
  consoleUrl: "",
  accountSubject: "",
  resourceNamesText: "",
  environmentsText: "",
  owner: "",
  permissionGuide: "",
  runbook: "",
  verifiedAt: ""
};

function profileToForm(profile) {
  if (!profile) return EMPTY_FORM;
  return {
    consoleUrl: profile.consoleUrl || "",
    accountSubject: profile.accountSubject || "",
    resourceNamesText: (profile.resourceNames || []).join("\n"),
    environmentsText: (profile.environments || [])
      .map(environment => [environment.name, environment.url, environment.notes].join(" | "))
      .join("\n"),
    owner: profile.owner || "",
    permissionGuide: profile.permissionGuide || "",
    runbook: profile.runbook || "",
    verifiedAt: profile.verifiedAt || ""
  };
}

function formToProfile(platformId, form) {
  return {
    platformId,
    consoleUrl: form.consoleUrl,
    accountSubject: form.accountSubject,
    resourceNames: form.resourceNamesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    environments: form.environmentsText.split(/\r?\n/).flatMap(line => {
      const [name = "", url = "", ...notes] = line.split("|").map(value => value.trim());
      return name ? [{ name, url, notes: notes.join(" | ") }] : [];
    }),
    owner: form.owner,
    permissionGuide: form.permissionGuide,
    runbook: form.runbook,
    verifiedAt: form.verifiedAt
  };
}

function IntegrationProfileEditor({ platform, saving, error, onCancel, onSave }) {
  const [form, setForm] = useState(() => profileToForm(platform.internal));
  const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

  return (
    <form
      className="integration-profile-editor"
      onSubmit={event => {
        event.preventDefault();
        onSave(formToProfile(platform.id, form));
      }}
    >
      <div className="integration-editor-heading">
        <div>
          <strong>维护内部资料</strong>
          <p>只填写入口、主体、资源和责任信息；凭据必须保存在密钥管理系统。</p>
        </div>
        <button className="icon-action" type="button" aria-label="关闭编辑" onClick={onCancel} disabled={saving}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="integration-form-grid">
        <label>
          <span>内部控制台 URL</span>
          <input type="url" value={form.consoleUrl} onChange={event => setField("consoleUrl", event.target.value)} placeholder="https://" />
        </label>
        <label>
          <span>账号主体</span>
          <input value={form.accountSubject} onChange={event => setField("accountSubject", event.target.value)} placeholder="公司或业务主体" />
        </label>
        <label>
          <span>负责人</span>
          <input value={form.owner} onChange={event => setField("owner", event.target.value)} placeholder="姓名或岗位" />
        </label>
        <label>
          <span>最近验证日期</span>
          <input type="date" value={form.verifiedAt} onChange={event => setField("verifiedAt", event.target.value)} />
        </label>
        <label className="span-2">
          <span>应用 / 实例 / 店铺名称</span>
          <textarea rows="3" value={form.resourceNamesText} onChange={event => setField("resourceNamesText", event.target.value)} placeholder="每行一个名称" />
        </label>
        <label className="span-2">
          <span>环境</span>
          <textarea rows="3" value={form.environmentsText} onChange={event => setField("environmentsText", event.target.value)} placeholder="生产 | https://example.com/ | 钉钉工作台" />
          <small>每行格式：环境名 | HTTPS URL | 说明</small>
        </label>
        <label className="span-2">
          <span>权限申请路径</span>
          <textarea rows="2" value={form.permissionGuide} onChange={event => setField("permissionGuide", event.target.value)} />
        </label>
        <label className="span-2">
          <span>内部运行手册</span>
          <textarea rows="2" value={form.runbook} onChange={event => setField("runbook", event.target.value)} placeholder="知识库位置或简短操作说明" />
        </label>
      </div>

      {error ? <p className="integration-form-error" role="alert">{error}</p> : null}
      <div className="integration-editor-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={saving}>取消</button>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? "正在保存…" : "保存内部资料"}</button>
      </div>
    </form>
  );
}

function InternalProfile({ platform, loading }) {
  if (loading) {
    return <div className="integration-profile-loading" aria-busy="true"><span /><span /><span /><small>正在读取内部资料…</small></div>;
  }
  const profile = platform.internal;
  if (!profile) {
    return (
      <div className="integration-profile-empty">
        <Database size={17} aria-hidden="true" />
        <div><strong>内部资料尚未维护</strong><p>平台管理员可补充控制台、账号主体、负责人和运行手册。</p></div>
      </div>
    );
  }

  return (
    <div className="integration-profile-content">
      {isIntegrationProfileStale(profile) ? (
        <p className="integration-stale"><AlertTriangle size={15} aria-hidden="true" />资料超过 180 天未验证，请联系负责人复核。</p>
      ) : null}
      <dl>
        <div><dt>账号主体</dt><dd>{profile.accountSubject || "未填写"}</dd></div>
        <div><dt>负责人</dt><dd>{profile.owner || "未填写"}</dd></div>
        <div><dt>最近验证</dt><dd>{profile.verifiedAt || "未验证"}</dd></div>
        <div><dt>维护人</dt><dd>{profile.updatedBy || "未知"}</dd></div>
      </dl>
      {profile.consoleUrl ? <a className="integration-console-link" href={profile.consoleUrl} target="_blank" rel="noreferrer">打开内部控制台 <ExternalLink size={14} aria-hidden="true" /></a> : null}
      {profile.resourceNames?.length ? <div className="integration-internal-block"><strong>应用 / 实例 / 店铺</strong><ul>{profile.resourceNames.map(name => <li key={name}>{name}</li>)}</ul></div> : null}
      {profile.environments?.length ? <div className="integration-internal-block"><strong>环境</strong><ul>{profile.environments.map(environment => <li key={`${environment.name}-${environment.url}`}><b>{environment.name}</b>{environment.url ? <a href={environment.url} target="_blank" rel="noreferrer">{environment.url}</a> : null}{environment.notes ? <span>{environment.notes}</span> : null}</li>)}</ul></div> : null}
      {profile.permissionGuide ? <div className="integration-internal-block"><strong>权限申请路径</strong><p>{profile.permissionGuide}</p></div> : null}
      {profile.runbook ? <div className="integration-internal-block"><strong>内部运行手册</strong><p>{profile.runbook}</p></div> : null}
    </div>
  );
}

export function IntegrationPlatformMap({ sessionUser }) {
  const [profiles, setProfiles] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("dingtalk");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let active = true;
    loadIntegrationProfiles({ hostname: window.location.hostname })
      .then(nextProfiles => {
        if (!active) return;
        setProfiles(nextProfiles);
        setLoadState("ready");
      })
      .catch(error => {
        if (!active) return;
        setLoadError(error?.message || "内部资料暂不可用。");
        setLoadState("error");
      });
    return () => { active = false; };
  }, []);

  const platforms = useMemo(() => mergeIntegrationProfiles(integrationRegistry, profiles), [profiles]);
  const counts = useMemo(() => countIntegrationStatuses(platforms), [platforms]);
  const filtered = useMemo(() => filterIntegrations(platforms, { query, status }), [platforms, query, status]);
  const selected = filtered.find(platform => platform.id === selectedId) || filtered[0] || null;
  const relations = useMemo(() => resolveIntegrationRelations(platforms, selected), [platforms, selected]);
  const canEdit = canManagePermissions(sessionUser) && sessionUser?.role !== "readonly";

  const selectPlatform = id => {
    setSelectedId(id);
    setEditing(false);
    setSaveError("");
    setSaveMessage("");
  };

  const saveProfile = async profile => {
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const saved = await saveIntegrationProfile(profile, { hostname: window.location.hostname });
      setProfiles(current => [...current.filter(item => item.platformId !== saved.platformId), saved]);
      setEditing(false);
      setSaveMessage("内部资料已保存。公开注册表未被修改。");
    } catch (error) {
      setSaveError(error?.message || "内部平台资料保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="integration-map" aria-label="外部平台地图">
      {loadState === "error" ? (
        <div className="integration-degraded" role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          <div><strong>内部资料暂不可用</strong><p>{loadError} 公开平台资料仍可正常查看。</p></div>
        </div>
      ) : null}

      <div className="integration-map-toolbar">
        <label className="integration-map-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">搜索平台、能力或问题</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索平台、能力或问题" />
          {query ? <button type="button" aria-label="清除平台搜索" onClick={() => setQuery("")}><X size={15} aria-hidden="true" /></button> : null}
        </label>
        <div className="integration-status-filters" aria-label="平台状态筛选">
          {STATUS_OPTIONS.map(option => (
            <button key={option.id} type="button" aria-pressed={status === option.id} className={status === option.id ? "active" : ""} onClick={() => setStatus(option.id)}>
              {option.label}<span>{counts[option.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="integration-map-workspace">
          <nav className="integration-platform-list" aria-label="外部平台">
            {filtered.map(platform => (
              <button key={platform.id} type="button" className={selected?.id === platform.id ? "active" : ""} aria-current={selected?.id === platform.id ? "true" : undefined} onClick={() => selectPlatform(platform.id)}>
                <span className={`integration-status-dot ${platform.status}`} aria-hidden="true" />
                <span><strong>{platform.name}</strong><small>{platform.capabilities.slice(0, 2).join(" · ")}</small></span>
                <em className={`integration-status-label ${platform.status}`}>{STATUS_OPTIONS.find(option => option.id === platform.status)?.label}</em>
              </button>
            ))}
          </nav>

          <div className="integration-platform-detail">
            <header className="integration-detail-header">
              <div>
                <div className="integration-detail-title"><h2>{selected.name}</h2><span className={`integration-status-label ${selected.status}`}>{STATUS_OPTIONS.find(option => option.id === selected.status)?.label}</span></div>
                <p>{selected.summary}</p>
              </div>
              {canEdit && !editing ? <button className="btn compact" type="button" onClick={() => { setEditing(true); setSaveError(""); }}><Pencil size={14} aria-hidden="true" />维护内部资料</button> : null}
            </header>

            {saveMessage ? <p className="integration-save-success" role="status"><Check size={15} aria-hidden="true" />{saveMessage}</p> : null}
            <section className="integration-detail-section">
              <h3>能力与常见问题</h3>
              <div className="integration-capabilities">{selected.capabilities.map(capability => <span key={capability}>{capability}</span>)}</div>
              <ul className="integration-question-list">{selected.businessQuestions.map(question => <li key={question}>{question}</li>)}</ul>
            </section>

            <section className="integration-detail-section">
              <h3>关联关系</h3>
              {relations.length ? <ul className="integration-relation-list">{relations.map(relation => <li key={`${relation.platform.id}-${relation.type}`}><Link2 size={15} aria-hidden="true" /><div><strong>{relation.platform.name}</strong><p>{relation.description}</p></div><span>{STATUS_OPTIONS.find(option => option.id === relation.platform.status)?.label}</span></li>)}</ul> : <p>当前没有登记的一层关联平台。</p>}
            </section>

            <section className="integration-detail-section">
              <h3>官方公开文档</h3>
              {selected.publicDocs.length ? <div className="integration-public-links">{selected.publicDocs.map(doc => <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer">{doc.label}<ExternalLink size={14} aria-hidden="true" /></a>)}</div> : <p>该能力是内部文件导入边界，没有独立的外部官方文档。</p>}
            </section>

            <section className="integration-detail-section integration-private-section">
              <div className="integration-section-heading"><h3>公司内部资料</h3><span>登录后可见</span></div>
              {editing ? <IntegrationProfileEditor key={selected.id} platform={selected} saving={saving} error={saveError} onCancel={() => { setEditing(false); setSaveError(""); }} onSave={saveProfile} /> : <InternalProfile platform={selected} loading={loadState === "loading"} />}
            </section>
          </div>
        </div>
      ) : (
        <div className="integration-map-empty">
          <Search size={22} aria-hidden="true" />
          <strong>没有匹配的平台</strong>
          <p>换一个关键词，或清除状态筛选查看全部平台。</p>
          <button className="btn" type="button" onClick={() => { setQuery(""); setStatus("all"); }}>查看全部平台</button>
        </div>
      )}
    </section>
  );
}
