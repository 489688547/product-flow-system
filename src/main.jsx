import React from "react";
import { createRoot } from "react-dom/client";
import { ProductFlowProvider } from "./state/ProductFlowProvider.jsx";
import { AuthProvider, useAuth } from "./state/AuthProvider.jsx";
import { AuthGate } from "./features/auth/AuthGate.jsx";
import { PlatformProvider } from "./state/PlatformProvider.jsx";
import { ProductFlowPlatformBridge } from "./features/platform/ProductFlowPlatformBridge.jsx";
import { canAccessCompanyPlatform, canAccessDataCenter, canAccessEcommerceOperations, canAccessPerformanceManagement, canAccessSupplyChain } from "./domain/permissions.js";
import { SupplyChainProvider } from "./state/SupplyChainProvider.jsx";
import { DataCenterProvider } from "./state/DataCenterProvider.jsx";
import { EcommerceOperationsProvider } from "./state/EcommerceOperationsProvider.jsx";
import { PerformanceManagementProvider } from "./state/PerformanceManagementProvider.jsx";
import App from "./App.jsx";
import "./styles.css";

function AuthenticatedApp() {
  const { user } = useAuth();
  const hasCompanyAccess = canAccessCompanyPlatform(user);
  const hasSupplyChainAccess = canAccessSupplyChain(user);
  const hasDataCenterAccess = canAccessDataCenter(user);
  const hasOperationsAccess = canAccessEcommerceOperations(user);
  const hasPerformanceAccess = canAccessPerformanceManagement(user);
  return (
    <ProductFlowProvider>
      <DataCenterProvider enabled={hasDataCenterAccess}>
        <EcommerceOperationsProvider enabled={hasOperationsAccess}>
          <PerformanceManagementProvider enabled={hasPerformanceAccess}>
            <SupplyChainProvider enabled={hasSupplyChainAccess}>
              <PlatformProvider enabled={hasCompanyAccess}>
                {hasCompanyAccess ? <ProductFlowPlatformBridge /> : null}
                <App />
              </PlatformProvider>
            </SupplyChainProvider>
          </PerformanceManagementProvider>
        </EcommerceOperationsProvider>
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
