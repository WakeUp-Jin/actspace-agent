import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SessionWorktreeContext, WorkspaceGitContext } from "@actspace/shared";
import type { HostConnection } from "@actspace/shared/host-protocol";
import { hostsApi } from "../api/hosts";
import { useShallowStable } from "../hooks/useShallowStable";
import { useHostDirectory, type HostDescription, type HostDirectorySnapshot } from "./host-directory";
import { locateSession } from "./locate-session";
import { resolveReadiness, type RunTargetReadiness } from "./readiness";
import { remoteSessionPrefs, resolveRemoteWorkspaceId } from "./remote-session-prefs";
import { capabilitiesOf, type RunTarget, type RunTargetCapabilities } from "./run-target";
import { useRemoteModel } from "./use-model-catalog";

export type RunTargetInput = {
  readonly sessionId: string | null;
  /** 会话 meta 里的工作区路径；远端旧会话没有 prefs 记录时用它反查 workspaceId。 */
  readonly sessionWorkspacePath?: string | null;
  /** 已有会话时运行目标不可再改。 */
  readonly locked: boolean;
  readonly local: { readonly workspaceRoot?: string; readonly branch?: string; readonly worktree?: SessionWorktreeContext; readonly gitStatus?: WorkspaceGitContext["status"] };
};

export type RunTargetState = {
  readonly target: RunTarget;
  readonly capabilities: RunTargetCapabilities;
  readonly locked: boolean;
  /** 能不能发送；不能时的原因用 `describeReadiness` 转成文案。 */
  readonly readiness: RunTargetReadiness;
  readonly choices: RunTargetChoices;
};

/**
 * 15 T14：运行位置、远端工作区、远端模型的选项和写入口。
 * Composer 的 3 个 select 读它（09 换成菜单后仍从这里取数据）；选中的值在 `target` 和 `modelId` 里。
 */
export type RunTargetChoices = {
  readonly hosts: readonly HostConnection[];
  /** 当前远端目标的 Host 描述；本机或还没读到时为 undefined。 */
  readonly description?: HostDescription;
  /** 远端目标选中的模型；本机时为空串。 */
  readonly modelId: string;
  /** 只在新建页生效；已有会话的 Host 由会话 key 决定。 */
  readonly selectHost: (hostId: string | null) => void;
  readonly selectWorkspace: (workspaceId: string) => void;
  readonly selectModel: (modelId: string) => void;
};

const selectHosts = (snapshot: HostDirectorySnapshot) => snapshot.hosts;
const selectDescriptions = (snapshot: HostDirectorySnapshot) => snapshot.descriptions;
const selectSnapshot = (snapshot: HostDirectorySnapshot) => snapshot;
const noPrefs = () => () => {};

/**
 * 15 S4：当前会话（或新建页）在哪里运行，以及它能做什么。
 * 远端会话的 workspaceId 先看 prefs；没有记录时按会话路径反查，在 effect 里写回一次。
 * 新建页的 Host 和工作区是这里的本地选择；换 Host 时工作区回到该 Host 的第一个。
 */
export function useRunTarget({ sessionId, sessionWorkspacePath, locked, local }: RunTargetInput): RunTargetState {
  const location = locateSession(sessionId);
  const sessionHostId = location.kind === "remote" ? location.hostId : null;
  const prefs = useSyncExternalStore(
    sessionHostId ? remoteSessionPrefs.subscribe : noPrefs,
    () => sessionId && sessionHostId ? remoteSessionPrefs.get(sessionId) : undefined,
  );
  const descriptions = useHostDirectory(selectDescriptions);
  const resolved = sessionHostId ? resolveRemoteWorkspaceId(prefs, sessionWorkspacePath, descriptions[sessionHostId]) : null;
  useEffect(() => {
    if (sessionId && resolved?.fromPath) remoteSessionPrefs.set(sessionId, { workspaceId: resolved.workspaceId });
  }, [sessionId, resolved?.fromPath, resolved?.workspaceId]);
  // 没有记录也没有路径时用下面的本地选择（与原来一致）。
  const sessionWorkspaceId = resolved && (prefs?.workspaceId || sessionWorkspacePath) ? resolved.workspaceId : undefined;

  const hosts = useHostDirectory(selectHosts);
  const [selectedHostId, selectHost] = useState<string | null>(null);
  const hostId = sessionId ? sessionHostId : selectedHostId;
  const description = hostId ? descriptions[hostId] : undefined;
  const [selectedWorkspaceId, selectWorkspace] = useState("");
  const firstWorkspaceId = description?.workspaces[0]?.id ?? "";
  useEffect(() => { selectWorkspace(firstWorkspaceId); }, [hostId, firstWorkspaceId]);
  // 让 main 把当前会话所在的 Host 设为活动连接；Host 列表变化（如重连）后再报一次。
  useEffect(() => { void hostsApi.activate(sessionId).catch(() => undefined); }, [sessionId, hosts]);
  const { modelId: remoteModelId, selectModel } = useRemoteModel(sessionId, hostId);

  const hostName = hosts.find((host) => host.hostId === hostId)?.name ?? hostId ?? "";
  // sessionWorkspaceId 只在远端会话上有值；新建页和没有记录的旧会话用本地选择。
  const workspaceId = (sessionWorkspaceId ?? selectedWorkspaceId) || undefined;
  const workspaceName = workspaceId ? description?.workspaces.find((workspace) => workspace.id === workspaceId)?.name : undefined;
  const invalidKey = location.kind === "invalid" ? location.key : null;
  const target = useMemo<RunTarget>(() => {
    if (invalidKey !== null) return { kind: "invalid", key: invalidKey };
    if (hostId) return { kind: "remote", hostId, hostName, workspaceId, workspaceName };
    return { kind: "local", workspaceRoot: local.workspaceRoot, branch: local.branch, worktree: local.worktree };
  }, [invalidKey, hostId, hostName, workspaceId, workspaceName, local.workspaceRoot, local.branch, local.worktree]);
  const capabilities = useMemo(() => capabilitiesOf(target, { gitStatus: local.gitStatus }), [target, local.gitStatus]);
  const directory = useHostDirectory(selectSnapshot);
  const readiness = useShallowStable(resolveReadiness({ target, directory, workspaceId, modelId: remoteModelId || undefined }));
  const choices = useShallowStable<RunTargetChoices>({ hosts, description, modelId: remoteModelId, selectHost, selectWorkspace, selectModel });
  return useShallowStable<RunTargetState>({ target, capabilities, locked, readiness, choices });
}
