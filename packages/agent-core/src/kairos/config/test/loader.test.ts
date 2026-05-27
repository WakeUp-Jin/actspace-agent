import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadKairosConfig } from "../loader";
import { DEFAULT_PREFERENCES } from "../schema";

let tmpRoot: string;
let configDir: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "kairos-loader-"));
  configDir = join(tmpRoot, "config");
  await mkdir(configDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("loadKairosConfig", () => {
  it("falls back to defaults silently when files do not exist", async () => {
    const cfg = await loadKairosConfig(tmpRoot);
    expect(cfg.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(cfg.paths.paths).toEqual([]);
    expect(cfg.blocklist.toolsDenied).toEqual(["bash"]);
    expect(cfg.ruleMd).toBe("");
    expect(cfg.warnings).toEqual([]);                  // ENOENT 不产生 warning
  });

  it("records warnings and falls back when JSON is malformed", async () => {
    await writeFile(join(configDir, "preferences.json"), "{not valid", "utf8");
    const cfg = await loadKairosConfig(tmpRoot);
    expect(cfg.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(cfg.warnings.length).toBeGreaterThan(0);
    expect(cfg.warnings[0]).toMatch(/preferences\.json/);
  });

  it("respects user overrides in valid JSON", async () => {
    await writeFile(
      join(configDir, "preferences.json"),
      JSON.stringify({ enabled: true, modelId: "kimi-k2" }),
      "utf8",
    );
    await writeFile(
      join(configDir, "paths.json"),
      JSON.stringify({ tip: "custom", paths: [{ path: "/A", watch: true, tip: "first" }] }),
      "utf8",
    );
    const cfg = await loadKairosConfig(tmpRoot);
    expect(cfg.preferences.enabled).toBe(true);
    expect(cfg.preferences.modelId).toBe("kimi-k2");
    expect(cfg.paths.paths[0]).toEqual({ path: "/A", watch: true, tip: "first" });
  });

  it("truncates rule.md and emits a warning when over budget", async () => {
    // ~10000 chars → ~3333 tokens, well over budget 1500
    const longBody = "abc 我们 ".repeat(2000);
    await writeFile(join(configDir, "rule.md"), longBody, "utf8");
    const cfg = await loadKairosConfig(tmpRoot);
    expect(cfg.ruleMd.length).toBeLessThan(longBody.length);
    expect(cfg.ruleMd.endsWith("[Truncated: rule.md too long]")).toBe(true);
    expect(cfg.warnings.some((w) => w.includes("rule.md exceeds"))).toBe(true);
  });

  it("invokes onWarning hook for non-fatal issues", async () => {
    await writeFile(join(configDir, "blocklist.json"), "INVALID", "utf8");
    const seen: string[] = [];
    const cfg = await loadKairosConfig(tmpRoot, { onWarning: (m) => seen.push(m) });
    expect(seen).toHaveLength(1);
    expect(cfg.blocklist.toolsDenied).toEqual(["bash"]);
  });
});
