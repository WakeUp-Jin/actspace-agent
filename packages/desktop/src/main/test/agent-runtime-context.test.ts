// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMainAgentRuntimeContext } from "../agent-runtime-context";

describe("loadMainAgentRuntimeContext", () => {
  it("injects the Main Agent Kairos handoff segment with an absolute writable inbox path", async () => {
    const dataRoot = "/tmp/actspace-user-data";
    const workspaceRoot = "/tmp/workspace";
    const inboxRoot = join(dataRoot, "kairos", "inbox");
    const inboxPath = join(inboxRoot, "main-agent.md");

    const context = await loadMainAgentRuntimeContext({
      dataRoot,
      workspaceRoot,
      readPromptFile: async () => ({
        path: join(dataRoot, "prompts", "main-agent.md"),
        content: "CUSTOM_MAIN_PROMPT",
      }),
    });

    expect(context.systemPrompt).toBe("CUSTOM_MAIN_PROMPT");
    expect(context.additionalWritableRoots).toEqual([inboxRoot]);

    const handoff = context.systemPromptSegments?.find((segment) => segment.id === "main_agent_kairos_handoff");
    expect(handoff).toBeDefined();
    expect(handoff?.content).toContain(inboxPath);
    expect(handoff?.content).toContain("append-only");
    expect(handoff?.content).toContain("Do not mark entries as Processed");
  });
});

describe("loadMainAgentRuntimeContext skill blacklist", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeWorkspaceWithSkills(): Promise<string> {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-skills-"));
    tempDirs.push(workspaceRoot);
    for (const name of ["alpha", "beta"]) {
      const dir = join(workspaceRoot, ".actspace", "skills", name);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} skill for testing\n---\n\n# ${name}\n`,
        "utf8",
      );
    }
    return workspaceRoot;
  }

  it("filters disabled skills out of the catalog segment", async () => {
    const workspaceRoot = await makeWorkspaceWithSkills();
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-data-"));
    tempDirs.push(dataRoot);
    const input = {
      dataRoot,
      workspaceRoot,
      homeDir: join(workspaceRoot, "no-home"),
      readPromptFile: async () => ({ path: "/tmp/p.md", content: "PROMPT" }),
    };

    const withAll = await loadMainAgentRuntimeContext(input);
    const catalogAll = withAll.systemPromptSegments?.find((s) => s.id === "skill_catalog");
    expect(catalogAll?.content).toContain("<name>alpha</name>");
    expect(catalogAll?.content).toContain("<name>beta</name>");

    const withDisabled = await loadMainAgentRuntimeContext({ ...input, disabledSkills: ["alpha"] });
    const catalog = withDisabled.systemPromptSegments?.find((s) => s.id === "skill_catalog");
    expect(catalog?.content).not.toContain("<name>alpha</name>");
    expect(catalog?.content).toContain("<name>beta</name>");
  });
});

describe("loadMainAgentRuntimeContext browser bridge", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("injects standard browser tool guidance and hides the managed CLI skill when abb exists", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-workspace-"));
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-data-"));
    tempDirs.push(workspaceRoot, dataRoot);
    const abbPath = join(dataRoot, "plugins", "browser-bridge", "bin", "abb");
    const socketPath = join(dataRoot, "browser-bridge.sock");
    await mkdir(join(dataRoot, "plugins", "browser-bridge", "bin"), { recursive: true });
    await writeFile(abbPath, "#!/bin/sh\n", "utf8");
    await mkdir(join(dataRoot, "skills", "browser-bridge"), { recursive: true });
    await writeFile(
      join(dataRoot, "skills", "browser-bridge", "SKILL.md"),
      "---\nname: browser-bridge\ndescription: stale CLI browser skill\n---\n",
      "utf8",
    );

    const context = await loadMainAgentRuntimeContext({
      dataRoot,
      workspaceRoot,
      homeDir: join(workspaceRoot, "no-home"),
      readPromptFile: async () => ({ path: "/tmp/p.md", content: "PROMPT" }),
      browserBridgeAbbPath: abbPath,
      browserBridgeSocketPath: socketPath,
    });

    const browserBridge = context.systemPromptSegments?.find((segment) => segment.id === "browser_bridge_tools");
    expect(browserBridge?.bucket).toBe("skills");
    expect(browserBridge?.content).toContain(abbPath);
    expect(browserBridge?.content).toContain("browser_help");
    expect(browserBridge?.content).toContain("browser_run");
    expect(browserBridge?.content).toContain("doctor --json");
    expect(browserBridge?.content).toContain("Do not invoke `abb` through Bash for normal browser tasks");
    expect(browserBridge?.content).toContain("<runtime_model>.input");
    expect(context.browserBridgeSocketPath).toBe(socketPath);
    const catalog = context.systemPromptSegments?.find((segment) => segment.id === "skill_catalog");
    expect(catalog?.content ?? "").not.toContain("<name>browser-bridge</name>");
  });

  it("does not expose browser tools when abb is absent", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-workspace-"));
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-data-"));
    tempDirs.push(workspaceRoot, dataRoot);

    const context = await loadMainAgentRuntimeContext({
      dataRoot,
      workspaceRoot,
      homeDir: join(workspaceRoot, "no-home"),
      readPromptFile: async () => ({ path: "/tmp/p.md", content: "PROMPT" }),
      browserBridgeAbbPath: join(dataRoot, "plugins", "browser-bridge", "bin", "abb"),
      browserBridgeSocketPath: join(dataRoot, "browser-bridge.sock"),
    });

    expect(context.systemPromptSegments?.some((segment) => segment.id === "browser_bridge_tools")).toBe(false);
    expect(context.browserBridgeSocketPath).toBeUndefined();
  });

  it("does not expose browser guidance or socket when the browser group is disabled", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-disabled-workspace-"));
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-disabled-data-"));
    tempDirs.push(workspaceRoot, dataRoot);
    const abbPath = join(dataRoot, "plugins", "browser-bridge", "bin", "abb");
    await mkdir(join(dataRoot, "plugins", "browser-bridge", "bin"), { recursive: true });
    await writeFile(abbPath, "#!/bin/sh\n", "utf8");

    const context = await loadMainAgentRuntimeContext({
      dataRoot,
      workspaceRoot,
      readPromptFile: async () => ({ path: "/tmp/p.md", content: "PROMPT" }),
      browserBridgeAbbPath: abbPath,
      browserBridgeSocketPath: join(dataRoot, "browser-bridge.sock"),
      disabledTools: ["browser"],
    });

    expect(context.systemPromptSegments?.some((segment) => segment.id === "browser_bridge_tools")).toBe(false);
    expect(context.browserBridgeSocketPath).toBeUndefined();
  });
});
