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
