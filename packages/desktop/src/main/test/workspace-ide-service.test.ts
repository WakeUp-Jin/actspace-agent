import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openWorkspaceInIde } from "../workspace-ide-service";
import { readWorkspaceRegistry, setWorkspaceHidden } from "../workspace-registry-service";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-workspace-ide-"));
  created.push(dataRoot);
  const defaultWorkspaceRoot = join(dataRoot, "Downloads");
  const workspaceRoot = join(dataRoot, "project");
  await Promise.all([mkdir(defaultWorkspaceRoot), mkdir(workspaceRoot)]);
  const options = {
    dataRoot,
    defaultWorkspaceRoot,
    fallbackWorkspaceRoot: defaultWorkspaceRoot,
    sessions: [{
      id: "session-1",
      title: "Project session",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
      agentRunCount: 1,
      workspaceRoot,
    }],
  };
  const registry = await readWorkspaceRegistry(options);
  const workspace = registry.items.find((item) => item.path === resolve(workspaceRoot));
  return { options, workspace: workspace! };
}

describe("workspace IDE service", () => {
  it("opens a visible registered directory", async () => {
    const { options, workspace } = await fixture();
    const openDirectory = vi.fn(async () => undefined);

    await expect(openWorkspaceInIde(options, workspace.id, { openDirectory })).resolves.toEqual({ ok: true });
    expect(openDirectory).toHaveBeenCalledWith(workspace.path);
  });

  it("rejects hidden and missing workspaces without opening a path", async () => {
    const { options, workspace } = await fixture();
    const openDirectory = vi.fn(async () => undefined);
    await setWorkspaceHidden(options, workspace.id, true);

    await expect(openWorkspaceInIde(options, workspace.id, { openDirectory })).resolves.toEqual({
      ok: false,
      error: "workspace_hidden",
    });
    await expect(openWorkspaceInIde(options, "missing", { openDirectory })).resolves.toEqual({
      ok: false,
      error: "workspace_not_found",
    });
    expect(openDirectory).not.toHaveBeenCalled();
  });
});
