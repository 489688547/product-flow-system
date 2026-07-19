import { useState } from "react";
import { Handshake } from "lucide-react";
import { featureFlagEnabled } from "../../domain/featureFlags.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { CollaborationEditor } from "./CollaborationEditor.jsx";

export function AppCollaborationButton({ draft, label = "发起协同", className = "compact", disabled = false, disabledReason = "" }) {
  const [open, setOpen] = useState(false);
  const { orgCache } = useProductFlow();
  if (!featureFlagEnabled("executiveCollaborationHub")) return null;
  return <><Button className={className} disabled={disabled} disabledReason={disabledReason} onClick={() => setOpen(true)}><Handshake size={14} aria-hidden="true" />{label}</Button><CollaborationEditor open={open} onClose={() => setOpen(false)} draft={draft} orgCache={orgCache} /></>;
}
