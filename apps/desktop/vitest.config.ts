import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@actspace/shared/model-catalog-data": resolve(__dirname, "../../packages/shared/src/generated/model-catalog.generated.ts"),
      "@actspace/shared/desktop-bridge": resolve(__dirname, "../../packages/shared/src/desktop-bridge/index.ts"),
      "@actspace/shared/host-protocol": resolve(__dirname, "../../packages/shared/src/host-protocol/index.ts"),
      "@actspace/shared/runtime-v2": resolve(__dirname, "../../packages/shared/src/runtime-v2/index.ts"),
      "@actspace/shared/composer-reference-validation": resolve(__dirname, "../../packages/shared/src/composer-reference-validation.ts"),
      "@actspace/shared/session-list-page": resolve(__dirname, "../../packages/shared/src/session-list-page.ts"),
      "@actspace/shared/session-locator": resolve(__dirname, "../../packages/shared/src/session-locator.ts"),
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
