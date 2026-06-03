// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentsMdSegments } from "../agents-md-service";
import { loadMainAgentRuntimeContext } from "../agent-runtime-context";

function notFoundError(): Error & { code: string } {
  const error = new Error("missing") as Error & { code: string };
  error.code = "ENOENT";
  return error;
}

describe("loadAgentsMdSegments", () => {
  it("loads userData and workspace AGENTS.md as rules segments", async () => {
    const dataRoot = "/tmp/actspace-user-data";
    const workspaceRoot = "/tmp/workspace";
    const contents = new Map([
      [join(dataRoot, "AGENTS.md"), "Runtime rule."],
      [join(workspaceRoot, "AGENTS.md"), "Workspace rule."],
    ]);

    const segments = await loadAgentsMdSegments({
      dataRoot,
      workspaceRoot,
      readTextFile: async (filePath) => contents.get(filePath) ?? "",
    });

    expect(segments).toEqual([
      {
        id: "agents_user_data",
        title: "UserData AGENTS.md",
        content: "Runtime rule.",
        bucket: "rules",
        priority: 90,
      },
      {
        id: "agents_workspace",
        title: "Workspace AGENTS.md",
        content: "Workspace rule.",
        bucket: "rules",
        priority: 80,
      },
    ]);
  });

  it("silently skips missing and blank AGENTS.md files", async () => {
    const dataRoot = "/tmp/actspace-user-data";
    const workspaceRoot = "/tmp/workspace";

    const segments = await loadAgentsMdSegments({
      dataRoot,
      workspaceRoot,
      readTextFile: async (filePath) => {
        if (filePath === join(dataRoot, "AGENTS.md")) throw notFoundError();
        return "   \n";
      },
    });

    expect(segments).toEqual([]);
  });

  it("warns and skips AGENTS.md files that fail to read", async () => {
    const dataRoot = "/tmp/actspace-user-data";
    const workspaceRoot = "/tmp/workspace";
    const warn = vi.fn();

    const segments = await loadAgentsMdSegments({
      dataRoot,
      workspaceRoot,
      warn,
      readTextFile: async (filePath) => {
        if (filePath === join(dataRoot, "AGENTS.md")) throw new Error("permission denied");
        return "Workspace rule.";
      },
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]?.id).toBe("agents_workspace");
    expect(warn).toHaveBeenCalledWith("optional text file read failed", {
      label: "rules agents_user_data",
      path: join(dataRoot, "AGENTS.md"),
      error: "permission denied",
    });
  });
});

describe("loadMainAgentRuntimeContext", () => {
  it("loads AGENTS.md rules and skill catalog from the same runtime context", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-runtime-context-test-"));
    const dataRoot = join(root, "userData");
    const workspaceRoot = join(root, "workspace");
    const homeDir = join(root, "home");
    const skillDir = join(workspaceRoot, ".agents", "skills", "llm-agent-dev");
    await mkdir(skillDir, { recursive: true });
    await mkdir(homeDir, { recursive: true });
    await writeFile(join(workspaceRoot, "AGENTS.md"), "Workspace rule.", "utf8");
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: llm-agent-dev",
        "description: Use when building LLM agents.",
        "---",
        "",
        "# LLM Agent Dev",
      ].join("\n"),
      "utf8",
    );

    const context = await loadMainAgentRuntimeContext({
      dataRoot,
      workspaceRoot,
      homeDir,
      readPromptFile: async () => ({ path: join(dataRoot, "prompts", "main-agent.md"), content: "Core prompt" }),
    });

    expect(context.systemPrompt).toBe("Core prompt");
    expect(context.systemPromptSegments).toEqual([
      {
        id: "agents_workspace",
        title: "Workspace AGENTS.md",
        content: "Workspace rule.",
        bucket: "rules",
        priority: 80,
      },
      expect.objectContaining({
        id: "skill_catalog",
        title: "Available Skills",
        bucket: "skills",
        priority: 70,
      }),
    ]);
    expect(context.systemPromptSegments?.[1]?.content).toContain("<name>llm-agent-dev</name>");
    expect(context.systemPromptSegments?.[1]?.content).toContain(`<location>${join(skillDir, "SKILL.md")}</location>`);
    expect(context.systemPromptSegments?.[1]?.content).toContain("use read_file on the skill location");
  });
});
