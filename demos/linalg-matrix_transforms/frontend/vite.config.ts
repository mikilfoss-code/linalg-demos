/// <reference types="node" />
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const demoRoot = fileURLToPath(new URL(".", import.meta.url));
const sharedRoot = fileURLToPath(new URL("../../shared/src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": sharedRoot,
    },
  },
  server: {
    fs: {
      // Allow serving the shared demo helpers from outside this root.
      allow: [demoRoot, sharedRoot],
    },
    // Proxy backend calls in dev so the frontend can use same-origin URLs.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
