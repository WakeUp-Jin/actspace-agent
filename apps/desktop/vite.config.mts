import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const devPort = Number(process.env.VITE_DEV_PORT) || 5173;

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@actspace/shared/desktop-bridge": resolve(__dirname, "../../packages/shared/src/desktop-bridge/index.ts"),
      "@actspace/shared/host-protocol": resolve(__dirname, "../../packages/shared/src/host-protocol/index.ts"),
      "@actspace/shared/runtime-v2": resolve(__dirname, "../../packages/shared/src/runtime-v2/index.ts"),
      "@actspace/shared/composer-reference-validation": resolve(__dirname, "../../packages/shared/src/composer-reference-validation.ts"),
      "@actspace/shared/session-list-page": resolve(__dirname, "../../packages/shared/src/session-list-page.ts"),
      "@actspace/shared/session-locator": resolve(__dirname, "../../packages/shared/src/session-locator.ts"),
      "@actspace/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@actspace/shared/session-selectors": resolve(__dirname, "../../packages/shared/src/session-selectors.ts")
    }
  },
  server: {
    host: "127.0.0.1",
    port: devPort,
    strictPort: true
  }
});
