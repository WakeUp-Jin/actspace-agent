import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import type { WorkspaceOpenInIdeResult } from "@actspace/shared";
import type { WorkspaceRegistryOptions } from "./workspace-registry-service";
import { readWorkspaceRegistry } from "./workspace-registry-service";

const execFileAsync = promisify(execFile);

export type WorkspaceIdeServiceDeps = {
  openDirectory?: (path: string) => Promise<void>;
};

async function openInCursor(path: string): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("/usr/bin/open", ["-a", "Cursor", path]);
    return;
  }
  await execFileAsync("cursor", [path]);
}

export async function openWorkspaceInIde(
  options: WorkspaceRegistryOptions,
  workspaceId: string,
  deps: WorkspaceIdeServiceDeps = {},
): Promise<WorkspaceOpenInIdeResult> {
  const registry = await readWorkspaceRegistry(options);
  const workspace = registry.items.find((item) => item.id === workspaceId);
  if (!workspace) return { ok: false, error: "workspace_not_found" };
  if (workspace.hidden) return { ok: false, error: "workspace_hidden" };

  try {
    const directory = await stat(workspace.path);
    if (!directory.isDirectory()) return { ok: false, error: "directory_not_found" };
  } catch {
    return { ok: false, error: "directory_not_found" };
  }

  try {
    await (deps.openDirectory ?? openInCursor)(workspace.path);
    return { ok: true };
  } catch {
    return { ok: false, error: "open_failed" };
  }
}
