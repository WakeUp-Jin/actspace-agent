import type { DesktopBridge } from "@actspace/shared/desktop-bridge";
import type { SessionListPage, SessionListPageInput } from "@actspace/shared";
import type { TaskReceipt, TaskSnapshot } from "@actspace/shared/runtime-v2";
import {
  mockBrowserBridgeStatus,
  mockEnglishLearningState,
  mockInstalledModels,
  mockLocalUpdateState,
  mockProviders,
  mockUsableModels,
} from "./fixtures";
import {
  appendMockMessage,
  createMockSession,
  emptyTaskSnapshot,
  forkMockSession,
  listMockSessions,
  requireSession,
  sessionObservation,
  sessionProjection,
} from "./mock-db";
import { emitLiveMessage, type MockClock } from "./clock";
import { MOCK_REPLY, playReply, type ReplyPlayback } from "./stream-player";
import { mockContextPanelView, mockContextState } from "./context-panel-fixture";

/** 按域覆盖 mock 实现；未覆盖的成员用默认实现，默认也没有的成员调用时 reject。 */
export type MockHandlers = { [D in keyof DesktopBridge]?: Partial<DesktopBridge[D]> };

const SYSTEM_PROMPT = "你是 ActSpace 的主 Agent。\n- 先理解需求，再动手修改。";

/** 分页视图建立在 `sessions.list` 之上：测试只覆盖 `sessions.list` 时，侧栏分页读到的是同一份数据。 */
async function listPage(clock: MockClock, input: SessionListPageInput): Promise<SessionListPage> {
  const items = (await clock.bridge.sessions.list({})).filter((item) =>
    (!input.search || (!item.hostId && item.title.toLowerCase().includes(input.search.toLowerCase()))) &&
    (input.hostId === undefined || item.hostId === input.hostId) &&
    (input.workspaceRoot === undefined || item.workspaceRoot === input.workspaceRoot) &&
    (input.pinned === undefined || Boolean(item.pinned) === input.pinned));
  const groups = new Map<string, SessionListPage["groups"][number]>();
  for (const item of items) {
    const group = { hostId: item.hostId, workspaceRoot: item.workspaceRoot ?? "", pinned: Boolean(item.pinned), hasMore: false };
    groups.set(JSON.stringify([group.hostId, group.workspaceRoot, group.pinned]), group);
  }
  return { items, groups: [...groups.values()], indexing: false, failed: 0 };
}

export function defaultHandlers(clock: MockClock): MockHandlers {
  const { db } = clock;
  const playbacks = new Map<string, ReplyPlayback>();
  const taskSnapshot = (sessionId: string): TaskSnapshot => db.tasks.get(sessionId) ?? emptyTaskSnapshot(sessionId);
  const publishTasks = (snapshot: TaskSnapshot) => {
    db.tasks.set(snapshot.sessionId, { ...snapshot, revision: snapshot.revision + 1 });
    emitLiveMessage(clock, snapshot.sessionId, "task-queue-updated");
  };
  const touchSession = (sessionId: string, update: (session: ReturnType<typeof requireSession>) => void) => {
    update(requireSession(db, sessionId));
    emitLiveMessage(clock, sessionId, "session-title-updated");
  };

  return {
    app: { getBootstrapState: async () => db.bootstrap },
    performance: { setActive: async () => undefined },
    tasks: {
      command: async (command) => {
        if (command.op === "stop") playbacks.get(command.sessionId)?.abort();
        return { snapshot: taskSnapshot(command.sessionId) };
      },
      submit: async (input) => {
        const session = requireSession(db, input.sessionId);
        if (session.hostId && db.hosts.find((host) => host.hostId === session.hostId)?.state !== "connected") {
          return { status: "submission-failed", acknowledgement: "rejected", message: "远端 Host 未连接，草稿已保留。" };
        }
        const current = taskSnapshot(input.sessionId);
        const agentRunId = db.nextId("mock-run");
        const task: TaskReceipt["task"] = {
          taskId: input.submissionId, submissionId: input.submissionId, content: { kind: "composer-task", original: input.userInput, prepared: input.userInput },
          acceptedSeq: current.revision + 1, state: "claimed", targetRunId: null, runId: agentRunId, continuationOf: null,
        };
        publishTasks({ ...current, tasks: [...current.tasks, task] });
        appendMockMessage(db, session, "user", input.userInput, agentRunId);
        const playback = playReply(clock, { sessionId: input.sessionId, agentRunId, text: MOCK_REPLY });
        playbacks.set(input.sessionId, playback);
        return { task, revision: taskSnapshot(input.sessionId).revision, durableSeq: null };
      },
      abort: async ({ sessionId }) => {
        playbacks.get(sessionId)?.abort();
        return true;
      },
    },
    approvals: {
      listPending: async ({ sessionId }) =>
        sessionId ? [...(db.pendingApprovals.get(sessionId) ?? [])] : [...db.pendingApprovals.values()].flat(),
      submit: async ({ requestId, decision }) => {
        for (const [sessionId, pending] of db.pendingApprovals) {
          const request = pending.find((item) => item.requestId === requestId);
          if (!request?.recovery) continue;
          db.pendingApprovals.set(sessionId, pending.filter((item) => item !== request));
          const { agentRunId, toolCallId } = request.recovery;
          clock.emit("agentStream", { type: "tool_approval_resolved", sessionId, agentRunId, toolCallId, requestId, decision });
          const reply = decision === "deny" ? "已拒绝执行该命令。" : "命令已在 mock 中“执行”，没有真正运行。";
          const message = appendMockMessage(db, requireSession(db, sessionId), "assistant", reply, agentRunId);
          clock.emit("agentStream", { type: "agent_run_finished", sessionId, agentRunId, resultEventIds: [message.id] });
          return { ok: true };
        }
        return { ok: false, reason: "审批请求不存在或已处理。" };
      },
    },
    dialogs: {
      selectFiles: async () => ({ canceled: true, attachments: [] }),
      selectImages: async () => ({ canceled: true, attachments: [] }),
      selectWorkspaceDirectory: async () => ({ canceled: true }),
      importComposerImage: async () => ({ ok: false, error: { code: "write_failed", message: "浏览器 mock 模式不保存图片。" } }),
      getPathForFile: (file) => file.name,
    },
    visualize: { list: async () => ({ items: [] }) },
    workspaces: {
      list: async () => db.workspaces,
      setVisibility: async ({ workspaceId, hidden }) => {
        const workspace = db.workspaces.items.find((item) => item.id === workspaceId);
        if (!workspace) return { ok: false, error: "workspace_not_found" };
        db.workspaces = { ...db.workspaces, items: db.workspaces.items.map((item) => (item === workspace ? { ...item, hidden } : item)) };
        return { ok: true };
      },
      getGitContext: async ({ workspaceRoot }) => ({ status: "not_repository", workspaceRoot: workspaceRoot ?? db.bootstrap.workspaceRoot, branches: [] }),
      createFolder: async ({ parentRoot, name }) => {
        const now = new Date().toISOString();
        const workspaceRoot = `${parentRoot.replace(/\/+$/, "")}/${name}`;
        const workspaceId = db.nextId("workspace");
        db.workspaces = { ...db.workspaces, items: [...db.workspaces.items, { id: workspaceId, kind: "folder", label: name, path: workspaceRoot, order: db.workspaces.items.length, createdAt: now, updatedAt: now }] };
        return { ok: true, workspaceId, workspaceRoot };
      },
      listDir: async ({ workspaceRoot }) => ({ root: workspaceRoot ?? db.bootstrap.workspaceRoot, relativePath: "", entries: [] }),
      statFile: async ({ relativePath }) => ({ relativePath, size: 0, mtimeMs: 0, error: "not_found" }),
      // 浏览器 mock 没有真实的关联应用；给几个示例应用，让交付卡的下拉菜单可以检查。
      listFileApplications: async () => ({
        applications: [
          { id: "/Applications/Microsoft Word.app", name: "Microsoft Word", default: true },
          { id: "/System/Applications/Pages.app", name: "Pages", default: false },
          { id: "/System/Applications/TextEdit.app", name: "TextEdit", default: false },
        ],
      }),
      openFile: async () => ({ ok: true }),
      listOpenTools: async () => ({ tools: [] }),
      openInIde: async () => ({ ok: false, error: "open_failed" }),
      openInTool: async ({ workspaceRoot, toolId }) => ({ ok: false, workspaceRoot: workspaceRoot ?? db.bootstrap.workspaceRoot, toolId, error: "unsupported_platform" }),
    },
    review: {
      getSnapshot: async () => ({ ok: false, code: "not_a_repository", message: "浏览器 mock 模式没有 Git 仓库。" }),
      refreshSnapshot: async () => ({ ok: false, code: "not_a_repository", message: "浏览器 mock 模式没有 Git 仓库。" }),
    },
    sessions: {
      listPage: (input) => listPage(clock, input),
      list: async ({ archived }) => listMockSessions(db, archived ?? false),
      get: async ({ sessionId }) => {
        const session = db.sessions.get(sessionId);
        return session ? sessionProjection(session) : null;
      },
      getPage: async ({ sessionId }) => sessionProjection(requireSession(db, sessionId)),
      getProjectionSnapshot: async ({ sessionId }) => sessionProjection(requireSession(db, sessionId)),
      getObservation: async ({ sessionId }) => sessionObservation(requireSession(db, sessionId)),
      getPreview: async () => null,
      getSubagents: async () => [],
      getSubAgentTranscript: async () => [],
      create: async (input) => sessionProjection(createMockSession(db, input)),
      fork: async ({ sessionId }) => sessionProjection(forkMockSession(db, sessionId)),
      pin: async ({ sessionId, pinned }) => { touchSession(sessionId, (session) => { session.pinned = pinned; }); return { ok: true }; },
      rename: async ({ sessionId, title }) => { touchSession(sessionId, (session) => { session.title = title; }); return { ok: true }; },
      setWorkspace: async ({ sessionId, workspaceRoot }) => { requireSession(db, sessionId).workspaceRoot = workspaceRoot; return { ok: true }; },
      setPermissionMode: async ({ mode }) => ({ ok: true, mode }),
      setAgentMode: async ({ sessionId, mode }) => {
        const session = requireSession(db, sessionId);
        session.agentMode = mode;
        session.agentModeRevision += 1;
        return { ok: true, mode, revision: session.agentModeRevision };
      },
      revokeGrant: async () => ({ ok: true }),
      archive: async ({ sessionId, archived }) => { touchSession(sessionId, (session) => { session.archived = archived; }); return { ok: true }; },
      archiveMany: async ({ sessionIds }) => {
        for (const sessionId of sessionIds) requireSession(db, sessionId).archived = true;
        return { ok: true, archivedSessionIds: sessionIds, failedSessionIds: [] };
      },
      describeContext: async ({ sessionId }) => db.sessions.has(sessionId) ? mockContextState(mockContextPanelView(sessionId, db.sessions.get(sessionId))) : null,
      describeContextPanel: async ({ sessionId, release }) => release ? null : mockContextPanelView(sessionId, db.sessions.get(sessionId)),
    },
    usage: { getStatus: async () => null, cancel: async () => undefined, getStatistics: async () => null, getActivity: async () => null },
    // 浏览器里没有 pty：列表为空，其余操作在 UI 上不会出现（终端入口只在开发功能开启时显示）。
    terminal: { list: async () => ({ terminals: [] }) },
    settings: {
      get: async () => db.settings,
      update: async (patch) => {
        db.settings = { ...db.settings, ...patch, agent: { ...db.settings.agent, ...patch.agent }, skills: { ...db.settings.skills, ...patch.skills } };
        return db.settings;
      },
      getV4: async () => db.settingsV4,
      updateV4: async ({ namespace, patch, expectedRevision }) => {
        const latest = db.settingsV4;
        if (expectedRevision !== latest.revision) return { ok: false, code: "revision_conflict", latest, message: "设置已在别处修改。" };
        const revision = `mock-${Number(latest.revision.replace("mock-", "")) + 1}`;
        db.settingsV4 = { ...latest, revision, settings: { ...latest.settings, [namespace]: { ...latest.settings[namespace], ...patch } } };
        if (namespace === "tools" && "searchProviders" in patch) {
          db.settingsV4.settings.tools.searchProviders = { ...latest.settings.tools.searchProviders, ...patch.searchProviders };
        }
        clock.emit("settingsChanged", { revision, changedNamespaces: [namespace] });
        return { ok: true, snapshot: db.settingsV4 };
      },
      readSystemPrompt: async () => ({ path: db.settings.agent.systemPromptPath, content: SYSTEM_PROMPT }),
      getSearchUsage: async () => ({ ok: false }),
    },
    quickOpen: {
      consume: async () => null,
      getShortcutStatus: async () => ({ registered: false, accelerator: db.settings.shortcuts?.quickOpen.accelerator ?? "" }),
    },
    providers: {
      list: async () => mockProviders(),
      setKey: async ({ provider }) => {
        if (provider in db.settings.providers) db.settings.providers[provider as keyof typeof db.settings.providers] = { ...db.settings.providers[provider as keyof typeof db.settings.providers], hasApiKey: true };
        if (provider in db.settings.searchProviders) db.settings.searchProviders[provider as keyof typeof db.settings.searchProviders] = { hasApiKey: true };
        return { ok: true };
      },
      clearKey: async ({ provider }) => {
        if (provider in db.settings.providers) db.settings.providers[provider as keyof typeof db.settings.providers] = { ...db.settings.providers[provider as keyof typeof db.settings.providers], hasApiKey: false };
        if (provider in db.settings.searchProviders) db.settings.searchProviders[provider as keyof typeof db.settings.searchProviders] = { hasApiKey: false };
        return { ok: true };
      },
    },
    models: {
      listInstalled: async () => ({ models: mockInstalledModels() }),
      listUsable: async () => ({ models: mockUsableModels() }),
      getPricingCatalog: async () => null,
      refreshPricingCatalog: async () => null,
    },
    englishLearning: { getState: async () => mockEnglishLearningState() },
    browserBridge: { getStatus: async () => mockBrowserBridgeStatus() },
    skills: { list: async () => ({ items: [], warnings: [] }) },
    updates: { getState: async () => mockLocalUpdateState() },
    appearance: {
      setUiZoom: () => undefined,
      setNativeTheme: () => undefined,
    },
    hosts: {
      list: async () => db.hosts,
      activate: async () => undefined,
      reconnect: async (id) => {
        db.hosts = db.hosts.map((host) => (host.id === id && host.state === "offline" ? { ...host, state: "connected", error: undefined } : host));
        clock.emit("hostsChanged", db.hosts);
      },
      remove: async (id) => {
        db.hosts = db.hosts.filter((host) => host.id !== id);
        clock.emit("hostsChanged", db.hosts);
      },
    },
  };
}
