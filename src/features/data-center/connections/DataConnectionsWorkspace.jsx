import { useState } from "react";
import { Database, LockKeyhole, RefreshCw } from "lucide-react";
import { useDataCenter } from "../../../state/DataCenterProvider.jsx";
import { Button } from "../../../ui/Button.jsx";
import { ConnectorCatalog } from "./ConnectorCatalog.jsx";
import { ConnectorConfigDialog } from "./ConnectorConfigDialog.jsx";
import { InternalVaultWorkspace } from "./InternalVaultWorkspace.jsx";

export function DataConnectionsWorkspace({ canEdit = false, canManage = false }) {
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
  const [tab, setTab] = useState("connectors");
  const [selection, setSelection] = useState(null);

  const credentialMetadata = selection?.instance?.credentialEntryId
    ? vaultEntries.find(entry => entry.id === selection.instance.credentialEntryId)
    : null;

  return (
    <div className="data-connections-workspace">
      <section className="connection-summary">
        <div><Database size={21} /><span><strong>数据接入</strong><small>统一连接经营平台和内部系统，其他 App 只读取数据库。</small></span></div>
        <div><LockKeyhole size={17} /><span>敏感信息加密保存</span><Button onClick={refreshConnections} disabled={connectionsLoading}><RefreshCw size={15} />刷新</Button></div>
      </section>
      <div className="connection-tabs" role="tablist" aria-label="数据接入类型">
        <button type="button" role="tab" aria-selected={tab === "connectors"} onClick={() => setTab("connectors")}>经营数据连接器</button>
        <button type="button" role="tab" aria-selected={tab === "vault"} onClick={() => setTab("vault")}>内部系统保险箱</button>
      </div>
      {connectionsError ? <div className="connector-form-error" role="alert"><span>{connectionsError}</span><button type="button" onClick={refreshConnections}>重试</button></div> : null}
      {connectionsLoading ? <div className="connection-loading" aria-label="正在加载连接器"><span /><span /><span /></div> : tab === "connectors" ? (
        <ConnectorCatalog
          instances={connections}
          canEdit={canEdit}
          onAdd={definition => setSelection({ definition, instance: null })}
          onManage={(definition, instance) => setSelection({ definition, instance })}
        />
      ) : (
        <InternalVaultWorkspace items={vaultItems} vaultEntries={vaultEntries} canManage={canManage} onSave={saveVaultItem} onReveal={revealConnectionCredential} />
      )}
      {selection ? <ConnectorConfigDialog definition={selection.definition} instance={selection.instance} credentialMetadata={credentialMetadata} onSave={saveConnection} onClose={() => setSelection(null)} /> : null}
    </div>
  );
}
