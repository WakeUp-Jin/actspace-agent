import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/test/**/*.test.ts"],
    exclude: ["src/**/test/**/*-real.test.ts", "src/**/test/**/*-debug.test.ts"],
    globals: true,
  },
});
