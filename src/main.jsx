import React from "react";
import { createRoot } from "react-dom/client";
import { ProductFlowProvider } from "./state/ProductFlowProvider.jsx";
import { AuthProvider, useAuth } from "./state/AuthProvider.jsx";
import { AuthGate } from "./features/auth/AuthGate.jsx";
import { PlatformProvider } from "./state/PlatformProvider.jsx";
import { BrandContentProvider } from "./state/BrandContentProvider.jsx";
import { ProductFlowPlatformBridge } from "./features/platform/ProductFlowPlatformBridge.jsx";
import { canAccessCompanyPlatform } from "./domain/permissions.js";
import App from "./App.jsx";
import "./styles.css";

function AuthenticatedApp() {
  const { user } = useAuth();
  const hasCompanyAccess = canAccessCompanyPlatform(user);
  return (
    <ProductFlowProvider>
      <BrandContentProvider>
        <PlatformProvider enabled={hasCompanyAccess}>
          {hasCompanyAccess ? <ProductFlowPlatformBridge /> : null}
          <App />
        </PlatformProvider>
      </BrandContentProvider>
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
