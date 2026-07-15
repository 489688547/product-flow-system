import { Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FEATURE_PERMISSION_ITEMS, NAV_PERMISSION_ITEMS, normalizePermissions } from "../../domain/permissions.js";
import { Button } from "../../ui/Button.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";

function clonePermissions(value) {
  return normalizePermissions(JSON.parse(JSON.stringify(value || {})));
}

function selectionValue(items = []) {
  return items.filter(item => item !== "*").join(" / ");
}

export function PermissionSettings({ permissions, orgCache, onSave }) {
  const [draft, setDraft] = useState(() => clonePermissions(permissions));
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(clonePermissions(permissions)), [permissions]);
  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(clonePermissions(permissions)), [draft, permissions]);

  const updateNavigation = (key, departments) => {
    setSaved(false);
    setDraft(current => ({
      ...current,
      navigation: { ...current.navigation, [key]: { departments } }
    }));
  };
  const updateFeature = (key, field, value) => {
    setSaved(false);
    setDraft(current => ({
      ...current,
      features: { ...current.features, [key]: { ...current.features[key], [field]: value.split(" / ").filter(Boolean) } }
    }));
  };
  const handleSave = () => {
    onSave(clonePermissions(draft));
    setSaved(true);
  };

  return (
    <>
      <section className="section-panel permission-settings">
        <div className="section-head settings-template-head">
          <div><h2>权限设置</h2><p>控制不同部门能看到的左侧页面；总经办始终拥有全部权限。</p></div>
          <div className="settings-save-actions">
            <span className={`settings-save-status ${hasChanges ? "dirty" : saved ? "success" : ""}`}>{hasChanges ? "有未保存修改" : saved ? "权限已保存" : "当前权限已保存"}</span>
            <Button variant="primary" disabled={!hasChanges} disabledReason="权限设置没有未保存的修改" onClick={handleSave}><Save size={16} />保存权限</Button>
          </div>
        </div>
        <div className="permission-matrix" role="table" aria-label="导航权限">
          <div className="permission-matrix-head" role="row"><span>左侧页面</span><span>全员可见</span><span>可见部门</span></div>
          {NAV_PERMISSION_ITEMS.map(item => {
            const departments = draft.navigation[item.key]?.departments || [];
            const allDepartments = departments.includes("*");
            return <div className="permission-matrix-row" role="row" key={item.key}>
              <strong>{item.label}</strong>
              <label className="permission-toggle"><input type="checkbox" aria-label={`${item.label}全员可见`} checked={allDepartments} onChange={event => updateNavigation(item.key, event.target.checked ? ["*"] : ["总经办"])} /><span>{allDepartments ? "全员" : "指定"}</span></label>
              {allDepartments ? <span className="permission-all"><ShieldCheck size={15} />所有部门</span> : <OrgSelect type="department" value={selectionValue(departments)} onChange={value => updateNavigation(item.key, value.split(" / ").filter(Boolean))} orgCache={orgCache} multiple searchInMenu placeholder="选择可见部门" label={`${item.label}可见部门`} />}
            </div>;
          })}
        </div>
      </section>

      <section className="section-panel feature-permissions">
        <div className="section-head"><div><h2>功能设置</h2><p>分别配置功能的查看与编辑范围，后续新增功能沿用同一规则。</p></div></div>
        {FEATURE_PERMISSION_ITEMS.map(item => {
          const feature = draft.features[item.key];
          return <div className="feature-permission-row" key={item.key}>
            <div className="feature-permission-name"><strong>{item.label}</strong><span>{item.description}</span></div>
            <div className="feature-permission-grid">
              <label><span>查看部门</span><OrgSelect type="department" value={selectionValue(feature.viewDepartments)} onChange={value => updateFeature(item.key, "viewDepartments", value)} orgCache={orgCache} multiple searchInMenu placeholder="选择部门" /></label>
              <label><span>查看岗位</span><OrgSelect type="title" value={selectionValue(feature.viewTitles)} onChange={value => updateFeature(item.key, "viewTitles", value)} orgCache={orgCache} multiple searchInMenu placeholder="选择岗位" /></label>
              <label><span>编辑部门</span><OrgSelect type="department" value={selectionValue(feature.editDepartments)} onChange={value => updateFeature(item.key, "editDepartments", value)} orgCache={orgCache} multiple searchInMenu placeholder="选择部门" /></label>
              <label><span>编辑岗位</span><OrgSelect type="title" value={selectionValue(feature.editTitles)} onChange={value => updateFeature(item.key, "editTitles", value)} orgCache={orgCache} multiple searchInMenu placeholder="选择岗位" /></label>
            </div>
          </div>;
        })}
      </section>
    </>
  );
}
