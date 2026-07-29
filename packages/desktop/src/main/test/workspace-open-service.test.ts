import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppDataRoots } from "../agent-turn";
import { listWorkspaceOpenTools, openWorkspaceInTool } from "../workspace-open-service";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-open-"));
  created.push(workspaceRoot);
  return {
    dataRoot: workspaceRoot,
    sessionRoot: join(workspaceRoot, "sessions"),
    logRoot: join(workspaceRoot, "logs"),
    tmpRoot: join(workspaceRoot, "tmp"),
    defaultWorkspaceRoot: workspaceRoot,
    workspaceRoot,
  };
}

describe("workspace open service", () => {
  it("returns a stable tool catalog", async () => {
    const runner = vi.fn(async () => ({ ok: true }));
    const loadIcon = vi.fn(async () => "data:image/png;base64,native");
    const result = await listWorkspaceOpenTools(runner, loadIcon);

    expect(result.tools.map((tool) => tool.id)).toEqual(["vscode", "cursor", "finder", "terminal", "iterm2"]);
    expect(result.tools.map((tool) => tool.label)).toEqual(["VS Code", "Cursor", "Finder", "Terminal", "iTerm2"]);
    if (process.platform === "darwin") {
      expect(result.tools.find((tool) => tool.id === "finder")?.iconDataUrl).toBe("data:image/png;base64,native");
      expect(loadIcon).toHaveBeenCalledWith({
        bundlePath: "/System/Library/CoreServices/Finder.app",
        iconPath: "/System/Library/CoreServices/Finder.app/Contents/Resources/Finder.icns",
      });
    }
  });

  it("opens only the mapped app with the validated workspace", async () => {
    const roots = await makeRoots();
    const runner = vi.fn(async () => ({ ok: true }));

    const result = await openWorkspaceInTool({ toolId: "cursor" }, roots, runner);

    if (process.platform !== "darwin") {
      expect(result.error).toBe("unsupported_platform");
      return;
    }
    expect(result.ok).toBe(true);
    expect(runner).toHaveBeenNthCalledWith(1, ["-Ra", "Cursor"]);
    expect(runner).toHaveBeenNthCalledWith(2, ["-a", "Cursor", roots.workspaceRoot]);
  });

  it("does not invoke open for a missing workspace", async () => {
    const roots = await makeRoots();
    const runner = vi.fn(async () => ({ ok: true }));

    const result = await openWorkspaceInTool({ workspaceRoot: join(roots.workspaceRoot, "missing"), toolId: "finder" }, roots, runner);

    expect(result).toMatchObject({ ok: false, error: "invalid_workspace" });
    expect(runner).not.toHaveBeenCalled();
  });
});
