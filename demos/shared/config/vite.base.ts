/// <reference types="node" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vite";

/**
 * Build the shared Vite config used by each demo frontend.
 */
export function createDemoViteConfig(demoImportMetaUrl: string): UserConfig {
  const demoRoot = path.dirname(fileURLToPath(demoImportMetaUrl));
  const sharedRoot = path.resolve(demoRoot, "../../shared/src");

  return defineConfig({
    resolve: {
      alias: {
        "@shared": sharedRoot,
      },
    },
    server: {
      fs: {
        // Allow serving shared demo helpers from outside a demo root.
        allow: [demoRoot, sharedRoot],
      },
      // Proxy backend calls in dev so frontends can use same-origin URLs.
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
}
