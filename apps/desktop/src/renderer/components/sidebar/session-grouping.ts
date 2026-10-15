import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";

const UNNAMED_WORKSPACE_LABEL = "工作区";

export function workspaceLabelFromRoot(root: string | undefined | null): string {
  if (!root) return UNNAMED_WORKSPACE_LABEL;
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? UNNAMED_WORKSPACE_LABEL;
}

function sessionRoot(session: SessionListItem): string | undefined {
  return (session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot) || undefined;
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
    (session.workspaceRoot || undefined);
}

/** 本机会话归属的已登记工作区：先按 id，再按路径。远端会话不归本机工作区。 */
function matchSessionWorkspace(session: SessionListItem, workspaces: WorkspaceEntry[]): WorkspaceEntry | undefined {
  if (session.hostId) return undefined;
  const root = sessionRoot(session);
  return workspaces.find((workspace) => workspace.id === session.workspaceId) ??
    (root ? workspaces.find((workspace) => workspace.path === root) : undefined);
}

/** 旧版本留下的本机会话：既没有登记的工作区，也没有路径。侧栏不显示。 */
export function isOrphanSession(session: SessionListItem, workspaces: WorkspaceEntry[]): boolean {
  return !session.hostId && !sessionRoot(session) && !matchSessionWorkspace(session, workspaces);
}

/** 远端会话，或归在本机已登记工作区里的会话。已归档会话只在这些分组里显示，免得已移除的工作区又冒出来。 */
export function isInRegisteredWorkspace(session: SessionListItem, workspaces: WorkspaceEntry[]): boolean {
  return Boolean(session.hostId) || matchSessionWorkspace(session, workspaces) !== undefined;
}

/** 单列表、按时间和搜索结果里行尾的工作区名：远端是「Host · 目录名」，本机是登记的名称，其次目录名。 */
export function sessionWorkspaceLabel(session: SessionListItem, workspaces: WorkspaceEntry[], hostNameOf?: HostNameLookup): string {
  if (session.hostId) return remoteGroupLabel(session.hostId, session, hostNameOf);
  return matchSessionWorkspace(session, workspaces)?.label ?? workspaceLabelFromRoot(sessionRoot(session));
}

/** 侧栏分组的 key：远端按 Host + 路径；本机按匹配到的工作区 id，其次会话自带的 id，最后按路径。 */
function sessionGroupKey(session: SessionListItem, matchedWorkspace: WorkspaceEntry | undefined): string {
  if (session.hostId) return JSON.stringify([session.hostId, sessionRoot(session)]);
  return matchedWorkspace?.id ?? session.workspaceId ?? sessionRoot(session)!;
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
    if (isOrphanSession(session, workspaces)) continue;
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
    if (isOrphanSession(session, workspaces)) continue;
    const key = sessionGroupKey(session, matchSessionWorkspace(session, workspaces));
    const current = groups.get(key) ?? [];
    current.push(session);
    groups.set(key, current);
  }
  return groups;
}
