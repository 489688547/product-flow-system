import React from "react";
import { createRoot } from "react-dom/client";
import { ProductFlowProvider } from "./state/ProductFlowProvider.jsx";
import { AuthProvider, useAuth } from "./state/AuthProvider.jsx";
import { AuthGate } from "./features/auth/AuthGate.jsx";
import { PlatformProvider } from "./state/PlatformProvider.jsx";
import { BrandContentProvider } from "./state/BrandContentProvider.jsx";
import { ProductFlowPlatformBridge } from "./features/platform/ProductFlowPlatformBridge.jsx";
import { canAccessCompanyPlatform, canAccessDataCenter, canAccessSupplyChain } from "./domain/permissions.js";
import { SupplyChainProvider } from "./state/SupplyChainProvider.jsx";
import { DataCenterProvider } from "./state/DataCenterProvider.jsx";
import { CollaborationProvider } from "./state/CollaborationProvider.jsx";
import App from "./App.jsx";
import "./styles.css";
import "./features/brand-content/brand-content.css";

function AuthenticatedApp() {
  const { user } = useAuth();
  const hasCompanyAccess = canAccessCompanyPlatform(user);
  const hasSupplyChainAccess = canAccessSupplyChain(user);
  const hasDataCenterAccess = canAccessDataCenter(user);
  return (
    <ProductFlowProvider>
      <DataCenterProvider enabled={hasDataCenterAccess}>
        <SupplyChainProvider enabled={hasSupplyChainAccess}>
          <BrandContentProvider>
            <CollaborationProvider>
              <PlatformProvider enabled={hasCompanyAccess}>
                {hasCompanyAccess ? <ProductFlowPlatformBridge /> : null}
                <App />
              </PlatformProvider>
            </CollaborationProvider>
          </BrandContentProvider>
        </SupplyChainProvider>
      </DataCenterProvider>
    </ProductFlowProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <AuthenticatedApp />
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>
);
