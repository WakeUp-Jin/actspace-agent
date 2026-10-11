import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";

export const DEFAULT_WORKSPACE_KEY = "__default__";
const DEFAULT_WORKSPACE_LABEL = "默认工作区";

export function workspaceLabelFromRoot(root: string | undefined | null): string {
  if (!root) return DEFAULT_WORKSPACE_LABEL;
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? DEFAULT_WORKSPACE_LABEL;
}

function workspaceKey(root: string | undefined | null): string {
  return root && root.length > 0 ? root : DEFAULT_WORKSPACE_KEY;
}

export type WorkspaceGroup = {
  hostId?: string;
  key: string;
  label: string;
  workspaceId?: string;
  workspaceRoot?: string;
  sessions: SessionListItem[];
};

export function sessionWorkspaceRoot(session: SessionListItem, workspaces: WorkspaceEntry[]): string | undefined {
  if (session.hostId) return session.workspaceRoot;
  return workspaces.find((workspace) => workspace.id === session.workspaceId)?.path ??
    workspaces.find((workspace) => session.workspaceRoot && workspace.path === session.workspaceRoot)?.path ??
    session.workspaceRoot ??
    workspaces.find((workspace) => workspace.kind === "default")?.path;
}

/** 本机会话归属的已登记工作区：先按 id，再按路径；没有路径时归默认工作区。远端会话不归本机工作区。 */
function matchSessionWorkspace(session: SessionListItem, workspaces: WorkspaceEntry[]): WorkspaceEntry | undefined {
  if (session.hostId) return undefined;
  return workspaces.find((workspace) => workspace.id === session.workspaceId) ??
    workspaces.find((workspace) => (session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot) && workspace.path === (session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot)) ??
    ((session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot) ? undefined : workspaces.find((workspace) => workspace.kind === "default"));
}

/** 侧栏分组的 key：远端按 Host + 路径；本机按匹配到的工作区 id，其次会话自带的 id，最后按路径。 */
function sessionGroupKey(session: SessionListItem, matchedWorkspace: WorkspaceEntry | undefined): string {
  if (session.hostId) return JSON.stringify([session.hostId, (session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot)]);
  return matchedWorkspace?.id ?? session.workspaceId ?? workspaceKey((session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot));
}

/** 远端分组标签里的 Host 名：优先 HostDirectory 里的当前名称，其次会话记录的名称，最后用 hostId。 */
export type HostNameLookup = (hostId: string) => string | undefined;

function remoteGroupLabel(hostId: string, session: SessionListItem, hostNameOf?: HostNameLookup): string {
  const hostName = hostNameOf?.(hostId) ?? session.hostName ?? hostId;
  return `${hostName} · ${workspaceLabelFromRoot((session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot))}`;
}

export function groupSessionsByWorkspace(
  sessions: SessionListItem[],
  workspaces: WorkspaceEntry[] = [],
  hostNameOf?: HostNameLookup,
): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>();
  for (const workspace of workspaces) {
    groups.set(workspace.id, {
      key: workspace.id,
      label: workspace.label,
      workspaceId: workspace.id,
      workspaceRoot: workspace.path,
      sessions: [],
    });
  }

  for (const session of sessions) {
    const matchedWorkspace = matchSessionWorkspace(session, workspaces);
    const key = sessionGroupKey(session, matchedWorkspace);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        hostId: session.hostId,
        label: session.hostId ? remoteGroupLabel(session.hostId, session, hostNameOf) : matchedWorkspace?.label ?? workspaceLabelFromRoot((session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot)),
        workspaceId: matchedWorkspace?.id ?? session.workspaceId,
        workspaceRoot: matchedWorkspace?.path ?? (session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot),
        sessions: [],
      });
    }
    groups.get(key)!.sessions.push(session);
  }

  // 组内会话按 updatedAt 降序（最近修改/创建在前）；下方组排序依赖 sessions[0] 为最新。
  for (const group of groups.values()) {
    group.sessions.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  const ordered = [...groups.values()];
  ordered.sort((a, b) => {
    if (a.key === DEFAULT_WORKSPACE_KEY) return 1;
    if (b.key === DEFAULT_WORKSPACE_KEY) return -1;
    const aLatest = a.sessions[0]?.updatedAt ?? "";
    const bLatest = b.sessions[0]?.updatedAt ?? "";
    return bLatest.localeCompare(aLatest);
  });

  return ordered;
}

/** 按分组 key 收集会话，不排序。侧栏用它判断工作区「归档全部」是否可用，传入的是全部会话（含置顶）。 */
export function sessionsByGroupKey(sessions: SessionListItem[], workspaces: WorkspaceEntry[]): Map<string, SessionListItem[]> {
  const groups = new Map<string, SessionListItem[]>();
  for (const session of sessions) {
    const key = sessionGroupKey(session, matchSessionWorkspace(session, workspaces));
    const current = groups.get(key) ?? [];
    current.push(session);
    groups.set(key, current);
  }
  return groups;
}
