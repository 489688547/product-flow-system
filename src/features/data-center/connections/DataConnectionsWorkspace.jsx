import { useEffect, useState } from "react";
import { Database, LockKeyhole, RefreshCw } from "lucide-react";
import { DATA_ACCESS_CATEGORIES, dataAccessCategoryFor } from "../../../domain/dataAccessCatalog.js";
import { DATA_CONNECTOR_DEFINITIONS, storeFileImportPending } from "../../../domain/dataCenterConnectors.js";
import { useDataCenter } from "../../../state/DataCenterProvider.jsx";
import { usePlatformConnections } from "../../../state/usePlatformConnections.js";
import { Button } from "../../../ui/Button.jsx";
import { CompanyDataWorkspace } from "./CompanyDataWorkspace.jsx";
import { ConnectorCatalog } from "./ConnectorCatalog.jsx";
import { ConnectorConfigDialog } from "./ConnectorConfigDialog.jsx";
import { DataAccessTabs } from "./DataAccessTabs.jsx";
import { ErpAccessWorkspace } from "./ErpAccessWorkspace.jsx";

const ECOMMERCE_CONNECTOR_DEFINITIONS = DATA_CONNECTOR_DEFINITIONS.filter(
  item => dataAccessCategoryFor("connector", item.id) === "ecommerce"
);

function validCategory(category) {
  return DATA_ACCESS_CATEGORIES.some(item => item.id === category);
}

export function DataConnectionsWorkspace({
  canEdit = false,
  canManage = false,
  canManagePlatform = false,
  initialCategory = ""
}) {
  const {
    connections,
    vaultItems,
    vaultEntries,
    connectionsLoading,
    connectionsError,
    refreshConnections,
    saveConnection,
    saveVaultItem,
    revealConnectionCredential
  } = useDataCenter();
  const [category, setCategory] = useState(validCategory(initialCategory) ? initialCategory : "ecommerce");
  const [selection, setSelection] = useState(null);
  const [detailActive, setDetailActive] = useState(false);
  const platformController = usePlatformConnections();

  useEffect(() => {
    setSelection(null);
    setDetailActive(false);
    setCategory(validCategory(initialCategory) ? initialCategory : "ecommerce");
  }, [initialCategory]);

  const credentialMetadata = selection?.instance?.credentialEntryId
    ? vaultEntries.find(entry => entry.id === selection.instance.credentialEntryId)
    : null;

  async function refreshAll() {
    await Promise.allSettled([refreshConnections(), platformController.refresh()]);
  }

  const openNew = definition => setSelection({ definition, instance: null });
  const openExisting = (definition, instance) => setSelection({ definition, instance });

  return (
    <div className="data-connections-workspace">
      <section className="connection-summary">
        <div><Database size={21} aria-hidden="true" /><span><strong>数据接入</strong><small>统一管理电商平台、ERP 与公司数据。</small></span></div>
        <div><LockKeyhole size={17} aria-hidden="true" /><span>敏感信息加密保存</span><Button onClick={refreshAll} disabled={connectionsLoading || platformController.loading}><RefreshCw size={15} aria-hidden="true" />刷新</Button></div>
      </section>
      {!detailActive ? <DataAccessTabs value={category} onChange={nextCategory => { setSelection(null); setDetailActive(false); setCategory(nextCategory); }} /> : null}
      {connectionsError ? <div className="connector-form-error" role="alert"><span>{connectionsError}</span><button type="button" onClick={refreshConnections}>重试</button></div> : null}
      {["erp", "company"].includes(category) && platformController.error ? <div className="connector-form-error" role="alert"><span>{platformController.error}</span><button type="button" onClick={() => platformController.refresh().catch(() => {})}>重试平台连接</button></div> : null}
      <div id={`data-access-panel-${category}`} role="tabpanel" aria-labelledby={`data-access-tab-${category}`}>
        {connectionsLoading ? <div className="connection-loading" aria-label="正在加载数据接入"><span /><span /><span /></div> : null}
        {!connectionsLoading && category === "ecommerce" ? (
          <ConnectorCatalog
            definitions={ECOMMERCE_CONNECTOR_DEFINITIONS}
            instances={connections}
            canEdit={canEdit}
            onAdd={openNew}
            onManage={openExisting}
            waitingForSamples={storeFileImportPending}
            pendingMessage="请先提供平台后台原始 XLSX / CSV；识别规则验证后再开放导入。"
            pendingActionLabel="等待文件样例"
          />
        ) : null}
        {!connectionsLoading && category === "erp" ? (
          <ErpAccessWorkspace
            connectorInstances={connections}
            platformController={platformController}
            canEdit={canEdit}
            canManagePlatform={canManagePlatform}
            onAdd={openNew}
            onManage={openExisting}
            onDetailChange={setDetailActive}
          />
        ) : null}
        {!connectionsLoading && category === "company" ? (
          <CompanyDataWorkspace
            vaultItems={vaultItems}
            vaultEntries={vaultEntries}
            platformController={platformController}
            canManage={canManage}
            canManagePlatform={canManagePlatform}
            onSaveVault={saveVaultItem}
            onReveal={revealConnectionCredential}
            onDetailChange={setDetailActive}
          />
        ) : null}
      </div>
      {selection && category !== "ecommerce" ? (
        <ConnectorConfigDialog
          definition={selection.definition}
          instance={selection.instance}
          credentialMetadata={credentialMetadata}
          onSave={saveConnection}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </div>
  );
}
