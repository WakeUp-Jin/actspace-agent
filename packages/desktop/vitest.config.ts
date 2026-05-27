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
    // 统一用 jsdom：renderer 测试需要 DOM；main 进程的 Kairos 内部测试只用 fs/promises 和纯逻辑，
    // jsdom 不会拦截这些 node builtins，所以单环境足以。
    environment: "jsdom",
    globals: true,
    include: ["src/**/test/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/renderer/test/setup.ts"],
  },
});
