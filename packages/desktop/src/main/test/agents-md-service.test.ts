// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { loadAgentsMdSegments } from "../agents-md-service";

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
