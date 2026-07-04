import { describe, expect, it } from "vitest";
import { buildConfigTipsBlock } from "../prompt-assembler";
import type { KairosConfig } from "../loader";
import { DEFAULT_BLOCKLIST, DEFAULT_PATHS_CONFIG, DEFAULT_PREFERENCES } from "../schema";

function makeConfig(overrides: Partial<KairosConfig> = {}): KairosConfig {
  return {
    preferences: { ...DEFAULT_PREFERENCES },
    paths: { ...DEFAULT_PATHS_CONFIG, paths: [] },
    blocklist: { ...DEFAULT_BLOCKLIST },
    ruleMd: "",
    soulMd: "",
    warnings: [],
    ...overrides,
  };
}

describe("buildConfigTipsBlock", () => {
  it("renders an empty-paths block when no paths configured", () => {
    const text = buildConfigTipsBlock(makeConfig());
    expect(text).toMatch(/^## 配置提示/);
    expect(text).toContain("[preferences]");
    expect(text).toContain("（暂无配置路径）");
    expect(text).toContain("[blocklist]");
  });

  it("renders explicit tip (or derived tip) for each path", () => {
    const text = buildConfigTipsBlock(
      makeConfig({
        paths: {
          tip: "path list",
          paths: [
            { path: "/Users/me/docs", tip: "design docs" },
            { path: "/Users/me/inbox" },
          ],
        },
      }),
    );
    expect(text).toMatch(/\/Users\/me\/docs\s+→ design docs/);
    expect(text).toMatch(/\/Users\/me\/inbox\s+→ inbox/);    // 末段名作 tip
  });

  it("truncates path list and shows remaining count when over budget", () => {
    const manyPaths = Array.from({ length: 200 }, (_, i) => ({
      path: `/Users/me/big-${"x".repeat(40)}-${i}`,
      tip: "very long descriptive tip ".repeat(10),
    }));
    const text = buildConfigTipsBlock(
      makeConfig({
        paths: { tip: "list", paths: manyPaths },
      }),
    );
    expect(text.length).toBeLessThanOrEqual(600 * 3);
    expect(text).toMatch(/另有 \d+ 条已省略/);
    expect(text.endsWith(`[blocklist] ${DEFAULT_BLOCKLIST.tip}`)).toBe(true);
  });
});
