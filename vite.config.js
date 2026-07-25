import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { manualChunks } from "./scripts/build-chunks.mjs";

const apiTarget = process.env.VITE_API_TARGET || "http://127.0.0.1:8132";
const localOnlineRequestSecret = process.env.LOCAL_ONLINE_REQUEST_SECRET || "";

function apiProxy() {
  return {
    target: apiTarget,
    configure(proxy) {
      if (!localOnlineRequestSecret) return;
      proxy.on("proxyReq", proxyRequest => {
        proxyRequest.setHeader("x-pfs-local-online-session", localOnlineRequestSecret);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
