import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sharedAliases } from "./shared-aliases.mts";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: sharedAliases },
  define: { __APP_VERSION__: JSON.stringify("test"), __BUILD_ID__: JSON.stringify("test") },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/test/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
