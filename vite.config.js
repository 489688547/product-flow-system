import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { manualChunks } from "./scripts/build-chunks.mjs";
import {
  coreDeveloperProxyGuard,
  coreDeveloperProxyOptions
} from "./scripts/core-developer-proxy.mjs";

const apiTarget = process.env.VITE_API_TARGET || "http://127.0.0.1:8132";
const coreDeveloperToken = process.env.PFS_CORE_DEVELOPER_TOKEN || "";
const apiProxy = () => coreDeveloperToken
  ? coreDeveloperProxyOptions({ target: apiTarget, token: coreDeveloperToken })
  : { target: apiTarget };

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(coreDeveloperToken ? [coreDeveloperProxyGuard()] : [])],
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: { manualChunks }
    }
  },
  server: {
    proxy: {
      "/api": apiProxy()
    }
  },
  preview: {
    proxy: {
      "/api": apiProxy()
    }
  }
});
