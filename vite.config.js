import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { manualChunks } from "./scripts/build-chunks.mjs";

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
      "/api": "http://127.0.0.1:8127"
    }
  },
  preview: {
    proxy: {
      "/api": "http://127.0.0.1:8127"
    }
  }
});
