import { Building2, Cloud, FileKey2, HardDrive, Landmark, Mail, Server } from "lucide-react";
import { useState } from "react";
import { summarizePlatformConnectionHealth } from "../../../domain/dataAccessCatalog.js";
import { INTERNAL_VAULT_TYPES } from "../../../domain/dataCenterConnectors.js";
import { PLATFORM_CONNECTION_DEFINITIONS } from "../../../domain/platformConnections.js";
import { PlatformConnectionsWorkspace } from "../PlatformConnectionsWorkspace.jsx";
import { DataAccessCard } from "./DataAccessCard.jsx";
import { InternalVaultWorkspace } from "./InternalVaultWorkspace.jsx";

const COMPANY_PLATFORM_IDS = ["dingtalk", "aliyun"];
const VAULT_MARKS = {
  nas: <HardDrive size={22} aria-hidden="true" />,
  email: <Mail size={22} aria-hidden="true" />,
  finance: <Landmark size={22} aria-hidden="true" />,
  "government-saas": <Building2 size={22} aria-hidden="true" />,
  custom: <Server size={22} aria-hidden="true" />
};

export function CompanyDataWorkspace({
  vaultItems = [],
  vaultEntries = [],
  platformController,
  canManage = false,
  canManagePlatform = false,
  onSaveVault,
  onReveal,
  onDetailChange
}) {
  const [selection, setSelection] = useState(null);
  const select = next => {
    setSelection(next);
    onDetailChange?.(Boolean(next));
  };

  if (selection?.kind === "platform") {
    return (
      <PlatformConnectionsWorkspace
        canManage={canManagePlatform}
        platformIds={[selection.id]}
        initialPlatformId={selection.id}
        embedded
        controller={platformController}
        onBack={() => select(null)}
      />
    );
  }

  if (selection?.kind === "vault") {
    return (
      <InternalVaultWorkspace
        items={vaultItems}
        vaultEntries={vaultEntries}
        canManage={canManage}
        onSave={onSaveVault}
        onReveal={onReveal}
        initialType={selection.id}
        visibleTypes={[selection.id]}
        onBack={() => select(null)}
      />
    );
  }

  return (
    <div className="data-access-grid">
      {PLATFORM_CONNECTION_DEFINITIONS.filter(item => COMPANY_PLATFORM_IDS.includes(item.id)).map(definition => {
        const connection = platformController.connections.find(item => item.platformId === definition.id);
        const [status, statusTone] = summarizePlatformConnectionHealth({
          connection,
          loading: platformController.loading,
          error: platformController.error,
          available: definition.available
        });
        const unavailable = !definition.available;
        return (
          <DataAccessCard
            key={definition.id}
            mark={definition.id === "aliyun" ? <Cloud size={22} aria-hidden="true" /> : definition.mark}
            markClassName={definition.id}
            title={definition.name}
            description={definition.description}
            status={status}
            statusTone={statusTone}
            meta={[connection?.verifiedAt ? "最近已验证" : unavailable ? definition.disabledReason : "等待首次验证"]}
            disabled={unavailable}
            disabledReason={unavailable ? "准备接入" : ""}
            onOpen={() => select({ kind: "platform", id: definition.id })}
            actionLabel="管理连接"
          >
            <p>{unavailable ? "适配器完成后可在这里配置，当前不提供虚假表单。" : "公司级连接由最高权限管理员维护，已保存信息不会回显。"}</p>
          </DataAccessCard>
        );
      })}
      {INTERNAL_VAULT_TYPES.map(type => {
        const itemCount = vaultItems.filter(item => item.itemType === type.id).length;
        const credentialCount = vaultItems.filter(item => item.itemType === type.id && vaultEntries.some(entry => entry.id === item.credentialEntryId && entry.hasSecret)).length;
        const restricted = !canManage;
        return (
          <DataAccessCard
            key={type.id}
            mark={type.id === "custom" ? <FileKey2 size={22} aria-hidden="true" /> : VAULT_MARKS[type.id]}
            markClassName={type.id}
            title={type.name}
            description={type.description}
            status={restricted ? "只读" : `${itemCount} 个条目`}
            statusTone={credentialCount && !restricted ? "success" : "neutral"}
            meta={[restricted ? "条目数量仅授权人员可见" : credentialCount ? `${credentialCount} 个凭据已加密` : "尚无加密凭据"]}
            disabled={restricted}
            disabledReason={restricted ? "仅授权人员可查看条目" : ""}
            onOpen={() => select({ kind: "vault", id: type.id })}
            actionLabel="查看详情"
          >
            <p>只展示非敏感资料；凭据查看需要授权、填写用途并记录审计。</p>
          </DataAccessCard>
        );
      })}
    </div>
  );
}
