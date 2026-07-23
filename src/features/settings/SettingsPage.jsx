import { LockKeyhole } from "lucide-react";
import { canEditFeature, canManagePermissions, canViewFeature } from "../../domain/permissions.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { KuaimaiSyncSettings } from "./KuaimaiSyncSettings.jsx";
import { PermissionSettings } from "./PermissionSettings.jsx";
import { SalesDataSettings } from "./SalesDataSettings.jsx";
import { TaskTemplateSettings } from "./TaskTemplateSettings.jsx";
import { DataEnvironmentSettings } from "./DataEnvironmentSettings.jsx";

export function SettingsPage() {
  const { state, currentUser, orgCache, updateSettings, updateTaskTemplates } = useProductFlow();
  const permissions = state.settings?.permissions || {};
  const managePermissions = canManagePermissions(currentUser);
  const viewTaskTemplates = canViewFeature(permissions, currentUser, "taskTemplates");
  const editTaskTemplates = canEditFeature(permissions, currentUser, "taskTemplates");
  const viewSalesData = canViewFeature(permissions, currentUser, "salesData");
  const editSalesData = canEditFeature(permissions, currentUser, "salesData");

  return (
    <section className="page">
      <PageHeader title="设置" description="按组织架构控制页面可见范围和功能编辑权限。" />
      <DataEnvironmentSettings />
      {managePermissions ? <PermissionSettings permissions={permissions} orgCache={orgCache} onSave={nextPermissions => updateSettings({ permissions: nextPermissions })} /> : null}
      {viewSalesData ? <KuaimaiSyncSettings canEdit={editSalesData} currentUser={currentUser} /> : null}
      {viewSalesData ? <SalesDataSettings canEdit={editSalesData} currentUser={currentUser} /> : null}
      {viewTaskTemplates ? <TaskTemplateSettings canEdit={editTaskTemplates} templates={state.settings?.taskTemplates || []} orgCache={orgCache} onSave={updateTaskTemplates} /> : null}
      {!managePermissions && !viewTaskTemplates && !viewSalesData ? <div className="empty-panel settings-no-access"><LockKeyhole size={22} /><strong>暂无可配置功能</strong><span>功能权限由总经办按组织架构配置。</span></div> : null}
    </section>
  );
}
