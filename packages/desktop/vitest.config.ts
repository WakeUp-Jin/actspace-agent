import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@actspace/shared": resolve(__dirname, "../shared/src/index.ts"),
      "@actspace/shared/session-selectors": resolve(__dirname, "../shared/src/session-selectors.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/test/**/*.test.tsx"],
    setupFiles: ["./src/renderer/test/setup.ts"],
  },
});
