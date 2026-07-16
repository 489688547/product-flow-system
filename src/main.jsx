import React from "react";
import { createRoot } from "react-dom/client";
import { ProductFlowProvider } from "./state/ProductFlowProvider.jsx";
import { AuthProvider } from "./state/AuthProvider.jsx";
import { AuthGate } from "./features/auth/AuthGate.jsx";
import { PlatformProvider } from "./state/PlatformProvider.jsx";
import { ProductFlowPlatformBridge } from "./features/platform/ProductFlowPlatformBridge.jsx";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <ProductFlowProvider>
          <PlatformProvider>
            <ProductFlowPlatformBridge />
            <App />
          </PlatformProvider>
        </ProductFlowProvider>
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>
);
