import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@actspace/shared/model-catalog-data": resolve(__dirname, "../../packages/util/shared/src/generated/model-catalog.generated.ts"),
      "@actspace/shared/desktop-bridge": resolve(__dirname, "../../packages/util/shared/src/desktop-bridge/index.ts"),
      "@actspace/shared/host-protocol": resolve(__dirname, "../../packages/util/shared/src/host-protocol/index.ts"),
      "@actspace/shared/runtime-v2": resolve(__dirname, "../../packages/util/shared/src/runtime-v2/index.ts"),
      "@actspace/shared/composer-reference-validation": resolve(__dirname, "../../packages/util/shared/src/composer-reference-validation.ts"),
      "@actspace/shared/session-list-page": resolve(__dirname, "../../packages/util/shared/src/session-list-page.ts"),
      "@actspace/shared/session-locator": resolve(__dirname, "../../packages/util/shared/src/session-locator.ts"),
      "@actspace/shared": resolve(__dirname, "../../packages/util/shared/src/index.ts"),
      "@actspace/shared/session-selectors": resolve(__dirname, "../../packages/util/shared/src/session-selectors.ts"),
    },
  },
  test: {
    globals: true,
    setupFiles: ["./src/renderer/test/setup.ts"],
    // main 进程测试不需要 DOM；按目录分成两个 project，省掉 90 多个 jsdom 实例的启动开销。
    projects: [
      {
        extends: true,
        test: { name: "main", environment: "node", include: ["src/main/**/test/**/*.test.{ts,tsx}"] },
      },
      {
        extends: true,
        test: { name: "renderer", environment: "jsdom", include: ["src/renderer/**/test/**/*.test.{ts,tsx}"] },
      },
    ],
  },
});
