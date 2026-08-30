import type {
  QuickOpenShortcutSettings,
  SessionListItem,
  WorkspaceEntry,
} from "@actspace/shared";

export type QuickOpenResolution =
  | { kind: "session"; sessionId: string }
  | { kind: "workspace"; workspaceId: string; workspaceRoot: string }
  | { kind: "empty" };

function normalizeRoot(root: string | undefined): string {
  return root?.replace(/\/+$/, "") ?? "";
}

export function orderQuickOpenProjects(
  workspaces: WorkspaceEntry[],
  sessions: SessionListItem[],
): WorkspaceEntry[] {
  const latestByWorkspace = new Map<string, string>();
  for (const session of sessions) {
    const workspace = workspaces.find((item) =>
      item.id === session.workspaceId || normalizeRoot(item.path) === normalizeRoot(session.workspaceRoot),
    );
    if (!workspace) continue;
    const current = latestByWorkspace.get(workspace.id) ?? "";
    if ((session.updatedAt ?? "") > current) latestByWorkspace.set(workspace.id, session.updatedAt ?? "");
  }
  return workspaces
    .filter((workspace) => !workspace.hidden && workspace.kind !== "default")
    .sort((a, b) => {
      const byActivity = (latestByWorkspace.get(b.id) ?? "").localeCompare(latestByWorkspace.get(a.id) ?? "");
      return byActivity || a.order - b.order || a.label.localeCompare(b.label);
    });
}

export function resolveQuickOpenTarget(
  shortcut: QuickOpenShortcutSettings,
  workspaces: WorkspaceEntry[],
  sessions: SessionListItem[],
): QuickOpenResolution {
  if (shortcut.target.kind === "session") {
    const targetSessionId = shortcut.target.sessionId;
    const session = sessions.find((item) => item.id === targetSessionId);
    if (session) return { kind: "session", sessionId: session.id };
  }
  if (shortcut.target.kind === "workspace") {
    const targetWorkspaceId = shortcut.target.workspaceId;
    const workspace = workspaces.find((item) => item.id === targetWorkspaceId && !item.hidden);
    if (workspace) return { kind: "workspace", workspaceId: workspace.id, workspaceRoot: workspace.path };
  }
  const firstProject = orderQuickOpenProjects(workspaces, sessions)[0];
  return firstProject
    ? { kind: "workspace", workspaceId: firstProject.id, workspaceRoot: firstProject.path }
    : { kind: "empty" };
}
