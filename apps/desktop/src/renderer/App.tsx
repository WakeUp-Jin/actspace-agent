import { useShallowStable } from "./hooks/useShallowStable";
import { remoteSessionPrefs } from "./target/remote-session-prefs";
import { useRunTarget } from "./target/use-run-target";
import type { RunTargetValue } from "./target/run-target-context";
import type { SideChatRuntimeValue } from "./components/right-panel/side-chat/side-chat-runtime";
import { sideChatOpenError } from "./components/right-panel/side-chat/use-open-side-chat";
import { createEmptyStreamingState } from "./session/session-run-state";
import { upsertStreamingTool } from "./session/live-runs/stream-state";
import type { CompactionBlock } from "./session/live-runs/stream-blocks";
import { getSessionTitle } from "./session/session-title";
import { createSessionCellRetention } from "./session/session-store";
import { useSessionTranscript } from "./session/use-session-transcript";
import { createLiveRunStore, TERMINAL_RUN_LIMIT, useBusySessionIds, type StreamEvent } from "./session/live-runs/live-run-store";
import { scheduleFrame } from "./session/frame-batch";
import { applyTaskSnapshot as applyHostTaskSnapshot, createTaskQueueStore } from "./session/task-queue";
import { loadEarlier } from "./session/session-pages";
import { createSessionLocalStore, useSessionLocalIds, useSessionLocalState, type ComposerSessionState, type SessionLocalState } from "./session/session-local-store";
import type { SessionBrowseState } from "./session/SessionBrowseContext";
import type { ActiveSessionValue } from "./session/active-session-context";
import type { SessionActionsValue } from "./session/session-actions-context";
import { useSessionDrafts, type ComposerContextValue } from "./components/composer/composer-context";
import {
  EMPTY_MESSAGE_QUEUE,
  isQueueEmpty,
  takeSteering,
  type SessionMessageQueue,
} from "./session/message-queue";
import type { MessageQueueControls } from "./components/composer/MessageQueueTray";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  DEFAULT_MODEL_ID,
  createMessageBlocks,
  formatSessionTranscript,
  getLatestContextSnapshot,
} from "@actspace/shared";
import type {
  AbortAgentRunInput,
  AgentRunResult,
  AppSettings,
  BootstrapState,
  ComposerMode,
  ContextState,
  ContextUsageSnapshot,
  MessageBlock,
  ModelSelectionId,
  ModelId,
  ModelKey,
  UsableModelView,
  SessionEvent,
  SessionRunLocation,
  SessionListItem,
  SessionRecord,
  WorkspaceEntry,
  WorkspaceGitContext,
  WorkspaceListResult,
} from "@actspace/shared";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import { useReviewSummary } from "./components/review/use-review-summary";
import { AppProviders } from "./app/providers";
import { clearPendingSubmission, readPendingSubmission, sweepExpiredPendingSubmissions, writePendingSubmission } from "./session/pending-submission";
import { createSessionGateway } from "./session/session-gateway";
import { ClientSessionStore, selectChatSession, projectChatWindow } from "@actspace/client/sessions";
import { getSession, sessionsApi } from "./api/sessions";
import { ShutdownOverlay } from "./components/ShutdownOverlay";
import { resolvePreferredChatModel } from "./model-selection";
import type { ComposerExecutionContext, ComposerSendOptions, ComposerWorkspaceOption } from "./components/Composer";
import type { NewSessionInput, SessionUiStatusKind } from "./components/Sidebar";
import { orderQuickOpenProjects, resolveQuickOpenTarget } from "./quick-open-routing";
import { isOrphanSession, sessionsByGroupKey } from "./components/sidebar/session-grouping";
import { appApi } from "./api/app";
import { approvalsApi } from "./api/approvals";
import { dialogsApi } from "./api/dialogs";
import { eventsApi } from "./api/events";
import { liveEvents } from "./api/live-events";
import { modelsApi } from "./api/models";
import { quickOpenApi } from "./api/quick-open";
import { settingsApi } from "./api/settings";
import { tasksApi } from "./api/tasks";
import { workspacesApi } from "./api/workspaces";
import { hostDirectory, useHostDirectory, type HostDirectorySnapshot } from "./target/host-directory";
import { isLocalSession, locateSession } from "./target/locate-session";

function sessionReadError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (/HostDisconnectedError|Host is offline|Host connection lost/i.test(message)) return "远端连接已断开，暂时无法加载会话。连接恢复后将自动刷新，也可点击重试。";
  if (/Error invoking remote method/.test(message)) return `${fallback}，请稍后重试。`;
  return message || fallback;
}

/** 还没有会话（新建会话页）时 composer 模式与技能的存放键。 */
const DRAFT_COMPOSER_KEY = "__draft__";
const EMPTY_EVENTS: SessionEvent[] = [];
const QUEUE_REFRESH_FAILED = "队列状态读取失败，请稍后重试。";
const QUEUE_COMMAND_FAILED = "队列操作没有完成，请重试。";
const selectComposerState = (state: SessionLocalState) => state.composer;
const selectApprovalPending = (state: SessionLocalState) => state.approvalPending;
const selectFailed = (state: SessionLocalState) => state.failed;
const selectUnread = (state: SessionLocalState) => state.unread;
const selectDraft = (state: SessionLocalState) => state.draft ?? null;
const selectMessageQueue = (state: SessionLocalState) => state.messageQueue;
const DEFAULT_COMPOSER_STATE: ComposerSessionState = {
  mode: "agent",
  selectedSkills: [],
};
/** `not_started`：会话已有运行，没有发出。`rejected`：发送前校验失败，正文已放回输入框。 */
type SessionRunOutcome = AgentRunResult["status"] | "rejected" | "not_started";

function normalizeWorkspaceRoot(root: string | undefined | null): string | null {
  const trimmed = root?.trim();
  return trimmed ? trimmed : null;
}

function workspaceLabelFromRoot(root: string): string {
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? root;
}

function createWorkspaceOptionsFromRoots(roots: Array<string | undefined | null>): ComposerWorkspaceOption[] {
  const options = new Map<string, ComposerWorkspaceOption>();
  for (const root of roots) {
    const normalized = normalizeWorkspaceRoot(root);
    if (!normalized || options.has(normalized)) continue;
    options.set(normalized, { value: normalized, label: workspaceLabelFromRoot(normalized) });
  }
  return [...options.values()];
}

/** 没选工作区时的兜底：最近活跃的可见工作区；一个都没有时为 null，新建会话页不能发送。 */
function firstVisibleWorkspaceRoot(registry: WorkspaceListResult | null | undefined, sessions: SessionListItem[]): string | null {
  return normalizeWorkspaceRoot(registry ? orderQuickOpenProjects(registry.items, sessions)[0]?.path : null);
}

function createWorkspaceOptionsFromRegistry(items: WorkspaceEntry[]): ComposerWorkspaceOption[] {
  return items.filter((workspace) => !workspace.hidden).map((workspace) => ({
    value: workspace.path,
    label: workspace.label,
    workspaceId: workspace.id,
  }));
}

function copyWithSelection(value: string): void {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

async function copyTextToClipboard(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      copyWithSelection(value);
    }
  } catch {
    copyWithSelection(value);
  }
}

const selectKnownHosts = (snapshot: HostDirectorySnapshot) => snapshot.loaded ? snapshot.hosts : null;

export function App() {
  const sessionStore = useMemo(() => new ClientSessionStore(), []);
  const [cellRetention] = useState(() => createSessionCellRetention(sessionStore));
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [browseGroups, setBrowseGroups] = useState<import("@actspace/shared").SessionListPage['groups']>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listRetry, setListRetry] = useState(0);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [earlierLoading, setEarlierLoading] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  const sidebarSessionsRef = useRef(sessions);
  sidebarSessionsRef.current = sessions;
  const loadedListPages = useRef(new Map<string, number>());
  const readSidebarSessions = useCallback(async () => {
    const first = await sessionsApi.listPage();
    const items = [...first.items];
    const groups = [...first.groups];
    for (const group of first.groups) {
      const key = JSON.stringify([group.hostId ?? "local", group.workspaceRoot, group.pinned]);
      let hasMore = group.hasMore;
      for (let page = 1; page < (loadedListPages.current.get(key) ?? 1) && hasMore; page++) {
        const after = items.filter(s => s.hostId === group.hostId && (s.worktree?.sourceWorkspaceRoot ?? s.workspaceRoot ?? '') === group.workspaceRoot && !!s.pinned === group.pinned).at(-1)?.id;
        const next = await sessionsApi.listPage({ hostId: group.hostId, workspaceRoot: group.workspaceRoot, pinned: group.pinned, after });
        items.push(...next.items); hasMore = next.groups[0]?.hasMore ?? false;
      }
      group.hasMore = hasMore;
    }
    // Removing a connection must not remove already displayed history. Its
    // Session remains bound to the absent Host and can never become local.
    const directory = hostDirectory.getSnapshot();
    const known = new Set((directory.loaded && !directory.listError ? directory.hosts : await hostDirectory.refresh()).map(host => host.hostId));
    for (const item of sidebarSessionsRef.current) {
      if (!item.hostId || known.has(item.hostId) || items.some(next => next.id === item.id)) continue;
      items.push({ ...item, connectionState: "offline" });
      if (!groups.some(group => group.hostId === item.hostId && group.workspaceRoot === (item.workspaceRoot ?? "") && group.pinned === !!item.pinned)) {
        groups.push({ hostId: item.hostId, workspaceRoot: item.workspaceRoot ?? "", pinned: !!item.pinned, hasMore: false });
      }
    }
    setBrowseGroups(groups);
    return [...new Map(items.map(s => [s.id, s])).values()];
  }, []);
  const messageRequestRef = useRef(0);
  const historyPendingRef = useRef<number | null>(null);
  const [workspaceRegistry, setWorkspaceRegistry] = useState<WorkspaceListResult | null>(null);
  const fallbackWorkspaceRoot = useMemo(() => firstVisibleWorkspaceRoot(workspaceRegistry, sessions), [workspaceRegistry, sessions]);
  const [sessionBootstrapComplete, setSessionBootstrapComplete] = useState(false);
  // 运行中的 run 和 Host 任务队列缓存（14 T16）；当前会话的流式视图在 selectedSessionId 之后读取。
  // 流式增量按帧通知：一帧里来多少个 delta，App 都只渲染一次。
  const [liveRuns] = useState(() => createLiveRunStore(TERMINAL_RUN_LIMIT, { scheduleNotify: scheduleFrame }));
  const [taskQueue] = useState(createTaskQueueStore);
  const [sendScrollRequestId, setSendScrollRequestId] = useState(0);
  const [composerFocusRequestId, setComposerFocusRequestId] = useState(0);
  const [defaultModelId, setDefaultModelId] = useState<ModelSelectionId | undefined>(undefined);
  const [selectedChatModelId, setSelectedChatModelId] = useState<ModelSelectionId>(DEFAULT_MODEL_ID);
  const [usableChatModels, setUsableChatModels] = useState<UsableModelView[] | undefined>(undefined);
  const [selectedWorkspaceRoot, setSelectedWorkspaceRoot] = useState<string | null>(null);
  const [workspaceGitContext, setWorkspaceGitContext] = useState<WorkspaceGitContext | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>(undefined);
  const [runLocation, setRunLocation] = useState<SessionRunLocation>("this_mac");
  const busySessionIds = useBusySessionIds(liveRuns);
  const modeChangePendingRef = useRef(new Set<string>());
  // 页 / 审批请求的版本号全局递增，各会话在 store 里只记最近一次的值：evict 之后重新计数也不会和在途的旧请求撞号。
  const requestVersionRef = useRef(0);
  const hydratedSessionIdsRef = useRef(new Set<string>());
  // 每个会话被 evict 的次数：evict 之前发出、之后才回来的快照不能把释放掉的状态重新建出来。
  const evictionCountRef = useRef(new Map<string, number>());
  // 每个会话正在进行的发送数：发送期间不恢复未确认提交，避免把正在发的内容又放回输入框。
  const sendsInFlightRef = useRef(new Map<string, number>());
  // 已归档 / 移除、但 run 还没结束的会话：run 结束后再释放本地状态（14 T7）。
  const pendingEvictionsRef = useRef(new Set<string>());
  const connectedHostIdsRef = useRef(new Set<string>());
  // 按会话的本地状态（草稿、composer 模式与技能……）；14 T5 起逐类从各个 ref / state 迁入。
  const [localStore] = useState(createSessionLocalStore);
  const patchLocal = useCallback((sessionId: string, patch: Partial<SessionLocalState>) => {
    localStore.update(sessionId, (state) => ({ ...state, ...patch }));
  }, [localStore]);
  const setLocalFlag = useCallback((sessionId: string, flag: "approvalPending" | "failed" | "unread", value: boolean) => {
    localStore.update(sessionId, (state) => state[flag] === value ? state : { ...state, [flag]: value });
  }, [localStore]);
  const approvalPendingSessionIds = useSessionLocalIds(localStore, selectApprovalPending);
  const failedSessionIds = useSessionLocalIds(localStore, selectFailed);
  const unreadSessionIds = useSessionLocalIds(localStore, selectUnread);
  // 压缩失败没有 durable 事件；运行结束后按会话保留失败分隔线，直到该会话下一次发送。
  const [composerNotice, setComposerNotice] = useState<{ sessionId: string; text: string } | null>(null);
  const continueQueueRef = useRef<(sessionId: string, outcome: SessionRunOutcome) => Promise<void>>(async () => {});
  const activeSessionIdRef = useRef<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  // 当前会话的本地状态直接从 store 选取；切换会话不再需要逐项复制（14 T6）。
  const composerDraftRestore = useSessionLocalState(localStore, selectedSessionId, selectDraft);
  const messageQueue = useSessionLocalState(localStore, selectedSessionId, selectMessageQueue);
  // durable 历史从 store 的 cell 派生；cell 不放进 App 的作用域，见 useChatSessionRecord。
  const { sessionRecord, historyBefore, live: liveView, messages, isCompacting } = useSessionTranscript({ sessionStore, liveRuns, localStore }, selectedSessionId, bootstrapState?.workspaceRoot);
  const { blocks: streamingBlocks, isStreaming, isAborting } = liveView;
  const runTarget = useRunTarget({
    sessionId: selectedSessionId,
    sessionWorkspacePath: sessionRecord?.meta.workspaceRoot,
    locked: !!sessionRecord,
    local: { workspaceRoot: sessionRecord?.meta.workspaceRoot ?? selectedWorkspaceRoot ?? fallbackWorkspaceRoot ?? undefined, branch: selectedBranch, worktree: sessionRecord?.meta.worktree, gitStatus: workspaceGitContext?.status },
  });
  const { choices: targetChoices } = runTarget;
  const isLocalTarget = runTarget.target.kind === "local";
  const setActiveSessionId = useCallback((sessionId: string | null) => {
    ++messageRequestRef.current;
    historyPendingRef.current = null;
    setEarlierLoading(false);
    setEarlierError(null);
    setMessageLoading(false);
    setMessageError(null);
    activeSessionIdRef.current = sessionId;
    if (sessionId) pendingEvictionsRef.current.delete(sessionId);
    if (sessionId) setLocalFlag(sessionId, "unread", false);
    setSelectedSessionId(sessionId);
  }, [setLocalFlag]);
  const userPickedChatModelRef = useRef(false);

  const refreshWorkspaces = useCallback(async () => {
    const registry = await workspacesApi.list();
    setWorkspaceRegistry(registry);
    return registry;
  }, []);

  const findWorkspaceOption = useCallback((workspaceRoot: string | null | undefined) => {
    const normalized = normalizeWorkspaceRoot(workspaceRoot);
    if (!normalized) return undefined;
    return workspaceRegistry?.items.find((workspace) => workspace.path === normalized);
  }, [workspaceRegistry?.items]);

  const setApprovalPendingForSession = useCallback((sessionId: string | null | undefined, pending: boolean) => {
    if (!sessionId) return;
    patchLocal(sessionId, { approvalVersion: ++requestVersionRef.current });
    setLocalFlag(sessionId, "approvalPending", pending);
  }, [patchLocal, setLocalFlag]);

  const setFailedForSession = useCallback((sessionId: string | null | undefined, failed: boolean) => {
    if (!sessionId) return;
    setLocalFlag(sessionId, "failed", failed);
  }, [setLocalFlag]);

  const updateMessageQueue = useCallback((sessionId: string, update: (queue: SessionMessageQueue) => SessionMessageQueue) => {
    const current = localStore.get(sessionId).messageQueue;
    const updated = update(current);
    if (updated === current) return;
    const next = isQueueEmpty(updated) ? EMPTY_MESSAGE_QUEUE : updated;
    patchLocal(sessionId, { messageQueue: next });
  }, [localStore, patchLocal]);

  const refreshSessionRef = useRef<(id: string) => Promise<unknown>>(async () => {});
  const applyTaskSnapshot = useCallback((snapshot: import("@actspace/shared/runtime-v2").TaskSnapshot) => applyHostTaskSnapshot(snapshot, {
    tasks: taskQueue, runs: liveRuns, patchLocal,
    notice: (sessionId, text) => setComposerNotice({ sessionId, text }),
    refreshSession: (sessionId) => { void refreshSessionRef.current(sessionId).catch(console.error); },
  }), [taskQueue, liveRuns, patchLocal]);
  // 14 S9：影响界面的后台请求失败时，在当前会话的输入框上方提示（3 秒后消失），同时打到控制台。
  // 只提示当前会话，避免后台会话的失败顶掉当前会话的提示。
  const reportSessionFailure = useCallback((sessionId: string, text: string) => (error: unknown) => {
    console.error(text, error);
    if (activeSessionIdRef.current === sessionId) setComposerNotice({ sessionId, text });
  }, []);
  const refreshTaskQueue = useCallback(async (sessionId: string) => {
    const evictions = evictionCountRef.current.get(sessionId);
    const result = await tasksApi.command({ sessionId, op: "snapshot" });
    if (evictionCountRef.current.get(sessionId) !== evictions) return;
    applyTaskSnapshot(result.snapshot);
  }, [applyTaskSnapshot]);
  const taskCommand = useCallback(async (command: import("@actspace/shared/runtime-v2").TaskCommand) => {
    const result = await tasksApi.command(command);
    applyTaskSnapshot(result.snapshot);
    if (result.error) { setComposerNotice({ sessionId: command.sessionId, text: "队列状态已变化，请根据最新状态重试。" }); return false; }
    return true;
  }, [applyTaskSnapshot]);
  useEffect(() => {
    if (selectedSessionId) void refreshTaskQueue(selectedSessionId).catch(reportSessionFailure(selectedSessionId, QUEUE_REFRESH_FAILED));
    return liveEvents.onMessage("task-queue-updated", ({ event }) => {
      if (event.sessionId) void refreshTaskQueue(event.sessionId).catch(reportSessionFailure(event.sessionId, QUEUE_REFRESH_FAILED));
    });
  }, [selectedSessionId, refreshTaskQueue, reportSessionFailure]);
  // 启动时清理超过 7 天的未确认提交记录。
  useEffect(() => { sweepExpiredPendingSubmissions(); }, []);
  // 14 S10：激活会话时，上次未确认的提交恢复为草稿（本地与远端会话相同）。先查任务快照：
  // 已有相同 submissionId 说明 Runtime 收到了，只清理记录；查询失败时降级为恢复草稿。永不自动重发。
  // 正在发送、或输入框里已有用户输入（文字或附件）时不恢复：前者会把正在发的内容放回去，后者会覆盖用户刚输入的内容。
  useEffect(() => {
    const sessionId = selectedSessionId;
    const blocked = (id: string) => {
      const local = localStore.get(id);
      return Boolean(local.draft || local.composerText?.trim() || local.attachments?.length || sendsInFlightRef.current.get(id));
    };
    if (!sessionId || blocked(sessionId)) return;
    const record = readPendingSubmission(sessionId);
    if (!record) return;
    let cancelled = false;
    void (async () => {
      let accepted = false;
      try {
        await refreshTaskQueue(sessionId);
        accepted = taskQueue.snapshot(sessionId)?.tasks.some((task) => task.submissionId === record.id) ?? false;
      } catch (error) { console.error("Failed to check pending submission", error); }
      if (accepted) { clearPendingSubmission(sessionId); return; }
      // 等待期间切走了会话、开始了发送、有了输入或草稿、记录变了，就不覆盖。
      if (cancelled || blocked(sessionId) || readPendingSubmission(sessionId)?.id !== record.id) return;
      patchLocal(sessionId, { draft: { ...record.draft, id: Date.now(), error: "上次提交尚未确认，再次发送将核对同一次提交。" } });
    })();
    return () => { cancelled = true; };
  }, [selectedSessionId, refreshTaskQueue, taskQueue, localStore, patchLocal]);

  const setCompactionFailureForSession = useCallback((sessionId: string, block: CompactionBlock | null) => {
    patchLocal(sessionId, { compactionFailure: block ?? undefined });
  }, [patchLocal]);

  useEffect(() => {
    if (!composerNotice) return;
    const timer = window.setTimeout(() => setComposerNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [composerNotice]);

  const { reviewSummary, refreshReviewSummary } = useReviewSummary({
    workspaceRoot: normalizeWorkspaceRoot(
      sessionRecord?.meta.worktree?.workspaceRoot ?? selectedWorkspaceRoot ?? sessionRecord?.meta.workspaceRoot ?? fallbackWorkspaceRoot,
    ),
    sessionId: sessionRecord?.meta.id ?? null,
  });

  const refreshPendingApprovalStatuses = useCallback(async (sessionIds: string[]) => {
    const uniqueSessionIds = [...new Set(sessionIds.filter(Boolean))];
    if (uniqueSessionIds.length === 0) return;

    const results = await Promise.all(uniqueSessionIds.map(async (sessionId) => {
      const version = ++requestVersionRef.current;
      patchLocal(sessionId, { approvalVersion: version });
      try {
        const pending = await approvalsApi.listPending({ sessionId });
        return { sessionId, version, hasPending: pending.length > 0, pending };
      } catch (error) {
        console.error("Failed to load pending approvals", error);
        return { sessionId, version, hasPending: null, pending: [] };
      }
    }));

    // The host owns pending requests across renderer reloads. Reattach only
    // current host facts, never replay historical approval requests as grants.
    for (const result of results) {
      if (localStore.get(result.sessionId).approvalVersion !== result.version) continue;
      for (const pending of result.pending) {
        const recovery = pending.recovery;
        if (!recovery || pending.expiresAt <= Date.now()) continue;
        let run = liveRuns.get(result.sessionId);
        if (run && (!run.recovered || run.agentRunId !== recovery.agentRunId)) continue;
        if (!run) {
          run = { sessionId: result.sessionId, agentRunId: recovery.agentRunId, recovered: true,
            state: createEmptyStreamingState(), userBlock: null, aborting: false };
          liveRuns.start(run);
        }
        if (run.state.activeTools.get(recovery.toolCallId)?.terminalStatus) continue;
        upsertStreamingTool(run.state, recovery.toolCallId, pending.toolName, recovery.preview);
        Object.assign(run.state.activeTools.get(recovery.toolCallId)!, {
          approvalPending: true, approvalRequestId: pending.requestId, approvalReason: pending.reason,
          approvalSummary: pending.summary, approvalScope: recovery.approvalScope,
        });
      }
      liveRuns.refresh(result.sessionId);
    }
    for (const result of results) {
      if (result.hasPending === null || localStore.get(result.sessionId).approvalVersion !== result.version) continue;
      setLocalFlag(result.sessionId, "approvalPending", result.hasPending);
    }
  }, [liveRuns, localStore, patchLocal, setLocalFlag]);

  useEffect(() => {
    appApi.getBootstrapState()
      .then(setBootstrapState)
      .catch((error: unknown) => {
        console.error("Failed to load bootstrap state", error);
        setBootstrapState(null);
      });
  }, []);

  useEffect(() => {
    if (selectedWorkspaceRoot) return;
    setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
      sessionRecord?.meta.worktree?.sourceWorkspaceRoot ?? sessionRecord?.meta.workspaceRoot ?? fallbackWorkspaceRoot,
    ));
  }, [fallbackWorkspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.workspaceRoot]);

  useEffect(() => {
    const lockedWorktree = sessionRecord?.meta.worktree;
    if (lockedWorktree) {
      setRunLocation("worktree");
      setSelectedBranch(lockedWorktree.branch);
      setWorkspaceGitContext(null);
      return;
    }
    const workspaceRoot = selectedWorkspaceRoot ?? fallbackWorkspaceRoot;
    if (!isLocalTarget || !workspaceRoot) {
      setWorkspaceGitContext(null);
      setSelectedBranch(undefined);
      setRunLocation("this_mac");
      return;
    }
    let cancelled = false;
    workspacesApi.getGitContext({ workspaceRoot }).then((context) => {
      if (cancelled) return;
      setWorkspaceGitContext(context);
      setSelectedBranch(
        context.status === "ready" || context.status === "no_head"
          ? context.currentBranch
          : undefined,
      );
      setRunLocation("this_mac");
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.error("Failed to load workspace Git context", error);
      setWorkspaceGitContext(null);
      setSelectedBranch(undefined);
      setRunLocation("this_mac");
    });
    return () => {
      cancelled = true;
    };
  }, [isLocalTarget, fallbackWorkspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.id, sessionRecord?.meta.agentRunCount, sessionRecord?.meta.worktree]);

  const visibleSessions = useMemo(() => {
    if (!workspaceRegistry) return sessions;
    const hiddenWorkspaceIds = new Set(
      workspaceRegistry.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.id),
    );
    const hiddenWorkspacePaths = new Set(
      workspaceRegistry.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.path),
    );
    return sessions.filter((session) =>
      !hiddenWorkspaceIds.has(session.workspaceId ?? "") &&
      !hiddenWorkspacePaths.has(normalizeWorkspaceRoot(session.workspaceRoot) ?? ""),
    );
  }, [sessions, workspaceRegistry]);
  // 分页列表的分组同样不显示已移除的工作区，否则侧栏会把它的空文件夹加回来。
  const visibleBrowseGroups = useMemo(() => {
    const hiddenPaths = new Set(workspaceRegistry?.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.path));
    return hiddenPaths.size ? browseGroups.filter((group) => group.hostId || !hiddenPaths.has(normalizeWorkspaceRoot(group.workspaceRoot) ?? "")) : browseGroups;
  }, [browseGroups, workspaceRegistry]);
  // 每个会话 id 只补齐一次审批徽标和任务队列；之后靠 live 事件和选中会话时的刷新保持最新（14 T3）。
  // 只补齐侧栏可见的会话：移除工作区后，它的会话被 evict，不能因为仍在 sessions 里又被补齐回来。
  // 远端会话等 Host 列表读到之后再补齐；Host 已被移除的不补齐（15 T4：移除时被 evict，侧栏仍显示为未连接）。
  const knownHosts = useHostDirectory(selectKnownHosts);
  useEffect(() => {
    const fresh = visibleSessions.map((session) => session.id).filter((id) => {
      if (hydratedSessionIdsRef.current.has(id)) return false;
      const location = locateSession(id);
      return location.kind !== "remote" || (knownHosts?.some((host) => host.hostId === location.hostId) ?? false);
    });
    if (fresh.length === 0) return;
    for (const id of fresh) hydratedSessionIdsRef.current.add(id);
    refreshPendingApprovalStatuses(fresh).catch((error: unknown) => {
      console.error("Failed to refresh pending approval statuses", error);
    });
    // Closed history with no pending tasks needs no write-lease/recovery merely
    // to show a sidebar row. Selection and live updates still read the Session.
    for (const id of fresh) if (visibleSessions.find(session => session.id === id)?.hasPendingTasks !== false) void refreshTaskQueue(id).catch(reportSessionFailure(id, QUEUE_REFRESH_FAILED));
  }, [knownHosts, refreshPendingApprovalStatuses, refreshTaskQueue, reportSessionFailure, visibleSessions]);

  // 归档 / 移除后释放会话的本地状态，并让它重新出现时重新补齐。当前会话不释放；运行中的会话等 run 结束。
  const evictSession = useCallback((sessionId: string) => {
    if (sessionId === activeSessionIdRef.current) return;
    if (liveRuns.has(sessionId)) { pendingEvictionsRef.current.add(sessionId); return; }
    pendingEvictionsRef.current.delete(sessionId);
    evictionCountRef.current.set(sessionId, (evictionCountRef.current.get(sessionId) ?? 0) + 1);
    localStore.evict(sessionId);
    liveRuns.evict(sessionId);
    taskQueue.evict(sessionId);
    cellRetention.forget(sessionId);
    hydratedSessionIdsRef.current.delete(sessionId);
    remoteSessionPrefs.remove(sessionId);
  }, [localStore, liveRuns, taskQueue, cellRetention]);
  useEffect(() => {
    for (const sessionId of [...pendingEvictionsRef.current]) if (!busySessionIds.has(sessionId)) evictSession(sessionId);
  }, [busySessionIds, evictSession]);
  // Host 被移除：释放它的会话的本地状态。会话仍留在侧栏，显示为「远端 · 未连接」（03-3）。
  useEffect(() => hostDirectory.onHostRemoved((hostId) => {
    for (const item of sidebarSessionsRef.current) {
      const location = locateSession(item.id);
      if (location.kind === "remote" && location.hostId === hostId) evictSession(item.id);
    }
  }), [evictSession]);
  // 右栏打开着的侧边对话（按打开次数计数）：和当前会话一样常驻 store。
  const [openSideChatIds, setOpenSideChatIds] = useState<ReadonlyMap<string, number>>(() => new Map());
  const retainSideChat = useCallback((sessionId: string) => {
    setOpenSideChatIds((current) => new Map(current).set(sessionId, (current.get(sessionId) ?? 0) + 1));
    return () => setOpenSideChatIds((current) => {
      const next = new Map(current);
      const count = (next.get(sessionId) ?? 1) - 1;
      if (count > 0) next.set(sessionId, count); else next.delete(sessionId);
      return next;
    });
  }, []);
  // cell 保留：当前会话、运行中的会话和右栏打开着的侧边对话常驻，其余只留最近查看的几个（14 T9 / T10）。
  useEffect(() => {
    cellRetention.retain(new Set([...busySessionIds, ...openSideChatIds.keys(), ...(selectedSessionId ? [selectedSessionId] : [])]));
    if (selectedSessionId) cellRetention.viewed(selectedSessionId);
  }, [cellRetention, busySessionIds, selectedSessionId, openSideChatIds]);

  useEffect(() => {
    Promise.all([
      settingsApi.get(),
      modelsApi.listUsable({ purpose: "chat" }),
    ])
      .then(([settings, usable]) => {
        const configured = resolvePreferredChatModel(settings, usable.models);
        setUsableChatModels(usable.models);
        setDefaultModelId(configured);
        if (!userPickedChatModelRef.current) {
          setSelectedChatModelId(configured);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load settings", error);
      });
  }, []);

  const handleSettingsChange = useCallback((settings: AppSettings) => {
    void modelsApi.listUsable({ purpose: "chat" }).then((result) => {
      const configured = resolvePreferredChatModel(settings, result.models);
      setUsableChatModels(result.models);
      setDefaultModelId(configured);
      if (!userPickedChatModelRef.current) {
        setSelectedChatModelId(configured);
      }
    });
  }, []);

  const handleSelectedChatModelChange = useCallback((modelId: ModelSelectionId) => {
    userPickedChatModelRef.current = true;
    setSelectedChatModelId(modelId);
  }, []);

  useEffect(() => {
    let disposed = false;
    // Serialize notifications: an older response must not overwrite a newer Host state.
    let refreshing = false;
    let pending = false;
    const refresh = async () => {
      pending = true;
      if (refreshing) return;
      refreshing = true;
      try {
        do {
          pending = false;
          const items = await readSidebarSessions();
          if (disposed) return;
          setSessions(items);
        } while (pending && !disposed);
      } catch (error) { console.error("Failed to refresh session list", error); }
      finally { refreshing = false; }
    };
    const unsubscribe = liveEvents.onMessage("session-title-updated", () => { void refresh(); });
    const unhosts = hostDirectory.onHostsChanged(() => { void refresh(); });
    return () => { disposed = true; unsubscribe(); unhosts(); };
  }, [readSidebarSessions]);

  const readSessionPage = useCallback(async (sessionId: string) => {
    const version = ++requestVersionRef.current;
    patchLocal(sessionId, { pageVersion: version });
    const visible = () => activeSessionIdRef.current === sessionId;
    const request = visible() ? ++messageRequestRef.current : messageRequestRef.current;
    if (visible()) {
      historyPendingRef.current = null;
      setEarlierLoading(false);
      // store 里已有这个会话的 cell（保留策略留下的）时直接显示它，后台刷新。
      const held = sessionStore.peek(sessionId);
      setMessageLoading(!held?.snapshot || !held.window); setMessageError(null); setEarlierError(null);
    }
    try {
      const projection = await sessionsApi.getPage({ sessionId });
      if (version !== localStore.get(sessionId).pageVersion) return null;
      // 合并（与已加载的早期页相邻时并入、较旧的修订不覆盖）由 applyEnvelope 负责。
      sessionStore.applyEnvelope(projection);
      const record = selectChatSession(sessionStore.get(sessionId));
      if (!record) throw new Error('会话读取失败，请重试');
      return record;
    } catch (error) {
      if (version === localStore.get(sessionId).pageVersion && visible() && request === messageRequestRef.current) setMessageError(sessionReadError(error, '消息加载失败'));
      return null;
    } finally {
      if (version === localStore.get(sessionId).pageVersion && visible() && request === messageRequestRef.current) setMessageLoading(false);
    }
  }, [sessionStore, localStore, patchLocal]);

  refreshSessionRef.current = readSessionPage;

  const loadEarlierMessages = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionStore.peek(sessionId)?.window?.beforeSeq == null || historyPendingRef.current !== null) return;
    const request = messageRequestRef.current;
    historyPendingRef.current = request; setEarlierLoading(true); setEarlierError(null);
    try { await loadEarlier(sessionStore, sessionId); }
    catch (error) { if (request === messageRequestRef.current) setEarlierError(sessionReadError(error, '历史消息加载失败')); }
    finally { if (historyPendingRef.current === request) { historyPendingRef.current = null; setEarlierLoading(false); } }
  }, [sessionStore]);

  const loadMoreSessions = useCallback(async (input: import("@actspace/shared").SessionListPageInput) => {
    const page = await sessionsApi.listPage(input);
    setListError(page.readModel?.status === "fallback" ? "查询索引暂不可用，已从会话文件读取" : page.failed ? `${page.failed} 个会话暂时无法读取，可重试` : null);
    const key = JSON.stringify([input.hostId ?? "local", input.workspaceRoot ?? "", input.pinned === true]);
    loadedListPages.current.set(key, (loadedListPages.current.get(key) ?? 1) + 1);
    setSessions(current => { const byId = new Map(current.map(s => [s.id, s])); for (const s of page.items) byId.set(s.id, s); return [...byId.values()]; });
    setBrowseGroups(current => [...current.filter(g => !page.groups.some(n => n.hostId === g.hostId && n.workspaceRoot === g.workspaceRoot && n.pinned === g.pinned)), ...page.groups]);
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function bootstrapSession() {
      const selectionRequest = messageRequestRef.current;
      setListLoading(true); setListError(null);
      const registryRequest = workspacesApi.list();
      // 工作区不等会话目录：目录重建期间也要能选出兜底工作区、正常发送。
      void registryRequest.then((registry) => { if (!disposed && registry) setWorkspaceRegistry(registry); }, () => {});
      const [page, registry] = await Promise.all([
        sessionsApi.listPage(),
        registryRequest,
      ]);
      if (disposed) return;
      const listedSessions = page.items;
      const bootstrapWorkspaceRoot = firstVisibleWorkspaceRoot(registry, listedSessions);
      setSessions(current => page.indexing ? [...new Map([...current, ...listedSessions].map(s => [s.id, s])).values()] : listedSessions);
      setBrowseGroups(page.groups);
      setListLoading(page.indexing);
      if (page.failed) setListError(`${page.failed} 个会话暂时无法读取，可重试`);
      else if (page.readModel?.status === "fallback") setListError("查询索引暂不可用，已从会话文件读取");
      if (page.indexing) {
        timer = setTimeout(() => { void bootstrapSession().catch(handleBootstrapError); }, 500);
      }
      if (activeSessionIdRef.current || selectionRequest !== messageRequestRef.current) { setSessionBootstrapComplete(true); return; }
      if (page.indexing) return;

      const hiddenWorkspaceIds = new Set(registry?.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.id));
      const hiddenWorkspacePaths = new Set(registry?.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.path));
      const existing = listedSessions.find((session) =>
        !isOrphanSession(session, registry?.items ?? []) &&
        !hiddenWorkspaceIds.has(session.workspaceId ?? "") &&
        !hiddenWorkspacePaths.has(normalizeWorkspaceRoot(session.workspaceRoot) ?? ""),
      );
      if (existing) {
        setActiveSessionId(existing.id);
        const restored = await readSessionPage(existing.id);
        if (disposed || activeSessionIdRef.current !== existing.id) return;
        if (!restored) return;
        setSelectedWorkspaceRoot(
          normalizeWorkspaceRoot(
            restored?.meta.worktree?.sourceWorkspaceRoot ??
            restored?.meta.workspaceRoot ??
            existing.worktree?.sourceWorkspaceRoot ??
            existing.workspaceRoot ??
            bootstrapWorkspaceRoot,
          ),
        );
        setSessionBootstrapComplete(true);
        return;
      }

      setActiveSessionId(null);
      setSelectedWorkspaceRoot(bootstrapWorkspaceRoot);
      setSessionBootstrapComplete(true);
    }

    function handleBootstrapError(error: unknown) {
      if (disposed) return;
      setListLoading(false); setListError(sessionReadError(error, '会话列表加载失败'));
      setSessionBootstrapComplete(true);
    }
    void bootstrapSession().catch(handleBootstrapError);
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [listRetry, readSessionPage]);

  // 流式事件归并进 live run（规则在 live-run-store.ts）；steer 的正文取自任务队列缓存。
  const handleStreamEvent = useCallback((event: StreamEvent) => liveRuns.applyStreamEvent(event, (sessionId, messageId) => {
    const item = taskQueue.takeSteer(messageId);
    updateMessageQueue(sessionId, (queue) => takeSteering(queue, messageId).queue);
    return item;
  }), [liveRuns, taskQueue, updateMessageQueue]);

  useEffect(() => {
    return eventsApi.agentStream((event) => {
      if (event.type === "agent_run_started" && liveRuns.isTerminal(event.agentRunId)) return;
      if (event.type === "agent_run_finished" || event.type === "agent_run_aborted" || event.type === "agent_run_failed") {
        liveRuns.markTerminal(event.agentRunId);
      }
      let run = liveRuns.get(event.sessionId);
      if (event.type === "agent_run_started" && (event.recoveredReset || !run || run.agentRunId !== event.agentRunId)) {
        run = { sessionId: event.sessionId, agentRunId: event.agentRunId, recovered: event.recoveredReset === true, state: createEmptyStreamingState(), userBlock: null, aborting: false };
        liveRuns.start(run);
        void readSessionPage(event.sessionId);
      }
      if (event.type === "agent_run_started" && run && !event.recoveredReset) {
        run.recovered = false;
        void refreshTaskQueue(event.sessionId);
      }
      if (run && run.agentRunId !== event.agentRunId) return;
      if ((event.type === "tool_approval_required" || event.type === "tool_approval_resolved") &&
        run?.agentRunId === event.agentRunId && run.state.activeTools.get(event.toolCallId)?.terminalStatus) return;
      if (event.type === "tool_approval_required") {
        setApprovalPendingForSession(event.sessionId, true);
        if (!run || (run.recovered && !run.state.activeTools.has(event.toolCallId))) void refreshPendingApprovalStatuses([event.sessionId]);
      } else if (
        event.type === "tool_approval_resolved" ||
        event.type === "agent_run_aborted" ||
        event.type === "agent_run_finished" ||
        event.type === "agent_run_failed"
      ) {
        refreshPendingApprovalStatuses([event.sessionId]).catch((error: unknown) => {
          console.error("Failed to refresh stream approval status", error);
        });
      }

      if (event.type === "agent_run_finished" || event.type === "agent_run_aborted") {
        setFailedForSession(event.sessionId, false);
        // 不在当前会话时跑完的一轮记成未读，侧栏显示绿点，打开会话时清掉。
        if (event.type === "agent_run_finished" && activeSessionIdRef.current !== event.sessionId) setLocalFlag(event.sessionId, "unread", true);
      } else if (event.type === "agent_run_failed") {
        setFailedForSession(event.sessionId, true);
      }

      handleStreamEvent(event);
      // Live 压缩块随 run 释放；失败提示由会话本地状态接续，成功或再次开始压缩时清除。
      if (run && run.agentRunId === event.agentRunId && !liveRuns.isTerminal(event.agentRunId) &&
        (event.type === "context_compaction_failed" || event.type === "context_compaction_finished" || event.type === "context_compaction_started")) {
        const block = run.state.activeCompactions.get(event.agentRunId);
        setCompactionFailureForSession(event.sessionId, block?.status === "failed" ? block : null);
      }
      if (run && (event.type === "agent_run_finished" || event.type === "agent_run_aborted" || event.type === "agent_run_failed")) {
        // Host events settle every run; no renderer-owned execution promise.
        void readSidebarSessions().then(setSessions).catch(console.error);
        void readSessionPage(event.sessionId).finally(() => {
          if (!liveRuns.end(event.sessionId, run)) return;
          if (activeSessionIdRef.current === event.sessionId) void refreshReviewSummary();
          void continueQueueRef.current(event.sessionId, event.type === "agent_run_finished" ? "completed" : event.type === "agent_run_aborted" ? "aborted" : "failed");
        });
      }
    });
  }, [liveRuns, handleStreamEvent, refreshPendingApprovalStatuses, setApprovalPendingForSession, setFailedForSession, readSessionPage, refreshReviewSummary, localStore, patchLocal, setLocalFlag, setCompactionFailureForSession]);

  const createSessionForInput = useCallback(async (input: NewSessionInput = {}): Promise<SessionRecord | null> => {
    const selectionRequest = messageRequestRef.current;
    try {
      const projection = await sessionsApi.create({
        ...(input.hostId ? { hostId: input.hostId } : {}),
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input.agentForm ? { agentForm: input.agentForm } : {}),
        ...(input.runLocation ? { runLocation: input.runLocation } : {}),
        ...(input.branch ? { branch: input.branch } : {}),
      });
      sessionStore.applyEnvelope(projection);
      const created = projectChatWindow(projection);
      if (selectionRequest === messageRequestRef.current) {
        setActiveSessionId(created.meta.id);
        setSelectedWorkspaceRoot(normalizeWorkspaceRoot(created.meta.worktree?.sourceWorkspaceRoot ?? created.meta.workspaceRoot ?? fallbackWorkspaceRoot));
      }
      // A cold catalog is optional navigation data, not a dependency of the
      // first task in the newly created durable Session.
      void readSidebarSessions().then(setSessions).catch(console.error);
      void refreshWorkspaces().catch(console.error);
      return created;
    } catch (error) {
      console.error("Failed to create session", error);
      if (input.runLocation) throw error;
      return null;
    }
  }, [fallbackWorkspaceRoot, refreshWorkspaces]);

  /** 首次发送保留结果兼容接口；执行与后续队列均由 Host 调度。 */
  const continueQueue = useCallback(async (sessionId: string, _outcome: SessionRunOutcome) => { await refreshTaskQueue(sessionId); }, [refreshTaskQueue]);
  continueQueueRef.current = continueQueue;
  const handleSteerQueued = useCallback((id: string) => {
    const sessionId = activeSessionIdRef.current;
    const snapshot = sessionId ? taskQueue.snapshot(sessionId) : undefined;
    const runId = snapshot?.runs.find(run => run.state === "running")?.runId;
    if (!sessionId || !snapshot || !runId) return;
    const item = localStore.get(sessionId).messageQueue.items.find(item => item.id === id);
    if (item) taskQueue.rememberSteer(sessionId, id, item);
    void taskCommand({ op: "designate", sessionId, taskId: id, runId, revision: snapshot.revision }).catch(reportSessionFailure(sessionId, QUEUE_COMMAND_FAILED));
  }, [taskCommand, taskQueue, localStore, reportSessionFailure]);
  const handleUnsteerQueued = useCallback(async (id: string) => {
    const sessionId = activeSessionIdRef.current;
    const snapshot = sessionId ? taskQueue.snapshot(sessionId) : undefined;
    if (sessionId && snapshot) await taskCommand({ op: "designate", sessionId, taskId: id, runId: null, revision: snapshot.revision });
  }, [taskCommand, taskQueue]);
  const handleResumeQueue = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    const snapshot = sessionId ? taskQueue.snapshot(sessionId) : undefined;
    if (sessionId && snapshot) void taskCommand({ op: "resume", sessionId, revision: snapshot.revision }).catch(reportSessionFailure(sessionId, QUEUE_COMMAND_FAILED));
  }, [taskCommand, taskQueue, reportSessionFailure]);
  const handleEditQueued = useCallback(async (id: string) => {
    const sessionId = activeSessionIdRef.current;
    const snapshot = sessionId ? taskQueue.snapshot(sessionId) : undefined;
    const item = sessionId ? localStore.get(sessionId).messageQueue.items.find(item => item.id === id) : undefined;
    if (!sessionId || !snapshot || !item) return;
    const attachments = await Promise.all((item.options.attachments ?? []).map(async attachment => {
      if (attachment.kind !== "image" || !attachment.remoteArtifact) return attachment;
      try {
        const preview = await sessionsApi.readArtifact({ sessionId, artifactPath: attachment.remoteArtifact.artifactId });
        return { ...attachment, previewUrl: preview.dataUrl };
      } catch { return attachment; } // Preview failure must not discard the durable attachment.
    }));
    if (!await taskCommand({ op: "cancel", sessionId, taskId: id, revision: snapshot.revision })) return;
    const draft = { id: Date.now(), sessionId, text: item.text, ...item.options, attachments };
    patchLocal(sessionId, { draft });
  }, [taskCommand, taskQueue, localStore, patchLocal]);

  // 15 T12：建会话、configure、提交和 pending 记录在 session gateway 里。
  const sessionGateway = useMemo(() => createSessionGateway({
    createSession: createSessionForInput,
    setPlanMode: (sessionId, expectedRevision) => sessionsApi.setAgentMode({ sessionId, mode: "plan", expectedRevision }),
    recordRemoteSession: (sessionId, prefs) => remoteSessionPrefs.set(sessionId, prefs),
    configure: async (sessionId, configuration) => Boolean(await taskCommand({ sessionId, op: "configure", configuration })),
    submit: (input) => tasksApi.submit(input),
    pending: { read: readPendingSubmission, write: writePendingSubmission, clear: clearPendingSubmission },
    rememberOptions: (sessionId, submissionId, options) => taskQueue.rememberOptions(sessionId, submissionId, options),
    forgetOptions: (submissionId) => taskQueue.forgetOptions(submissionId),
    notice: (sessionId, text) => setComposerNotice({ sessionId, text }),
    restoreDraft: (sessionId, draft) => patchLocal(sessionId, { draft }),
    newSubmissionId: () => crypto.randomUUID(),
    now: Date.now,
  }), [createSessionForInput, taskCommand, taskQueue, patchLocal]);

  // 向一个已存在的会话提交（主会话和右栏的侧边对话共用）：pending 记录、configure、提交和队列刷新。
  const sendToSession = useCallback(async (
    sessionId: string,
    text: string,
    options: ComposerSendOptions,
    resumeAfterAcceptance = false,
  ) => {
    patchLocal(sessionId, { lastSendOptions: options });
    setFailedForSession(sessionId, false);
    setCompactionFailureForSession(sessionId, null);
    let result: import("@actspace/shared/runtime-v2").TaskSubmissionResult;
    const inFlight = sendsInFlightRef.current;
    inFlight.set(sessionId, (inFlight.get(sessionId) ?? 0) + 1);
    try {
      result = await sessionGateway.submit(sessionId, text, options, !isLocalSession(sessionId) ? targetChoices.modelId : options.model);
    } finally {
      const remaining = (inFlight.get(sessionId) ?? 1) - 1;
      if (remaining > 0) inFlight.set(sessionId, remaining); else inFlight.delete(sessionId);
    }
    patchLocal(sessionId, { draft: undefined });
    if (activeSessionIdRef.current === sessionId) setSendScrollRequestId(value => value + 1);
    // Receipt already proves acceptance; a failed refresh must not restore a sent draft.
    await refreshTaskQueue(sessionId).catch(reportSessionFailure(sessionId, QUEUE_REFRESH_FAILED));
    const snapshot = taskQueue.snapshot(sessionId);
    const acceptedTaskId = "task" in result ? result.task.taskId : null;
    if (resumeAfterAcceptance && snapshot?.paused && snapshot.tasks.some(task => task.taskId === acceptedTaskId && task.state === "pending")) {
      await taskCommand({ op: "resume", sessionId, revision: snapshot.revision });
    }
  }, [sessionGateway, targetChoices, setFailedForSession, setCompactionFailureForSession, taskCommand, taskQueue, refreshTaskQueue, reportSessionFailure, patchLocal]);

  const handleSend = useCallback(async (
    text: string,
    options: ComposerSendOptions,
    resumeAfterAcceptance = false,
  ) => {
    if (!text.trim() && !options.attachments?.length && !options.fileReferences?.length && !options.responseAnnotations?.length) return;
    const visibleSessionId = await sessionGateway.ensureSession(activeSessionIdRef.current, {
      target: runTarget.target, readiness: runTarget.readiness,
      remoteWorkspaceId: runTarget.target.kind === "remote" ? runTarget.target.workspaceId : undefined, remoteModelId: targetChoices.modelId, localWorkspaceRoot: selectedWorkspaceRoot,
      runLocation, branch: selectedBranch ?? undefined,
    }, options);
    const sessionId = visibleSessionId;
    patchLocal(sessionId, { composer: { mode: options.mode, selectedSkills: options.selectedSkills } });
    // Keep workspace changes on the idle Session boundary before task admission.
    if (sessionRecord?.meta.id === sessionId && isLocalSession(sessionId) && !liveRuns.has(sessionId) && !sessionRecord.meta.worktree && selectedWorkspaceRoot &&
        selectedWorkspaceRoot !== normalizeWorkspaceRoot(sessionRecord?.meta.workspaceRoot ?? fallbackWorkspaceRoot)) {
      const result = await sessionsApi.setWorkspace({ sessionId, workspaceRoot: selectedWorkspaceRoot });
      if (!result.ok) throw new Error(result.error ?? "无法更新会话工作区");
    }
    await sendToSession(visibleSessionId, text, options, resumeAfterAcceptance);
  }, [sessionGateway, runTarget, targetChoices, sessionRecord, selectedWorkspaceRoot, runLocation, selectedBranch, fallbackWorkspaceRoot, liveRuns, patchLocal, sendToSession]);

  useEffect(() => {
    return hostDirectory.onHostsChanged(hosts => {
      const id = activeSessionIdRef.current;
      // Host 断线期间的审批 / 队列事件收不到：重连后让它的后台会话在下一次列表刷新时重新补齐。
      const connected = new Set(hosts.filter(host => host.state === "connected").map(host => host.hostId));
      for (const hostId of connected) {
        if (connectedHostIdsRef.current.has(hostId)) continue;
        for (const item of sidebarSessionsRef.current) if (item.hostId === hostId && item.id !== id) hydratedSessionIdsRef.current.delete(item.id);
      }
      connectedHostIdsRef.current = connected;
      const location = locateSession(id);
      if (id && location.kind === "remote" && hosts.some(host => host.hostId === location.hostId && host.state === "connected")) {
        void readSessionPage(id); void refreshTaskQueue(id); void refreshPendingApprovalStatuses([id]);
      }
    });
  }, [readSessionPage, refreshTaskQueue, refreshPendingApprovalStatuses]);

  const handleRetryCompaction = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    const composerState = localStore.get(sessionId).composer;
    const options = localStore.get(sessionId).lastSendOptions ?? {
      model: selectedChatModelId,
      mode: composerState?.mode ?? "agent",
      selectedSkills: composerState?.selectedSkills ?? [],
      thinkingEnabled: false,
    };
    void handleSend("/compact", { ...options, attachments: undefined, fileReferences: undefined, responseAnnotations: undefined }, true).catch(error => {
      setComposerNotice({ sessionId, text: error instanceof Error ? error.message : "重试未完成，请检查队列状态。" });
    });
  }, [localStore, handleSend, selectedChatModelId]);

  const abortSession = useCallback(async (sessionId: string) => {
    const run = liveRuns.get(sessionId);
    if (!run) return;

    const input: AbortAgentRunInput = {
      sessionId,
      agentRunId: run.agentRunId,
    };

    try {
      run.aborting = true;
      liveRuns.refresh(sessionId);
      const aborted = await tasksApi.abort(input);
      if (!aborted) {
        run.aborting = false;
        liveRuns.refresh(sessionId);
      }
    } catch (error) {
      console.error("Failed to abort turn", error);
      run.aborting = false;
      liveRuns.refresh(sessionId);
    }
  }, [liveRuns]);
  const handleAbort = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (sessionId) await abortSession(sessionId);
  }, [abortSession]);

  const handleCreateSession = useCallback(async (input: NewSessionInput = {}) => {
    // Create only on first send, after workspace / branch / worktree selection.
    setActiveSessionId(null);
    setSessionBootstrapComplete(true);
    patchLocal(DRAFT_COMPOSER_KEY, { composer: { ...DEFAULT_COMPOSER_STATE, mode: input.agentForm === "chat" ? "chat" : "agent" } });
    targetChoices.selectHost(input.hostId ?? null);
    if (input.workspaceId) targetChoices.selectWorkspace(input.workspaceId);
    if (input.workspaceRoot) setSelectedWorkspaceRoot(input.workspaceRoot);
    else if (input.workspaceId) setSelectedWorkspaceRoot(workspaceRegistry?.items.find(item => item.id === input.workspaceId)?.path ?? null);
  }, [targetChoices.selectHost, targetChoices.selectWorkspace, setActiveSessionId, workspaceRegistry, patchLocal]);

  // 选目录时 main 已经把它登记进 registry；这里同步刷新，侧栏才能马上显示（新建会话不再立即创建，不能指望它顺带刷新）。
  const pickAndRegisterWorkspace = useCallback(async () => {
    const result = await dialogsApi.selectWorkspaceDirectory({ registerWorkspace: true });
    if (result.canceled || !result.workspaceRoot) return null;
    await refreshWorkspaces();
    return result.workspaceRoot;
  }, [refreshWorkspaces]);

  const handleAddWorkspace = useCallback(async () => {
    try {
      const workspaceRoot = await pickAndRegisterWorkspace();
      if (!workspaceRoot) return;
      await handleCreateSession({ workspaceRoot });
    } catch (error) {
      console.error("Failed to add workspace", error);
    }
  }, [handleCreateSession, pickAndRegisterWorkspace]);

  const handleUseExistingWorkspace = useCallback(async () => {
    try {
      const workspaceRoot = await pickAndRegisterWorkspace();
      if (!workspaceRoot) return;
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(workspaceRoot));
    } catch (error) {
      console.error("Failed to select workspace", error);
    }
  }, [pickAndRegisterWorkspace]);

  const handleCreateWorkspaceFolder = useCallback(async (name: string) => {
    try {
      const parent = await dialogsApi.selectWorkspaceDirectory();
      if (parent.canceled || !parent.workspaceRoot) return;
      const result = await workspacesApi.createFolder({
        parentRoot: parent.workspaceRoot,
        name,
      });
      if ("error" in result) {
        console.error("Failed to create workspace folder", result.error);
        return;
      }
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(result.workspaceRoot));
      await refreshWorkspaces();
    } catch (error) {
      console.error("Failed to create workspace folder", error);
    }
  }, [refreshWorkspaces]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionIdRef.current) return;

      setActiveSessionId(sessionId);
      refreshPendingApprovalStatuses([sessionId]).catch((error: unknown) => {
        console.error("Failed to refresh selected session approvals", error);
      });

      const restored = await readSessionPage(sessionId)
      if (activeSessionIdRef.current !== sessionId) return;
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
        restored?.meta.worktree?.sourceWorkspaceRoot ?? restored?.meta.workspaceRoot ?? fallbackWorkspaceRoot,
      ));
    },
    [fallbackWorkspaceRoot, refreshPendingApprovalStatuses, readSessionPage],
  );

  useEffect(() => {
    if (!sessionBootstrapComplete) return;
    let disposed = false;

    const consumeRequest = async () => {
      const request = await quickOpenApi.consume();
      if (!request || disposed) return;
      const [settings, allSessions, registry] = await Promise.all([
        settingsApi.get(),
        sessionsApi.list(),
        workspacesApi.list(),
      ]);
      if (disposed) return;
      // 和侧栏 listPage 一致：子 Agent 的会话不进会话列表。
      const listedSessions = allSessions.filter((session) => !session.isChildSession);
      setSessions(listedSessions);
      setWorkspaceRegistry(registry);
      const shortcut = settings.shortcuts?.quickOpen ?? {
        enabled: true,
        accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR,
        target: { kind: "automatic" as const },
      };
      const resolution = resolveQuickOpenTarget(shortcut, registry.items, listedSessions);
      if (resolution.kind === "session") {
        await handleSelectSession(resolution.sessionId);
      } else if (resolution.kind === "workspace") {
        await handleCreateSession({
          workspaceId: resolution.workspaceId,
          workspaceRoot: resolution.workspaceRoot,
        });
      } else {
        await handleCreateSession();
      }
      if (!disposed) setComposerFocusRequestId((value) => value + 1);
    };

    const unsubscribe = eventsApi.quickOpenRequested(() => {
      void consumeRequest().catch((error: unknown) => {
        console.error("Failed to handle quick open request", error);
      });
    });
    void consumeRequest().catch((error: unknown) => {
      console.error("Failed to consume pending quick open request", error);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [handleCreateSession, handleSelectSession, sessionBootstrapComplete]);

  const persistedEvents = sessionRecord?.events ?? EMPTY_EVENTS;

  const contextSnapshot: ContextUsageSnapshot | null =
    sessionRecord?.contextSnapshot ??
    getLatestContextSnapshot(persistedEvents);

  const contextState: ContextState | null =
    sessionRecord?.contextState ?? null;

  const activeSessionId = selectedSessionId;
  const steerBlockedReason = isCompacting
    ? "压缩中不能引导，完成后会自动发送"
    : activeSessionId && approvalPendingSessionIds.has(activeSessionId) ? "等待审批时不能引导" : null;
  // 引用稳定，WorkbenchLayout / Composer 不随每次流式刷新重渲染队列托盘（14 T16）。
  const messageQueueControls = useMemo<MessageQueueControls>(() => ({
    queue: messageQueue,
    running: isStreaming,
    steerBlockedReason,
    onSteer: handleSteerQueued,
    onUnsteer: (id) => void handleUnsteerQueued(id),
    onRemove: (id) => { const snapshot = activeSessionId ? taskQueue.snapshot(activeSessionId) : undefined; if (activeSessionId && snapshot) void taskCommand({ op: "cancel", sessionId: activeSessionId, taskId: id, revision: snapshot.revision }).catch(reportSessionFailure(activeSessionId, QUEUE_COMMAND_FAILED)); },
    onMoveUp: (id) => { const snapshot = activeSessionId ? taskQueue.snapshot(activeSessionId) : undefined; const index = messageQueue.items.findIndex(item => item.id === id); if (activeSessionId && snapshot && index > 0) void taskCommand({ op: "move", sessionId: activeSessionId, taskId: id, beforeTaskId: messageQueue.items[index - 1].id, revision: snapshot.revision }).catch(reportSessionFailure(activeSessionId, QUEUE_COMMAND_FAILED)); },
    onEdit: handleEditQueued,
    onResume: handleResumeQueue,
  }), [messageQueue, isStreaming, steerBlockedReason, handleSteerQueued, handleUnsteerQueued, activeSessionId, taskQueue, taskCommand, handleEditQueued, handleResumeQueue, reportSessionFailure]);
  const composerStateKey = activeSessionId ?? DRAFT_COMPOSER_KEY;
  const storedComposerState = useSessionLocalState(localStore, composerStateKey, selectComposerState) ?? DEFAULT_COMPOSER_STATE;
  const projectedMode = activeSessionId
    ? sessionRecord?.meta.id === activeSessionId ? sessionRecord.meta.agentMode : visibleSessions.find((session) => session.id === activeSessionId)?.agentMode
    : undefined;
  const activeComposerState = { ...storedComposerState, mode: projectedMode ?? storedComposerState.mode };
  const handleComposerModeChange = useCallback(async (mode: ComposerMode) => {
    const sessionId = activeSessionIdRef.current;
    if (sessionId && (busySessionIds.has(sessionId) || modeChangePendingRef.current.has(sessionId))) throw new Error("会话正在执行，请等待任务结束后切换模式");
    if (sessionId) modeChangePendingRef.current.add(sessionId);
    try {
      if (sessionId) {
        const revision = sessionRecord?.meta.id === sessionId
          ? sessionRecord.meta.agentModeRevision
          : visibleSessions.find((session) => session.id === sessionId)?.agentModeRevision;
        let result = await sessionsApi.setAgentMode({ sessionId, mode, expectedRevision: revision });
        if (!result.ok && result.error === "WORKSPACE_REQUIRED") {
          const workspaceRoot = await pickAndRegisterWorkspace();
          if (!workspaceRoot) return;
          const workspace = await sessionsApi.setWorkspace({ sessionId, workspaceRoot });
          if (!workspace.ok) throw new Error(workspace.error ?? "设置工作区失败");
          setSelectedWorkspaceRoot(normalizeWorkspaceRoot(workspaceRoot));
          result = await sessionsApi.setAgentMode({ sessionId, mode, expectedRevision: revision });
        }
        if (!result.ok) {
          if (result.error === "AGENT_MODE_CONFLICT") await readSessionPage(sessionId);
          const message = result.error === "SESSION_BUSY"
            ? "当前会话仍有运行、审批或后台任务，请等待任务结束后再切换模式。"
            : result.error === "AGENT_MODE_CONFLICT"
              ? "会话模式已更新，请重新选择模式。"
              : result.error === "AGENT_MODE_RECOVERY_REQUIRED"
                ? "会话模式需要恢复，请重新打开会话后再试。"
                : result.error ?? "模式切换失败";
          throw new Error(message);
        }
        await readSessionPage(sessionId);
        setSessions((current) => current.map((session) => session.id === sessionId
          ? { ...session, agentMode: result.mode ?? mode, agentModeRevision: result.revision }
          : session));
      }
      localStore.update(composerStateKey, (state) => ({ ...state, composer: { mode, selectedSkills: state.composer?.selectedSkills ?? [] } }));
    } finally {
      if (sessionId) modeChangePendingRef.current.delete(sessionId);
    }
  }, [busySessionIds, sessionRecord, visibleSessions, readSessionPage, localStore, composerStateKey, pickAndRegisterWorkspace]);
  const handleSelectedSkillsChange = useCallback((selectedSkills: string[]) => {
    localStore.update(composerStateKey, (state) => ({ ...state, composer: { mode: state.composer?.mode ?? "agent", selectedSkills } }));
  }, [localStore, composerStateKey]);
  const isSessionReady = Boolean(sessionRecord || streamingBlocks.length > 0 || sessionBootstrapComplete);
  const title = getSessionTitle(sessionRecord, visibleSessions, activeSessionId);
  const workspaceOptions = useMemo(
    () => {
      const registryOptions = workspaceRegistry
        ? createWorkspaceOptionsFromRegistry(workspaceRegistry.items)
        : [];
      // 已隐藏的工作区不进选择器；当前会话和当前选择的目录照常显示。
      const fallbackOptions = createWorkspaceOptionsFromRoots([
        selectedWorkspaceRoot,
        sessionRecord?.meta.worktree?.sourceWorkspaceRoot,
        sessionRecord?.meta.workspaceRoot,
      ]);
      const merged = new Map(registryOptions.map((option) => [option.value, option]));
      for (const option of fallbackOptions) {
        if (!merged.has(option.value)) merged.set(option.value, option);
      }
      return [...merged.values()];
    },
    [selectedWorkspaceRoot, sessionRecord?.meta.worktree?.sourceWorkspaceRoot, sessionRecord?.meta.workspaceRoot, workspaceRegistry],
  );
  const executionContext = useMemo<ComposerExecutionContext>(() => ({
    gitContext: isLocalTarget ? workspaceGitContext : null,
    selectedBranch,
    runLocation,
    onSelectBranch: setSelectedBranch,
    onSelectRunLocation: setRunLocation,
    onUseExistingWorkspace: handleUseExistingWorkspace,
    onCreateWorkspaceFolder: handleCreateWorkspaceFolder,
  }), [
    isLocalTarget,
    handleCreateWorkspaceFolder,
    handleUseExistingWorkspace,
    runLocation,
    selectedBranch,
    workspaceGitContext,
  ]);
  const sessionStatuses = useMemo<Record<string, SessionUiStatusKind>>(() => {
    const statuses: Record<string, SessionUiStatusKind> = {};
    for (const sessionId of unreadSessionIds) {
      statuses[sessionId] = "unread";
    }
    for (const sessionId of failedSessionIds) {
      statuses[sessionId] = "failed";
    }
    for (const sessionId of busySessionIds) {
      statuses[sessionId] = "running";
    }
    for (const sessionId of approvalPendingSessionIds) {
      statuses[sessionId] = "waiting_approval";
    }
    return statuses;
  }, [approvalPendingSessionIds, busySessionIds, failedSessionIds, unreadSessionIds]);

  const handleCopySessionId = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    try {
      await copyTextToClipboard(sessionId);
    } catch (error) {
      console.error("Failed to copy session id", error);
    }
  }, []);

  const handleCopyTranscript = useCallback(async (sessionId: string) => {
    if (!sessionId) return;

    try {
      const listedSession = sessions.find((session) => session.id === sessionId);
      let transcriptMessages: MessageBlock[];
      let transcriptTitle = listedSession?.title ?? "Untitled session";

      const record = await getSession({ sessionId });
      if (!record) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      transcriptTitle = record.meta.title;
      transcriptMessages = record.messageBlocks?.length
        ? record.messageBlocks
        : createMessageBlocks(record.events);

      await copyTextToClipboard(formatSessionTranscript(transcriptTitle, transcriptMessages));
    } catch (error) {
      console.error("Failed to copy session transcript", error);
    }
  }, [sessions]);

  const handleForkSession = useCallback(async (sessionId: string) => {
    if (
      !sessionId ||
      busySessionIds.has(sessionId) ||
      approvalPendingSessionIds.has(sessionId)
    ) {
      return;
    }

    try {
      const projection = await sessionsApi.fork({ sessionId });
      sessionStore.applyEnvelope(projection);
      const forked = projectChatWindow(projection);
      const refreshed = await readSidebarSessions();
      setSessions(refreshed);
      await refreshWorkspaces();

      setActiveSessionId(forked.meta.id);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
        forked.meta.worktree?.sourceWorkspaceRoot ?? forked.meta.workspaceRoot ?? fallbackWorkspaceRoot,
      ));
      setApprovalPendingForSession(forked.meta.id, false);
      setFailedForSession(forked.meta.id, false);
    } catch (error) {
      console.error("Failed to fork session", error);
    }
  }, [
    approvalPendingSessionIds,
    fallbackWorkspaceRoot,
    busySessionIds,
    refreshWorkspaces,
    setApprovalPendingForSession,
    setFailedForSession,
  ]);

  const handleTogglePin = useCallback(
    async (sessionId: string, nextPinned: boolean) => {
      try {
        await sessionsApi.pin({ sessionId, pinned: nextPinned });
        const refreshed = await readSidebarSessions();
        setSessions(refreshed);
      } catch (error) {
        console.error("Failed to toggle session pin", error);
      }
    },
    [],
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      const nextTitle = title.trim();
      if (!sessionId || !nextTitle) return;

      try {
        const result = await sessionsApi.rename({ sessionId, title: nextTitle });
        if (!result.ok) {
          console.error("Failed to rename session", result.error);
          return;
        }

        const refreshed = await readSidebarSessions();
        setSessions(refreshed);
      } catch (error) {
        console.error("Failed to rename session", error);
      }
    },
    [],
  );

  const handleArchiveSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionId) return;

      setSessions((current) => current.filter((session) => session.id !== sessionId));
      try {
        const result = await sessionsApi.archive({ sessionId, archived: true });
        if (!result.ok) throw new Error(result.error ?? "Archive request failed");
        evictSession(sessionId);
      } catch (error) {
        console.error("Failed to archive session", error);
        try {
          setSessions(await readSidebarSessions());
        } catch (refreshError) {
          console.error("Failed to restore sessions after archive failure", refreshError);
        }
      }
    },
    [activeSessionId, readSidebarSessions, evictSession],
  );

  const handleOpenWorkspace = useCallback(async (workspaceId: string) => {
    const result = await workspacesApi.openInIde({ workspaceId });
    if (!result.ok) {
      console.error("Failed to open workspace in IDE", result.error);
    }
  }, []);

  const handleArchiveWorkspace = useCallback(async (groupKey: string, workspaceRoot?: string) => {
    const archiveCandidates = await sessionsApi.list();
    const groupSessions = sessionsByGroupKey(archiveCandidates, workspaceRegistry?.items ?? []).get(groupKey) ?? [];
    const targetSessionIds = groupSessions.map((session) => session.id);
    if (targetSessionIds.length === 0) return;
    if (targetSessionIds.some((sessionId) => busySessionIds.has(sessionId) || approvalPendingSessionIds.has(sessionId))) {
      return;
    }

    if (activeSessionId && targetSessionIds.includes(activeSessionId)) {
      const hiddenWorkspaces = workspaceRegistry?.items.filter((workspace) => workspace.hidden) ?? [];
      const hiddenIds = new Set(hiddenWorkspaces.map((workspace) => workspace.id));
      const hiddenPaths = new Set(hiddenWorkspaces.map((workspace) => normalizeWorkspaceRoot(workspace.path)));
      const fallback = sessions.find((session) =>
        !targetSessionIds.includes(session.id) &&
        !hiddenIds.has(session.workspaceId ?? "") &&
        !hiddenPaths.has(normalizeWorkspaceRoot(session.workspaceRoot)),
      );
      // 没有别的会话可切时回到新建会话页，留在原工作区。
      if (fallback) await handleSelectSession(fallback.id);
      else await handleCreateSession({ workspaceRoot, hostId: groupSessions[0]?.hostId, workspaceId: groupSessions[0]?.workspaceId });
    }

    const result = await sessionsApi.archiveMany({ sessionIds: targetSessionIds });
    const failed = new Set(result.ok ? [] : result.failedSessionIds);
    for (const sessionId of targetSessionIds) if (!failed.has(sessionId)) evictSession(sessionId);
    const refreshed = await readSidebarSessions();
    setSessions(refreshed);
    if (!result.ok) {
      console.error("Some workspace sessions could not be archived", result.failedSessionIds);
    }
  }, [activeSessionId, approvalPendingSessionIds, busySessionIds, handleCreateSession, handleSelectSession, sessions, workspaceRegistry, evictSession, readSidebarSessions]);

  const handleRemoveWorkspace = useCallback(async (workspaceId: string, workspaceRoot?: string) => {
    if (!workspaceRegistry) return;
    const targetSessionIds = new Set(sessions
      .filter((session) =>
        session.workspaceId === workspaceId ||
        (!session.workspaceId && normalizeWorkspaceRoot(session.workspaceRoot) === normalizeWorkspaceRoot(workspaceRoot)),
      )
      .map((session) => session.id));

    if (activeSessionId && targetSessionIds.has(activeSessionId)) {
      const hiddenWorkspaces = workspaceRegistry.items.filter((workspace) => workspace.hidden);
      const hiddenIds = new Set(hiddenWorkspaces.map((workspace) => workspace.id));
      const hiddenPaths = new Set(hiddenWorkspaces.map((workspace) => workspace.path));
      const fallback = sessions.find((session) =>
        !targetSessionIds.has(session.id) &&
        !hiddenIds.has(session.workspaceId ?? "") &&
        !hiddenPaths.has(normalizeWorkspaceRoot(session.workspaceRoot) ?? ""),
      );
      if (fallback) {
        setActiveSessionId(fallback.id);
        const restored = await readSessionPage(fallback.id);
        if (!restored || activeSessionIdRef.current !== fallback.id) return;
        setSelectedWorkspaceRoot(normalizeWorkspaceRoot(restored.meta.workspaceRoot ?? fallback.workspaceRoot));
      } else {
        // 没有别的会话可切时回到新建会话页；工作区在隐藏完成后重新挑。
        await handleCreateSession();
      }
    }

    const result = await workspacesApi.setVisibility({ workspaceId, hidden: true });
    if (!result.ok) {
      console.error("Failed to remove workspace from sidebar", result.error);
      return;
    }
    for (const sessionId of targetSessionIds) evictSession(sessionId);
    const refreshed = await refreshWorkspaces();
    if (normalizeWorkspaceRoot(selectedWorkspaceRoot) === normalizeWorkspaceRoot(workspaceRoot)) {
      setSelectedWorkspaceRoot(firstVisibleWorkspaceRoot(refreshed, sessions));
    }
  }, [activeSessionId, handleCreateSession, readSessionPage, refreshWorkspaces, selectedWorkspaceRoot, sessions, workspaceRegistry, evictSession]);

  const handleArchivedSessionsChange = useCallback(async () => {
    try {
      const refreshed = await readSidebarSessions();
      setSessions(refreshed);
    } catch (error) {
      console.error("Failed to refresh sessions after archived chats changed", error);
    }
  }, []);

  const handleRestoreSession = useCallback(async (sessionId: string) => {
    try {
      const result = await sessionsApi.archive({ sessionId, archived: false });
      if (!result.ok) throw new Error(result.error ?? "Restore request failed");
    } catch (error) {
      console.error("Failed to restore session", error);
    }
    await handleArchivedSessionsChange();
  }, [handleArchivedSessionsChange]);

  const getSessionPreview = useCallback(async (session: SessionListItem) => {
    return sessionsApi.getPreview({ sessionId: session.id });
  }, []);

  const handleReviewChanged = useCallback(() => {
    void refreshReviewSummary();
  }, [refreshReviewSummary]);

  const retryList = useCallback(() => setListRetry(n => n + 1), []);
  const retryMessages = useCallback(() => { if (activeSessionIdRef.current) void readSessionPage(activeSessionIdRef.current); }, [readSessionPage]);
  // Context value 用 useShallowStable 而不是 useMemo：工厂闭包会把 messages、contextState 等放进 App 的渲染作用域，
  // 旧作用域被 useCallback 链留住时，已归档会话的数据就释放不掉。
  const browse = useShallowStable<SessionBrowseState>({
    groups: visibleBrowseGroups, listLoading, listError, retryList, loadMore: loadMoreSessions, messageLoading, messageError, retryMessages,
    hasEarlier: historyBefore !== null, earlierLoading, earlierError, loadEarlier: loadEarlierMessages,
  });
  const activeSession = useShallowStable<ActiveSessionValue>({
    sessionId: activeSessionId, title, messages, contextSnapshot, contextState, isStreaming, isAborting, isCompacting, isSessionReady,
    sendScrollRequestId, composerFocusRequestId, onSend: handleSend, onAbort: activeSessionId && liveRuns.get(activeSessionId)?.operationTaskId ? undefined : handleAbort, onRetryCompaction: handleRetryCompaction,
  });
  const drafts = useSessionDrafts(localStore, activeSessionId);
  const activeComposerNotice = composerNotice && composerNotice.sessionId === activeSessionId ? composerNotice.text : null;
  const composer = useShallowStable<ComposerContextValue>({
    ...drafts, messageQueue: messageQueueControls, composerNotice: activeComposerNotice, defaultModelId, selectedModelId: selectedChatModelId,
    onSelectedModelChange: handleSelectedChatModelChange, composerMode: activeComposerState.mode, onComposerModeChange: handleComposerModeChange,
    selectedSkills: activeComposerState.selectedSkills, onSelectedSkillsChange: handleSelectedSkillsChange, models: usableChatModels, draftRestore: composerDraftRestore,
  });
  const runTargetValue = useShallowStable<RunTargetValue>({
    ...runTarget, workspaceOptions, selectedWorkspaceRoot, onSelectWorkspace: setSelectedWorkspaceRoot, execution: executionContext,
  });
  const sessionActions = useShallowStable<SessionActionsValue>({
    onNewSession: handleCreateSession, onAddWorkspace: handleAddWorkspace, onSelectSession: handleSelectSession, onTogglePin: handleTogglePin,
    onRenameSession: handleRenameSession, onCopySessionId: handleCopySessionId, onCopyTranscript: handleCopyTranscript, onForkSession: handleForkSession,
    onArchiveSession: handleArchiveSession, onRestoreSession: handleRestoreSession, onOpenWorkspace: handleOpenWorkspace, onArchiveWorkspace: handleArchiveWorkspace, onRemoveWorkspace: handleRemoveWorkspace,
  });

  const openSideChat = useCallback(async (parentSessionId: string) => {
    let result: import("@actspace/shared").SideChatOpenResult;
    try { result = await sessionsApi.openSideChat({ parentSessionId }); }
    catch (error) {
      // 从 + 菜单、启动页或 /side 打开都在主会话输入框上方提示原因。
      console.error("Failed to open side chat", error);
      setComposerNotice({ sessionId: parentSessionId, text: sideChatOpenError(error) });
      throw error;
    }
    sessionStore.applyEnvelope(result.session);
    // 主会话行上的侧边对话数量随之变化。
    void readSidebarSessions().then(setSessions).catch(console.error);
    return result;
  }, [sessionStore, readSidebarSessions]);
  const listSideChats = useCallback((parentSessionId: string) => sessionsApi.listSideChats({ parentSessionId }), []);
  const abortSideChat = useCallback((sessionId: string) => { void abortSession(sessionId); }, [abortSession]);
  const setSideChatMode = useCallback(async (sessionId: string, mode: ComposerMode) => {
    if (busySessionIds.has(sessionId)) throw new Error("侧边对话正在执行，请等这一轮结束后再切换模式");
    const expectedRevision = sessionStore.peek(sessionId)?.snapshot?.agentModeRevision;
    const result = await sessionsApi.setAgentMode({ sessionId, mode, expectedRevision });
    if (!result.ok) {
      await readSessionPage(sessionId);
      throw new Error(result.error === "SESSION_BUSY" ? "侧边对话仍有运行或审批，请稍后再切换模式。" : result.error === "AGENT_MODE_CONFLICT" ? "模式已更新，请重新选择。" : result.error ?? "模式切换失败");
    }
    await readSessionPage(sessionId);
  }, [busySessionIds, sessionStore, readSessionPage]);
  const markSideChatRead = useCallback((sessionId: string) => setLocalFlag(sessionId, "unread", false), [setLocalFlag]);
  const renameSideChat = useCallback(async (sessionId: string, title: string) => {
    const result = await sessionsApi.rename({ sessionId, title });
    if (!result.ok) throw new Error(result.error);
  }, []);
  const sideChat = useShallowStable<SideChatRuntimeValue>({
    sessionStore, liveRuns, localStore, statuses: sessionStatuses, models: usableChatModels, defaultModelId, parentModelId: selectedChatModelId,
    available: isLocalTarget, notice: composerNotice, open: openSideChat, list: listSideChats, send: sendToSession, abort: abortSideChat,
    setMode: setSideChatMode, markRead: markSideChatRead, rename: renameSideChat, retain: retainSideChat,
  });

  return (
    <AppProviders sessionStore={sessionStore} browse={browse} localStore={localStore} activeSession={activeSession} composer={composer} sessionActions={sessionActions} runTarget={runTargetValue} sideChat={sideChat}>
      <WorkbenchLayout
        sessions={visibleSessions}
        busySessionIds={busySessionIds}
        sessionStatuses={sessionStatuses}
        onSettingsChange={handleSettingsChange}
        onArchivedSessionsChange={handleArchivedSessionsChange}
        workspaces={workspaceRegistry?.items.filter((workspace) => !workspace.hidden)}
        getSessionPreview={getSessionPreview}
        reviewSummary={reviewSummary}
        onReviewChanged={handleReviewChanged}
      />
      <ShutdownOverlay />
    </AppProviders>
  );
}
