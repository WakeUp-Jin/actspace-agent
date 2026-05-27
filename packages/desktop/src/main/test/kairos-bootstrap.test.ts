import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createKairosToolManagerFactory,
  ensureKairosScaffolding,
} from "../kairos-bootstrap";
import type { KairosConfig } from "@actspace/agent-core";

async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "kairos-bootstrap-test-"));
}

import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
} from "@actspace/agent-core";

function makeConfig(over: Partial<KairosConfig> = {}): KairosConfig {
  return {
    preferences: { ...DEFAULT_PREFERENCES },
    paths: { ...DEFAULT_PATHS_CONFIG },
    blocklist: { ...DEFAULT_BLOCKLIST },
    ruleMd: "",
    warnings: [],
    ...over,
  };
}

describe("ensureKairosScaffolding", () => {
  it("creates all required subdirectories on first run", async () => {
    const root = await makeRoot();
    await ensureKairosScaffolding(root);

    for (const sub of [
      "config",
      "memory/short-term",
      "observe/watch-manifests",
      "briefs/tasks",
      "notes",
    ]) {
      const s = await stat(join(root, sub));
      expect(s.isDirectory()).toBe(true);
    }
  });

  it("writes 4 default config files with parseable JSON / markdown", async () => {
    const root = await makeRoot();
    await ensureKairosScaffolding(root);

    const prefs = JSON.parse(await readFile(join(root, "config/preferences.json"), "utf8"));
    expect(prefs.enabled).toBe(false);

    const paths = JSON.parse(await readFile(join(root, "config/paths.json"), "utf8"));
    expect(Array.isArray(paths.paths)).toBe(true);

    const blocklist = JSON.parse(await readFile(join(root, "config/blocklist.json"), "utf8"));
    expect(Array.isArray(blocklist.paths)).toBe(true);
    expect(Array.isArray(blocklist.toolsDenied)).toBe(true);

    const rule = await readFile(join(root, "config/rule.md"), "utf8");
    expect(rule.length).toBeGreaterThan(0);
    expect(rule.startsWith("#")).toBe(true);
  });

  it("does not overwrite existing config files (idempotent)", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "config"), { recursive: true });
    const customPrefs = JSON.stringify({ enabled: true, _custom: "keep-me" }, null, 2);
    await writeFile(join(root, "config/preferences.json"), customPrefs, "utf8");
    await writeFile(join(root, "config/rule.md"), "# user-edited", "utf8");

    await ensureKairosScaffolding(root);

    const prefsAfter = await readFile(join(root, "config/preferences.json"), "utf8");
    expect(prefsAfter).toBe(customPrefs);
    const ruleAfter = await readFile(join(root, "config/rule.md"), "utf8");
    expect(ruleAfter).toBe("# user-edited");
  });

  it("is safe to call twice consecutively", async () => {
    const root = await makeRoot();
    await ensureKairosScaffolding(root);
    await ensureKairosScaffolding(root);
    const s = await stat(join(root, "config/preferences.json"));
    expect(s.isFile()).toBe(true);
  });
});

describe("createKairosToolManagerFactory", () => {
  it("returns a function that produces a ToolManager scoped to workspaceRoot", () => {
    const factory = createKairosToolManagerFactory({ workspaceRoot: "/tmp/work" });
    const manager = factory(makeConfig());
    const names = manager.getAll().map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    // 默认应包含主 Agent 标配工具
    expect(names).toContain("read_file");
  });

  it("merges blocklist.toolsDenied into disabledTools, removing those tools from the manager", () => {
    const factory = createKairosToolManagerFactory({ workspaceRoot: "/tmp/work" });
    const baseline = factory(makeConfig()).getAll().map((t) => t.name);
    expect(baseline).toContain("read_file");

    const restricted = factory(
      makeConfig({
        blocklist: { ...DEFAULT_BLOCKLIST, toolsDenied: ["read_file"] },
      }),
    ).getAll().map((t) => t.name);
    expect(restricted).not.toContain("read_file");
    expect(restricted.length).toBeGreaterThan(0);
  });
});
