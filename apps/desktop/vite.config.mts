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
      "@actspace/shared/runtime-v2": resolve(__dirname, "../../packages/shared/src/runtime-v2/index.ts"),
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
