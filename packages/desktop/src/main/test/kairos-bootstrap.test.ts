import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createKairosToolManagerFactory,
  ensureKairosScaffolding,
  getKairosWorkspaceRoot,
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
    soulMd: "",
    warnings: [],
    ...over,
  };
}

describe("ensureKairosScaffolding", () => {
  it("creates all required subdirectories on first run", async () => {
    const root = await makeRoot();
    await ensureKairosScaffolding(root);

    for (const sub of [
      "inbox",
      "config",
      "workspace",
      "workspace/notes",
      "memory/short-term",
      "observe",
      "briefs/tasks",
      "inbox",
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
    expect(paths.paths).toEqual([
      {
        path: getKairosWorkspaceRoot(root),
        tip: "Kairos 的默认工作空间，文件工具的相对路径会落在这里。",
      },
    ]);

    const blocklist = JSON.parse(await readFile(join(root, "config/blocklist.json"), "utf8"));
    expect(Array.isArray(blocklist.paths)).toBe(true);
    expect(Array.isArray(blocklist.toolsDenied)).toBe(true);

    const rule = await readFile(join(root, "config/rule.md"), "utf8");
    expect(rule.length).toBeGreaterThan(0);
    expect(rule.startsWith("#")).toBe(true);
  });

  it("writes default Agent inbox files without a Processed section", async () => {
    const root = await makeRoot();
    await ensureKairosScaffolding(root);

    const main = await readFile(join(root, "inbox/main-agent.md"), "utf8");
    const lab = await readFile(join(root, "inbox/lab-agent.md"), "utf8");

    expect(main).toContain("# Main Agent -> Kairos Inbox");
    expect(main).toContain("## Pending");
    expect(main).not.toContain("Processed");
    expect(lab).toContain("# Lab Agent -> Kairos Inbox");
    expect(lab).toContain("## Pending");
    expect(lab).not.toContain("Processed");
  });

  it("does not overwrite existing config files (idempotent)", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "config"), { recursive: true });
    const customPrefs = JSON.stringify({ enabled: true, _custom: "keep-me" }, null, 2);
    const customPaths = JSON.stringify({ tip: "custom", paths: [{ path: "/tmp/custom", watch: false }] }, null, 2);
    await writeFile(join(root, "config/preferences.json"), customPrefs, "utf8");
    await writeFile(join(root, "config/paths.json"), customPaths, "utf8");
    await writeFile(join(root, "config/rule.md"), "# user-edited", "utf8");

    await ensureKairosScaffolding(root);

    const prefsAfter = await readFile(join(root, "config/preferences.json"), "utf8");
    expect(prefsAfter).toBe(customPrefs);
    const pathsAfter = await readFile(join(root, "config/paths.json"), "utf8");
    expect(pathsAfter).toBe(customPaths);
    const ruleAfter = await readFile(join(root, "config/rule.md"), "utf8");
    expect(ruleAfter).toBe("# user-edited");
  });

  it("migrates the legacy empty paths config to the Kairos workspace", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(
      join(root, "config/paths.json"),
      JSON.stringify(DEFAULT_PATHS_CONFIG, null, 2) + "\n",
      "utf8",
    );

    await ensureKairosScaffolding(root);

    const paths = JSON.parse(await readFile(join(root, "config/paths.json"), "utf8"));
    expect(paths.paths).toEqual([
      expect.objectContaining({
        path: getKairosWorkspaceRoot(root),
      }),
    ]);
  });

  it("also migrates the pre-retirement legacy empty paths config (old watch tip)", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(
      join(root, "config/paths.json"),
      JSON.stringify(
        { tip: "在此声明 Kairos 可读的本地路径；watch=true 表示同时纳入巡检差异检测。", paths: [] },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    await ensureKairosScaffolding(root);

    const paths = JSON.parse(await readFile(join(root, "config/paths.json"), "utf8"));
    expect(paths.paths).toEqual([
      expect.objectContaining({
        path: getKairosWorkspaceRoot(root),
      }),
    ]);
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
  const ENV_KEYS = [
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_API_FORMAT",
    "KIMI_API_KEY",
    "KAIROS_MODEL_ID",
  ];

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.resetModules();
  });

  it("returns a function that produces a ToolManager scoped to workspaceRoot", () => {
    const factory = createKairosToolManagerFactory({ workspaceRoot: "/tmp/work", modelId: null });
    const manager = factory(makeConfig());
    const names = manager.getAll().map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    // 默认应包含主 Agent 标配工具
    expect(names).toContain("read_file");
  });

  it("merges blocklist.toolsDenied into disabledTools, removing those tools from the manager", () => {
    const factory = createKairosToolManagerFactory({ workspaceRoot: "/tmp/work", modelId: null });
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

  it("uses DeepSeek Anthropic format by default and hides the Kimi-backed web_search", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.KIMI_API_KEY = "sk-kimi";
    const { loadEnv } = await import("@actspace/agent-core");
    const { createKairosToolManagerFactory: createFactory } = await import("../kairos-bootstrap");
    loadEnv({
      envPath: "/private/tmp/actspace-agent-kairos-test-does-not-exist",
      mergeToProcessEnv: false,
    });

    const factory = createFactory({ workspaceRoot: "/tmp/work", modelId: null });
    const manager = factory(makeConfig());

    expect(manager.has("web_search")).toBe(false);
    expect(manager.has("analyze_media")).toBe(true);
  });

  it("can expose Kimi-backed web_search when Kairos explicitly falls back to OpenAI-compatible DeepSeek", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.DEEPSEEK_API_FORMAT = "openai";
    process.env.KIMI_API_KEY = "sk-kimi";
    const { loadEnv } = await import("@actspace/agent-core");
    const { createKairosToolManagerFactory: createFactory } = await import("../kairos-bootstrap");
    loadEnv({
      envPath: "/private/tmp/actspace-agent-kairos-test-does-not-exist",
      mergeToProcessEnv: false,
    });

    const factory = createFactory({ workspaceRoot: "/tmp/work", modelId: null });
    const manager = factory(makeConfig());

    expect(manager.has("web_search")).toBe(true);
  });
});
