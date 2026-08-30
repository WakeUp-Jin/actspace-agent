import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@actspace/shared/runtime-v2": resolve(__dirname, "../../packages/shared/src/runtime-v2/index.ts"),
      "@actspace/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@actspace/shared/session-selectors": resolve(__dirname, "../../packages/shared/src/session-selectors.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/test/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/renderer/test/setup.ts"],
  },
});
