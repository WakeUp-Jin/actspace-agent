import type { FixtureRunInput, FixtureCompactionInput, FixtureCompactionResult } from "./task-host-fixture";
import { taskHostFixture } from "./task-host-fixture";
import { FixedRendererStreamAdapter } from "../../main/runtime-v2/fixed-renderer-stream-adapter";
import { runToolStreamFixture } from "@actspace/core-agent-loop/testing";
import { SessionReadModel } from "@actspace/runtime";
import { recordProjectionFixture } from "./projection-fixture";
import { projectChatSession } from "@actspace/client/sessions";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentRunResult, AppSettings, BootstrapState,  ReviewGetSnapshotResult,  RuntimeStreamEvent, SessionEvent, SessionListItem, SessionRecord, WorkspaceListResult } from "@actspace/shared";
import { createMessageBlocks } from "@actspace/shared";
import { App } from "../App";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { TooltipProvider } from "../components/ui/Tooltip";
import { overrideBridge, setupBridge } from "./helpers/bridge";
import { projectRecord } from "./helpers/session-records";
import { transcriptShadow } from "./helpers/transcript-shadow";

// 14 T15：每次 durable / live 合并都与旧实现对照，不一致就让用例失败（见 helpers/transcript-shadow.ts）。
vi.mock("../session/transcript", async (importOriginal) => (await import("./helpers/transcript-shadow")).shadowTranscript(await importOriginal()));
afterEach(() => { expect(transcriptShadow.mismatches.splice(0)).toEqual([]); });

const bootstrapState: BootstrapState = {
  appVersion: "0.1.0",
  dataRoot: "/tmp/actspace",
  sessionRoot: "/tmp/actspace/sessions",
  logRoot: "/tmp/actspace/logs",
  tmpRoot: "/tmp/actspace/tmp",
  workspaceRoot: "/tmp/workspace",
};

const defaultSettings: AppSettings = {
  version: 1,
  defaultModelId: null,
  providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
  searchProviders: {
    zhipu: { hasApiKey: false },
    tavily: { hasApiKey: false },
    tinyfish: { hasApiKey: false },
    exa: { hasApiKey: false },
  },
  agent: {
    systemPromptPath: "/tmp/actspace/prompts/main-agent.md",
    temperature: null,
    maxTokens: null,
    disabledTools: [],
    bashAlwaysAsk: false,
    exploreModelId: null,
  },
  skills: { disabled: [] },
};

/** bridge 的设置相关方法默认覆盖，供各用例 spread 进 `taskHostFixture`。 */
const settingsApiStub = {
  "settings.get": async () => defaultSettings,
  "settings.readSystemPrompt": async () => ({ path: defaultSettings.agent.systemPromptPath, content: "" }),
  "settings.writeSystemPrompt": async (input: { content: string }) => ({
    path: defaultSettings.agent.systemPromptPath,
    content: input.content,
  }),
  "settings.update": async () => defaultSettings,
  "providers.setKey": async () => ({ ok: true }),
  "providers.clearKey": async () => ({ ok: true }),
  "providers.testConnection": async () => ({ ok: true, message: "连接成功" }),
  "visualize.convertReply": async () => ({ html: "<!doctype html><html></html>", sourceHash: "stub", cached: false }),
  "visualize.list": async () => ({ items: [] }),
  "sessions.describeContext": async () => null,
  "review.getSnapshot": async () => createReviewChanges(0, 0),
  "review.initGit": async () => ({
    ok: true,
    alreadyRepository: true,
    workspaceRoot: "/tmp/workspace",
  }),
  "workspaces.listDir": async () => ({ root: "/tmp/workspace", relativePath: "", entries: [] }),
  "workspaces.readFile": async () => ({ relativePath: "", renderKind: "text" as const, size: 0, mtimeMs: 0, content: "" }),
  "sessions.archive": async () => ({ ok: true }),
  "sessions.archiveMany": async (input: { sessionIds: string[] }) => ({
    ok: true,
    archivedSessionIds: input.sessionIds,
    failedSessionIds: [],
  }),
  "appearance.setUiZoom": () => {},
  "appearance.setNativeTheme": () => {},
  "events.shuttingDown": () => () => {},
};

function createWorkspaceRegistryFixture(createdAt: string, updatedAt = createdAt): WorkspaceListResult {
  return {
    version: 1,
    items: [
      {
        id: "default",
        kind: "folder",
        label: "Default workspace",
        path: "/tmp/downloads",
        order: 0,
        createdAt,
        updatedAt,
      },
      {
        id: "ws_source",
        kind: "folder",
        label: "workspace",
        path: "/tmp/workspace",
        order: 1,
        createdAt,
        updatedAt,
      },
      {
        id: "ws_alt",
        kind: "folder",
        label: "alt-workspace",
        path: "/tmp/alt-workspace",
        order: 2,
        createdAt,
        updatedAt,
      },
    ],
  };
}

function createEmptySessionRecord(sessionId: string): SessionRecord {
  const now = new Date().toISOString();
  return {
    meta: {
      schemaVersion: 2,
      id: sessionId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      agentRunCount: 0,
    },
    events: [],
    messageBlocks: [],
    contextSnapshot: null,
    contextState: null,
  };
}

function createReviewChanges(additions: number, deletions: number): ReviewGetSnapshotResult {
  const hasChanges = additions + deletions > 0;
  return {
    ok: true,
    snapshot: {
      id: `review-${additions}-${deletions}`,
      generation: 1,
      workspaceId: "ws_source",
      workspaceRoot: "/tmp/workspace",
      repoRoot: "/tmp/workspace",
      selection: { kind: "uncommitted" },
      baseline: { kind: "git-ref", label: "HEAD" },
      target: { label: "Working tree" },
      status: hasChanges ? "ready" : "empty",
      files: hasChanges ? [
        {
          id: "src/example.ts",
          path: "src/example.ts",
          status: "modified",
          additions,
          deletions,
          binary: false,
          renderKind: "text",
          source: "workingTree",
          diffLoadStatus: "idle",
          viewed: false,
          fingerprint: "example-fingerprint",
        },
      ] : [],
      totals: { files: hasChanges ? 1 : 0, additions, deletions, changedLines: additions + deletions, estimatedChangedBytes: 0 },
      capabilities: {
        canStageFile: hasChanges,
        canStageHunk: hasChanges,
        canUnstageFile: false,
        canUnstageHunk: false,
        canRevertFile: hasChanges,
        canRevertHunk: hasChanges,
        canLoadFullFile: true,
        canOpenFile: true,
        canCommit: hasChanges,
        canPush: false,
        canCreatePullRequest: false,
        disabledReasons: {},
      },
      loadPolicy: { mode: "all-files" },
      queryOptions: { ignoreWhitespaceChanges: false },
      generatedAt: new Date().toISOString(),
    },
  };
}

function renderApp() {
  return render(
    <TooltipProvider delayDuration={0}>
      <App />
    </TooltipProvider>,
  );
}

describe("App streaming user message", () => {
  const originalScrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
  const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    if (originalScrollWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScrollWidthDescriptor);
    } else {
      delete (HTMLElement.prototype as unknown as { scrollWidth?: number }).scrollWidth;
    }

    if (originalClientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidthDescriptor);
    } else {
      delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth;
    }
  });

  function setupSingleSessionArchive() {
    const active = createEmptySessionRecord("archive-active");
    active.meta.title = "Active session";
    const target = createEmptySessionRecord("archive-target");
    target.meta.title = "Archive target";
    const records = new Map([[active.meta.id, active], [target.meta.id, target]]);
    const sessions: SessionListItem[] = [active, target].map((record) => ({
      id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: 0, workspaceRoot: "/tmp/workspace",
    }));
    let resolveArchive!: (result: { ok: boolean; error?: string }) => void;
    const archiveSession = vi.fn(() => new Promise<{ ok: boolean; error?: string }>((resolve) => { resolveArchive = resolve; }));
    const listSessions = vi.fn(async () => sessions);
    setupBridge(taskHostFixture({
      ...settingsApiStub,
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": listSessions,
      getRecord: async ({ sessionId }: { sessionId: string }) => records.get(sessionId) ?? null,
      "sessions.create": projectRecord(async () => active),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "approvals.listPending": async () => [],
      "sessions.archive": archiveSession,
      "events.agentStream": () => () => {},
      execute: vi.fn(),
    }));
    return { archiveSession, listSessions, resolveArchive: (result: { ok: boolean; error?: string }) => resolveArchive(result) };
  }

  it("hides a single session before a slow archive IPC finishes", async () => {
    const { archiveSession, listSessions, resolveArchive } = setupSingleSessionArchive();
    renderApp();
    const row = (await screen.findByText("Archive target")).closest(".session-row") as HTMLElement;
    const initialLists = listSessions.mock.calls.length;
    fireEvent.click(within(row).getByRole("button", { name: "归档会话" }));
    expect(archiveSession).toHaveBeenCalledWith({ sessionId: "archive-target", archived: true });
    expect(document.querySelector('[data-session-id="archive-target"]')).toBeNull();
    await act(async () => resolveArchive({ ok: true }));
    expect(listSessions).toHaveBeenCalledTimes(initialLists);
    expect(document.querySelector('[data-session-id="archive-target"]')).toBeNull();
  });

  it("restores a single session when archive IPC reports failure", async () => {
    const { listSessions, resolveArchive } = setupSingleSessionArchive();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderApp();
      const row = (await screen.findByText("Archive target")).closest(".session-row") as HTMLElement;
      const initialLists = listSessions.mock.calls.length;
      fireEvent.click(within(row).getByRole("button", { name: "归档会话" }));
      expect(document.querySelector('[data-session-id="archive-target"]')).toBeNull();
      await act(async () => resolveArchive({ ok: false, error: "disk failed" }));
      expect(listSessions).toHaveBeenCalledTimes(initialLists + 1);
      expect(document.querySelector('[data-session-id="archive-target"]')).not.toBeNull();
      expect(errorLog).toHaveBeenCalledWith("Failed to archive session", expect.any(Error));
    } finally {
      errorLog.mockRestore();
    }
  });

  it("archives every workspace session including pinned sessions", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    const active = createEmptySessionRecord("session-active");
    active.meta.title = "Active workspace session";
    active.meta.workspaceId = "ws_source";
    active.meta.workspaceRoot = "/tmp/workspace";
    const fallback = createEmptySessionRecord("session-fallback");
    fallback.meta.title = "Fallback session";
    fallback.meta.workspaceId = "ws_alt";
    fallback.meta.workspaceRoot = "/tmp/alt-workspace";
    const sessions: SessionListItem[] = [
      { id: active.meta.id, title: active.meta.title, updatedAt: now, agentRunCount: 1, workspaceId: "ws_source", workspaceRoot: "/tmp/workspace" },
      { id: "session-pinned", title: "Pinned workspace session", updatedAt: now, agentRunCount: 1, workspaceId: "ws_source", workspaceRoot: "/tmp/workspace", pinned: true },
      { id: fallback.meta.id, title: fallback.meta.title, updatedAt: now, agentRunCount: 1, workspaceId: "ws_alt", workspaceRoot: "/tmp/alt-workspace" },
    ];
    const archiveSessions = vi.fn(async (input: { sessionIds: string[] }) => ({
      ok: true,
      archivedSessionIds: input.sessionIds,
      failedSessionIds: [],
    }));
    const records = new Map([[active.meta.id, active], [fallback.meta.id, fallback]]);

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(now),
      "sessions.list": async () => sessions,
      getRecord: async ({ sessionId }) => records.get(sessionId) ?? null,
      "sessions.create": projectRecord(async () => active),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({ provider: "deepseek", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      "providers.getKimiBalance": async () => ({ provider: "kimi", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "sessions.archiveMany": archiveSessions,
      "events.agentStream": () => () => {},
      execute: async () => ({ sessionId: active.meta.id, agentRunId: "unused", status: "completed", events: [], contextSnapshot: null, contextState: null }),
    }));

    renderApp();
    await screen.findByRole("button", { name: "查看会话详情： Active workspace session" });
    fireEvent.contextMenu(screen.getByRole("button", { name: "workspace" }), { clientX: 24, clientY: 60 });
    await user.click(screen.getByRole("menuitem", { name: "归档全部" }));

    await waitFor(() => {
      expect(archiveSessions).toHaveBeenCalledWith({ sessionIds: ["session-active", "session-pinned"] });
    });
  });

  it("hides a workspace and moves the active session to a visible fallback", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    const active = createEmptySessionRecord("session-hidden-active");
    active.meta.title = "Hidden active session";
    active.meta.workspaceId = "ws_source";
    active.meta.workspaceRoot = "/tmp/workspace";
    const fallback = createEmptySessionRecord("session-visible-fallback");
    fallback.meta.title = "Visible fallback session";
    fallback.meta.workspaceId = "ws_alt";
    fallback.meta.workspaceRoot = "/tmp/alt-workspace";
    const sessions: SessionListItem[] = [
      { id: active.meta.id, title: active.meta.title, updatedAt: now, agentRunCount: 1, workspaceId: "ws_source", workspaceRoot: "/tmp/workspace" },
      { id: fallback.meta.id, title: fallback.meta.title, updatedAt: now, agentRunCount: 1, workspaceId: "ws_alt", workspaceRoot: "/tmp/alt-workspace" },
    ];
    let registry = createWorkspaceRegistryFixture(now);
    const setWorkspaceVisibility = vi.fn(async () => {
      registry = {
        ...registry,
        items: registry.items.map((workspace) => workspace.id === "ws_source" ? { ...workspace, hidden: true } : workspace),
      };
      return { ok: true as const };
    });
    const records = new Map([[active.meta.id, active], [fallback.meta.id, fallback]]);

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => registry,
      "sessions.list": async () => sessions,
      getRecord: async ({ sessionId }) => records.get(sessionId) ?? null,
      "sessions.create": projectRecord(async () => active),
      "workspaces.setVisibility": setWorkspaceVisibility,
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({ provider: "deepseek", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      "providers.getKimiBalance": async () => ({ provider: "kimi", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": () => () => {},
      execute: async () => ({ sessionId: active.meta.id, agentRunId: "unused", status: "completed", events: [], contextSnapshot: null, contextState: null }),
    }));

    renderApp();
    await screen.findByRole("button", { name: "查看会话详情： Hidden active session" });
    fireEvent.contextMenu(screen.getByRole("button", { name: "workspace" }), { clientX: 24, clientY: 60 });
    await user.click(screen.getByRole("menuitem", { name: "从侧栏移除" }));

    await waitFor(() => {
      expect(setWorkspaceVisibility).toHaveBeenCalledWith({ workspaceId: "ws_source", hidden: true });
      expect(screen.queryByText("Hidden active session")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "查看会话详情： Visible fallback session" })).toBeInTheDocument();
      // 分页列表的分组里仍有这个工作区，也不能把它的文件夹加回侧栏。
      expect(screen.queryByRole("button", { name: "workspace" })).not.toBeInTheDocument();
    });
  });

  it("does not hydrate sessions of a removed workspace again when the session list refreshes", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    const visible = createEmptySessionRecord("session-visible");
    visible.meta.title = "Visible session";
    visible.meta.workspaceId = "ws_alt";
    visible.meta.workspaceRoot = "/tmp/alt-workspace";
    const sessions: SessionListItem[] = [
      { id: visible.meta.id, title: visible.meta.title, updatedAt: now, agentRunCount: 1, workspaceId: "ws_alt", workspaceRoot: "/tmp/alt-workspace" },
      { id: "session-removed", title: "Removed workspace session", updatedAt: now, agentRunCount: 1, workspaceId: "ws_source", workspaceRoot: "/tmp/workspace" },
    ];
    let registry = createWorkspaceRegistryFixture(now);
    const setWorkspaceVisibility = vi.fn(async () => {
      registry = { ...registry, items: registry.items.map((workspace) => workspace.id === "ws_source" ? { ...workspace, hidden: true } : workspace) };
      return { ok: true as const };
    });
    const listSessions = vi.fn(async () => sessions.map((session) => ({ ...session })));
    const listPending = vi.fn(async (_input: { sessionId: string }) => []);
    const hostListeners = new Set<(hosts: unknown[]) => void>();

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => registry,
      "sessions.list": listSessions,
      getRecord: async ({ sessionId }) => sessionId === visible.meta.id ? visible : null,
      "workspaces.setVisibility": setWorkspaceVisibility,
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({ provider: "deepseek", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      "providers.getKimiBalance": async () => ({ provider: "kimi", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      "approvals.listPending": listPending,
      "events.hostsChanged": (callback: (hosts: unknown[]) => void) => { hostListeners.add(callback); return () => { hostListeners.delete(callback); }; },
      ...settingsApiStub,
      "events.agentStream": () => () => {},
      execute: async () => ({ sessionId: visible.meta.id, agentRunId: "unused", status: "completed", events: [], contextSnapshot: null, contextState: null }),
    }));

    renderApp();
    await screen.findByText("Removed workspace session");
    await waitFor(() => expect(listPending).toHaveBeenCalledWith({ sessionId: "session-removed" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: "workspace" }), { clientX: 24, clientY: 60 });
    await user.click(screen.getByRole("menuitem", { name: "从侧栏移除" }));
    await waitFor(() => expect(screen.queryByText("Removed workspace session")).not.toBeInTheDocument());

    listPending.mockClear();
    const listCalls = listSessions.mock.calls.length;
    act(() => { for (const listener of hostListeners) listener([]); });
    await waitFor(() => expect(listSessions.mock.calls.length).toBeGreaterThan(listCalls));
    await act(async () => { await Promise.resolve(); });
    expect(listPending).not.toHaveBeenCalledWith({ sessionId: "session-removed" });
  });

  it("refreshes the composer review summary from workspace review state", async () => {
    const sessionId = "session-review-summary";
    const record = createEmptySessionRecord(sessionId);
    record.meta.workspaceRoot = "/tmp/workspace";
    record.messageBlocks = [
      {
        kind: "assistant",
        id: "assistant-review-summary",
        content: "Ready to continue.",
        createdAt: record.meta.createdAt,
      },
    ];
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Review summary",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    let reviewAdditions = 7;
    let reviewDeletions = 2;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;
    const getReviewSnapshot = vi.fn(async () => createReviewChanges(reviewAdditions, reviewDeletions));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "review.getSnapshot": getReviewSnapshot,
      "events.agentStream": () => () => {},
      execute: () =>
        new Promise((resolve) => {
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    expect(await screen.findByRole("button", { name: "审查待处理变更 +7 -2" })).toHaveTextContent("Review+7-2");
    await waitFor(() => {
      expect(getReviewSnapshot).toHaveBeenCalledWith({
        workspaceRoot: "/tmp/workspace",
        sessionId,
        selection: { kind: "uncommitted" },
      });
    });

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "update files");
    await userEvent.click(screen.getByLabelText("发送消息"));

    reviewAdditions = 10;
    reviewDeletions = 1;
    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-review-summary-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });

    expect(await screen.findByRole("button", { name: "审查待处理变更 +10 -1" })).toHaveTextContent("Review+10-1");
  });

  it("wires the current session hover preview through the App bridge", async () => {
    const user = userEvent.setup();
    const sessionId = "session-hover-preview-app";
    const record = createEmptySessionRecord(sessionId);
    record.meta.title = "Hover preview";
    record.meta.workspaceRoot = "/tmp/workspace";
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Hover preview",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const getSessionPreview = vi.fn(async () => ({
      sessionId,
      workspaceRoot: "/tmp/workspace",
      modelId: "deepseek-v4-pro" as const,
      contextSnapshot: {
        totalTokens: 42_000,
        cumulativeTokens: 42_000,
        maxTokens: 100_000,
        percentUsed: 42,
        buckets: [],
      },
    }));

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.getPreview": getSessionPreview,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": () => () => {},
      execute: async () => ({
        sessionId,
        agentRunId: "turn-unused",
        status: "completed",
        events: [],
        contextSnapshot: null,
        contextState: null,
      }),
    }));

    renderApp();

    const titleTrigger = await screen.findByRole("button", { name: "查看会话详情： Hover preview" });
    await user.hover(titleTrigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(getSessionPreview).toHaveBeenCalledWith({ sessionId });
    expect(tooltip).toHaveTextContent(`sessionId: ${sessionId}`);
    expect(tooltip).toHaveTextContent("/tmp/workspace");
    expect(tooltip).toHaveTextContent("deepseek-flash");
    expect(tooltip).toHaveTextContent("累计 Token：42K");
  });

  it("keeps New chat as a placeholder and refreshes a background generated title", async () => {
    let record = createEmptySessionRecord("title-session");
    type LiveListener = (envelope: { event: { kind: string; sessionId: string; message: string } }) => void;
    const listeners = new Set<LiveListener>();
    const createSession = vi.fn(async () => record);
    setupBridge(taskHostFixture({
      ...settingsApiStub,
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => [{ id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: 0, workspaceRoot: "/tmp/workspace" }],
      getRecord: async () => record,
      "sessions.create": projectRecord(createSession),
      "approvals.listPending": async () => [],
      "events.agentStream": () => () => {},
      "events.sessionLive": (listener: LiveListener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    }));
    renderApp();
    await screen.findByRole("button", { name: "查看会话详情： New chat" });
    await userEvent.click(screen.getByRole("button", { name: "新建会话" }));
    expect(createSession).not.toHaveBeenCalled();
    await userEvent.click(within(document.querySelector('[data-session-id="title-session"]') as HTMLElement).getByRole("button", { name: "New chat" }));
    record = { ...record, meta: { ...record.meta, title: "项目架构分析" } };
    act(() => listeners.forEach(listener => listener({ event: { kind: "runtime-live", sessionId: record.meta.id, message: "session-title-updated" } })));
    await screen.findByRole("button", { name: "查看会话详情： 项目架构分析" });
    expect(document.querySelector('[data-session-id="title-session"]')).toHaveTextContent("项目架构分析");
  });

  it("scrolls to the latest message when the user sends a new message", async () => {
    const sessionId = "session-scroll";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });

    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": () => () => {},
      execute: () =>
        new Promise((resolve) => {
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "scroll me");
    await userEvent.click(screen.getByLabelText("发送消息"));

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-scroll-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("keeps the optimistic user message visible while stream events arrive before the final reply", async () => {
    const sessionId = "session-test";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "show me immediately");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByText("show me immediately")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("show me immediately")).toBeTruthy();
    });

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("restores the draft when preparation rejects before task admission", async () => {
    const sessionId = "session-preparation-failed";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [{
      id: sessionId,
      title: "New chat",
      updatedAt: record.meta.updatedAt,
      agentRunCount: 0,
      workspaceRoot: "/tmp/workspace",
    }];
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) streamHandler = null;
        };
      },
      prepare: async () => ({ status: "submission-failed", acknowledgement: "rejected", message: "Git repository has no commits yet." }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "keep this input");
    await userEvent.click(screen.getByLabelText("发送消息"));

    await waitFor(() => {
      expect(composer).toHaveValue("keep this input");
      expect(screen.getByRole("alert")).toHaveTextContent("Git repository has no commits yet.");
    });
  });

  it.each(["", " \n\t"])("ignores blank thinking deltas (%j) while preserving waiting and visible reasoning", async (blankDelta) => {
    const sessionId = "session-model-wait";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Model wait",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let activeAgentRunId = "";
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) => new Promise((resolve) => {
        activeAgentRunId = input.agentRunId;
        streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
        resolveExecution = resolve;
      }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "wait for the model");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(screen.queryByText("Operating Space · Expanding")).toBeNull();

    const initialWaitingText = await screen.findByText("Operating Space · Expanding");
    expect(initialWaitingText).toHaveClass("tool-log-text-running");
    expect(initialWaitingText).toHaveAttribute("data-shimmer-text", "Operating Space · Expanding");

    await act(async () => {
      streamHandler?.({
        type: "assistant_thinking_delta",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
        sessionId,
        agentRunId: activeAgentRunId,
        messageId: "evt-wait-thinking",
        delta: blankDelta,
      });
    });

    expect(screen.queryByRole("button", { name: "Thinking..." })).toBeNull();
    expect(screen.getByText("Operating Space · Expanding")).toHaveClass("tool-log-text-running");

    await act(async () => {
      streamHandler?.({
        type: "assistant_thinking_delta",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
        sessionId,
        agentRunId: activeAgentRunId,
        messageId: "evt-wait-thinking",
        delta: "Inspect the request before using a tool.",
      });
    });

    const runningThinkingTitle = await screen.findByText("Thinking...");
    expect(runningThinkingTitle).toHaveClass("tool-log-text-running");
    expect(runningThinkingTitle).toHaveAttribute("data-shimmer-text", "Thinking...");
    expect(screen.queryByText("Operating Space · Expanding")).toBeNull();

    await act(async () => {
      streamHandler?.({
        type: "tool_started",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-wait-read",
        toolName: "read_file",
        argsPreview: "{\"path\":\"README.md\"}",
        preview: {
          kind: "read",
          filePath: "README.md",
          displayText: "Read README.md",
        },
      });
    });
    expect(screen.queryByText("Operating Space · Expanding")).toBeNull();
    expect(screen.getByText("Thinking...")).not.toHaveClass("tool-log-text-running");

    await act(async () => {
      streamHandler?.({
        type: "tool_finished",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-wait-read",
        toolName: "read_file",
        resultEventId: "evt-wait-read-finished",
        isError: false,
        preview: {
          kind: "read",
          filePath: "README.md",
          displayText: "Read README.md",
        },
      });
    });

    expect(await screen.findByText("Operating Space · Expanding")).toHaveClass("tool-log-text-running");

    await act(async () => {
      streamHandler?.({
        type: "assistant_text_delta",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
sessionId,
        agentRunId: activeAgentRunId,
        messageId: "evt-wait-answer",
        delta: "Model response",
      });
    });

    expect(await screen.findByText("Model response")).toBeInTheDocument();
    expect(screen.queryByText("Operating Space · Expanding")).toBeNull();

    await act(async () => {
      streamHandler?.({
        type: "assistant_thinking_delta",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
        sessionId,
        agentRunId: activeAgentRunId,
        messageId: "evt-empty-thinking-after-answer",
        delta: blankDelta,
      });
    });

    expect(screen.getAllByRole("button", { name: "Thinking..." })).toHaveLength(1);
    expect(screen.getByText("Thinking...")).not.toHaveClass("tool-log-text-running");
    expect(screen.getByText("Inspect the request before using a tool.").textContent).toBe(`${blankDelta}Inspect the request before using a tool.`);

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: activeAgentRunId,
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("routes overlapping turns through one stream listener without duplicating or clearing the visible turn", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    const alphaSessionId = "session-overlap-alpha";
    const betaSessionId = "session-overlap-beta";
    const alphaRecord = createEmptySessionRecord(alphaSessionId);
    alphaRecord.meta.title = "Alpha chat";
    const betaRecord = createEmptySessionRecord(betaSessionId);
    betaRecord.meta.title = "Beta chat";
    const records: Record<string, SessionRecord> = {
      [alphaSessionId]: alphaRecord,
      [betaSessionId]: betaRecord,
    };
    const sessions: SessionListItem[] = [
      {
        id: alphaSessionId,
        title: alphaRecord.meta.title,
        updatedAt: "2026-07-17T07:10:00.000Z",
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
      {
        id: betaSessionId,
        title: betaRecord.meta.title,
        updatedAt: "2026-07-17T07:09:00.000Z",
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const streamListeners = new Set<(event: RuntimeStreamEvent) => void>();
    const agentRunIds = new Map<string, string>();
    const resolveTurns = new Map<string, () => void>();
    const emit = (event: RuntimeStreamEvent) => {
      for (const listener of streamListeners) listener(event);
    };

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async ({ sessionId }) => records[sessionId] ?? null,
      "sessions.create": projectRecord(async () => alphaRecord),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamListeners.add(callback);
        return () => {
          streamListeners.delete(callback);
        };
      },
      execute: (input: FixtureRunInput) => new Promise((resolve) => {
        agentRunIds.set(input.sessionId, input.agentRunId);
        emit({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
        if (input.sessionId === betaSessionId) {
          emit({
            type: "assistant_text_delta",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            messageId: "evt-beta-text",
            delta: "beta streamed once",
          });
        }
        resolveTurns.set(input.sessionId, () => resolve({
          sessionId: input.sessionId,
          agentRunId: input.agentRunId,
          status: "completed" as const,
          events: [],
          contextSnapshot: {
            totalTokens: 0,
            maxTokens: 200_000,
            percentUsed: 0,
            buckets: [],
          },
          contextState: null,
        }));
      }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "alpha prompt");
    await userEvent.click(screen.getByLabelText("发送消息"));
    await waitFor(() => {
      expect(agentRunIds.has(alphaSessionId)).toBe(true);
      expect(streamListeners.size).toBe(1);
    });

    const betaTitle = await screen.findByText("Beta chat");
    await userEvent.click(betaTitle.closest("button") as HTMLButtonElement);

    const betaComposer = await screen.findByLabelText("消息输入框");
    await userEvent.type(betaComposer, "beta prompt");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByText("beta streamed once")).toBeInTheDocument();
    expect(screen.queryByText("beta streamed oncebeta streamed once")).toBeNull();
    expect(streamListeners.size).toBe(1);

    const alphaAgentRunId = agentRunIds.get(alphaSessionId)!;
    await act(async () => {
      emit({
        type: "assistant_text_delta",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
sessionId: alphaSessionId,
        agentRunId: alphaAgentRunId,
        messageId: "evt-stale-alpha",
        delta: "stale alpha text",
      });
    });
    expect(screen.queryByText("stale alpha text")).toBeNull();

    await act(async () => {
      resolveTurns.get(alphaSessionId)?.();
    });
    expect(await screen.findByText("beta streamed once")).toBeInTheDocument();
    expect(screen.getByLabelText("停止 Agent")).toBeInTheDocument();

    await act(async () => {
      resolveTurns.get(betaSessionId)?.();
    });
  });

  it("hands the visible turn from streaming to persistence without duplicating or remounting it", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    const sessionId = "session-stream-handoff";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    let currentRecord = record;
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;
    let resolveFinalSessionList: ((value: SessionListItem[]) => void) | null = null;
    let listSessionsCallCount = 0;
    const getSession = vi.fn(async () => currentRecord);

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": () => {
        listSessionsCallCount += 1;
        if (listSessionsCallCount === 1) return Promise.resolve(sessions);
        return new Promise((resolve) => {
          resolveFinalSessionList = resolve;
        });
      },
      getRecord: getSession,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) streamHandler = null;
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "agent_run_started", sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "assistant_text_delta",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId,
            agentRunId: input.agentRunId,
            messageId: "evt-stream-delta",
            delta: "handoff reply",
          });
          const timestamp = new Date().toISOString();
          const events: SessionEvent[] = [
            {
              id: "evt-handoff-user",
              sessionId,
              agentRunId: input.agentRunId,
              type: "user_message",
              timestamp,
              schemaVersion: 2,
              payload: { content: "handoff prompt" },
            },
            {
              id: "evt-handoff-assistant",
              sessionId,
              agentRunId: input.agentRunId,
              type: "assistant_message",
              timestamp,
              schemaVersion: 2,
              payload: {
                content: "handoff reply",
                stopReason: "stop",
                model: "test-model",
                provider: "test-provider",
              },
            },
          ];
          currentRecord = {
            ...record,
            meta: { ...record.meta, updatedAt: timestamp, agentRunCount: 1 },
            events,
            messageBlocks: createMessageBlocks(events),
          };
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "handoff prompt");
    await userEvent.click(screen.getByLabelText("发送消息"));

    const streamingUserNode = (await screen.findByText("handoff prompt")).closest(".message-turn");
    const streamingAssistantNode = (await screen.findByText("handoff reply")).closest(".assistant-reply");
    expect(streamingUserNode).not.toBeNull();
    expect(streamingAssistantNode).not.toBeNull();

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: currentRecord.events[0].agentRunId,
        status: "completed",
        events: currentRecord.events,
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });

    await waitFor(() => {
      expect(getSession.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(listSessionsCallCount).toBe(2);
    });

    expect(screen.getAllByText("handoff prompt")).toHaveLength(1);
    expect(screen.getAllByText("handoff reply")).toHaveLength(1);
    expect(screen.getByText("handoff prompt").closest(".message-turn")).toBe(streamingUserNode);
    expect(screen.getByText("handoff reply").closest(".assistant-reply")).toBe(streamingAssistantNode);

    await act(async () => {
      resolveFinalSessionList?.(sessions);
    });
  });

  it("keeps the selected model after creating a new session and switching composer surfaces", async () => {
    const sessionId = "session-created-model";
    const record = createEmptySessionRecord(sessionId);
    const execute = vi.fn(async (input: FixtureRunInput) => ({
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      status: "completed" as const,
      events: [],
      contextSnapshot: {
        totalTokens: 0,
        maxTokens: 200_000,
        percentUsed: 0,
        buckets: [],
      },
      contextState: null,
    }));

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => [],
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "sessions.setWorkspace": async () => ({ ok: true }),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": () => () => {},
      execute,
    }));

    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: /deepseek-flash/i }));
    await userEvent.click(screen.getAllByRole("button", { name: "deepseek-flash" }).at(-1)!);

    let composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "start with flash");
    await userEvent.click(screen.getByLabelText("发送消息"));

    await waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(1);
    });

    composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "continue with flash");
    await userEvent.click(screen.getByLabelText("发送消息"));

    await waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(2);
    });
    // 模型列表来自 mock bridge 的 `models.listUsable`（键形如 provider:model）。
    expect(execute.mock.calls.map(([input]) => input.model)).toEqual([
      "deepseek:deepseek-flash",
      "deepseek:deepseek-flash",
    ]);
  });

  function installCompactBridge(sessionId: string, compactContext: ((input: FixtureCompactionInput) => Promise<FixtureCompactionResult>), execute = vi.fn(), controls: { onStream?: (callback: (event: RuntimeStreamEvent) => void) => void; abort?: () => Promise<boolean> } = {}) {
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [{ id: sessionId, title: "New chat", updatedAt: record.meta.updatedAt, agentRunCount: 0, workspaceRoot: "/tmp/workspace" }];
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": controls.abort ?? (async () => true),
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      executeCompaction: compactContext,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        controls.onStream?.(callback);
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute,
    }));

    return execute;
  }

  const compactedResult = (input: FixtureCompactionInput, status: "compacted" | "skipped") => ({
    sessionId: input.sessionId,
    agentRunId: input.agentRunId,
    status,
    events: [],
    contextSnapshot: { totalTokens: 20, maxTokens: 200_000, percentUsed: 0, buckets: [] },
    contextState: null,
  });

  it("routes /compact through task submission, shows the running block and blocks stop until it settles", async () => {
    let resolveCompactContext: (() => void) | null = null;
    const compactContext = vi.fn((input: FixtureCompactionInput) => new Promise<Awaited<ReturnType<((input: FixtureCompactionInput) => Promise<FixtureCompactionResult>)>>>((resolve) => {
      resolveCompactContext = () => resolve(compactedResult(input, "skipped"));
    }));
    const execute = installCompactBridge("session-compact", compactContext);

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "/compact");
    await userEvent.click(screen.getByLabelText("发送消息"));

    await waitFor(() => {
      expect(compactContext).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("正在压缩上下文")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "上下文压缩进度" })).toBeInTheDocument();
    expect(screen.getByLabelText("正在压缩上下文，压缩完成后可继续")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("/compact")).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();

    await act(async () => {
      resolveCompactContext?.();
    });
    expect(await screen.findByText("对话还很短，暂时不需要压缩")).toBeInTheDocument();
    expect(screen.queryByText("正在压缩上下文")).not.toBeInTheDocument();
  });

  it("keeps a failed manual compaction in the stream and retries through the same command", async () => {
    const compactContext = vi.fn()
      .mockRejectedValueOnce(new Error("模型请求超时"))
      .mockImplementationOnce(async (input: FixtureCompactionInput) => compactedResult(input, "skipped"));
    installCompactBridge("session-compact-failed", compactContext);

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "/compact");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByText("上下文压缩失败 · 模型请求超时")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(compactContext).toHaveBeenCalledTimes(2);
    });
    expect(compactContext.mock.calls[1]?.[0]).toMatchObject({ sessionId: "session-compact-failed" });
    await waitFor(() => {
      expect(screen.queryByText("上下文压缩失败 · 模型请求超时")).not.toBeInTheDocument();
    });
  });

  it.each(["context_compaction_failed", "context_compaction_finished"] as const)("retains automatic failure after completion and retries (%s)", async (type) => {
    let emit!: (event: RuntimeStreamEvent) => void;
    let finish!: () => void;
    let input!: FixtureRunInput;
    const compact = vi.fn(async (value: FixtureCompactionInput) => compactedResult(value, "skipped"));
    const execute = vi.fn((value: FixtureRunInput) => {
      input = value;
      return new Promise<AgentRunResult>(resolve => { finish = () => resolve({ ...compactedResult({ sessionId: value.sessionId, agentRunId: value.agentRunId }, "skipped"), status: "completed" }); });
    });
    installCompactBridge("auto-failed", compact, execute, { onStream: callback => { emit = callback; } });
    renderApp();
    await userEvent.type(await screen.findByLabelText("消息输入框"), "automatic failure");
    await userEvent.click(screen.getByLabelText("发送消息"));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    await act(async () => {
      const identity = { sessionId: input.sessionId, agentRunId: input.agentRunId };
      emit(type === "context_compaction_failed"
        ? { ...identity, type, error: { code: "TEST", message: "自动压缩超时", recoverable: true } }
        : { ...identity, type, payload: { triggerTokens: 100, thresholdTokens: 90, summaryChars: 0, historyRefPath: "session.jsonl", status: "failed", beforeCount: 10, afterCount: 10, reason: "自动压缩超时" } });
    });
    expect(await screen.findByText("上下文压缩失败 · 自动压缩超时")).toBeInTheDocument();
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument());
    expect(screen.getByText("上下文压缩失败 · 自动压缩超时")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(compact).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("上下文压缩失败 · 自动压缩超时")).not.toBeInTheDocument());
  });

  it("aborts an Agent while automatic compaction is running", async () => {
    let emit!: (event: RuntimeStreamEvent) => void;
    let input!: FixtureRunInput;
    let finish!: () => void;
    const abort = vi.fn(async () => { finish(); return true; });
    const execute = vi.fn((value: FixtureRunInput) => {
      input = value;
      return new Promise<AgentRunResult>(resolve => { finish = () => resolve({ ...compactedResult({ sessionId: value.sessionId, agentRunId: value.agentRunId }, "skipped"), status: "aborted" }); });
    });
    installCompactBridge("auto-abort", vi.fn(), execute, { onStream: callback => { emit = callback; }, abort });
    renderApp();
    await userEvent.type(await screen.findByLabelText("消息输入框"), "automatic compaction");
    await userEvent.click(screen.getByLabelText("发送消息"));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    await act(async () => { emit({ type: "context_compaction_started", sessionId: input.sessionId, agentRunId: input.agentRunId, startedAt: new Date().toISOString() }); });
    expect(await screen.findByText("正在压缩上下文")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("停止 Agent"));
    await waitFor(() => expect(abort).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("正在压缩上下文")).not.toBeInTheDocument());
  });

  it.each([false, true])("renders real loop tools and rehydrates without duplicates (finishOnly=%s)", async (finishOnly) => {
    const sessionId = "session-test";
    let record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let storedProjection = recordProjectionFixture(record);
    const adapter = new FixedRendererStreamAdapter();
    let finishTool!: () => void;
    let finishText!: () => void;
    const toolGate = new Promise<void>((resolve) => { finishTool = resolve; });
    const textGate = new Promise<void>((resolve) => { finishText = resolve; });
    let lastFinished: Extract<RuntimeStreamEvent, { type: "tool_finished" }> | undefined;
    adapter.subscribe((event) => {
      if (event.type === "tool_finished") lastFinished = event;
      if (finishOnly && (event.type === "tool_call_streaming" || event.type === "tool_started")) return;
      streamHandler?.(event);
    });


    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "sessions.getPage": async () => storedProjection,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: async (input: FixtureRunInput) => {
        const fixture = await runToolStreamFixture({ sessionId: input.sessionId, agentRunId: input.agentRunId,
          onLiveEvent: (event) => adapter.accept(event),
          execute: async () => { await toolGate; return { status: "completed", summary: "Read fixture.txt", modelOutput: [{ type: "text", text: "fixture" }] }; },
          beforeFinalText: () => textGate,
        });
        const model = new SessionReadModel(fixture.header, fixture.registry, new Map()).replay(fixture.journal);
        const snapshot = model.snapshot();
        storedProjection = { ...recordProjectionFixture(record), throughJournalSeq: snapshot.throughJournalSeq, snapshot, values: model.projections.snapshot(input.sessionId).values, activeMessageIds: snapshot.messages.map(message => message.messageId), window: { events: fixture.journal, fromSeq: 0, throughJournalSeq: snapshot.throughJournalSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 } };
        record = projectChatSession(snapshot, fixture.journal, "/tmp/workspace");
        return { sessionId: input.sessionId, agentRunId: input.agentRunId, status: "completed", events: record.events, contextSnapshot: { totalTokens: 0, maxTokens: 200_000, percentUsed: 0, buckets: [] }, contextState: null };
      },
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "read that file");
    await userEvent.click(screen.getByLabelText("发送消息"));

    if (!finishOnly) expect(await screen.findByText("Read fixture.txt")).toHaveAttribute("data-shimmer-text");
    expect(screen.queryByText(/\{"path"/)).not.toBeInTheDocument();
    await act(async () => { finishTool(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Read fixture.txt" })).not.toHaveAttribute("data-shimmer-text"));
    expect(screen.queryByText(/已结束\./)).not.toBeInTheDocument();
    await act(async () => {
      if (!lastFinished) throw new Error("Expected a tool result before final text");
      streamHandler?.({ ...lastFinished, type: "tool_call_streaming", preview: { kind: "read", filePath: "late.txt", displayText: "late" } });
      streamHandler?.({ type: "tool_approval_required", sessionId, agentRunId: lastFinished.agentRunId, toolCallId: lastFinished.toolCallId, toolName: "read_file", requestId: "late-approval", summary: "Late", reason: "Late" });
      streamHandler?.(lastFinished);
    });
    expect(screen.getByRole("button", { name: "Read fixture.txt" })).not.toHaveAttribute("data-shimmer-text");
    expect(screen.queryByText("Read late.txt")).not.toBeInTheDocument();
    await act(async () => { finishText(); });
    expect(await screen.findByText(/body JSON/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /Worked for/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Read fixture.txt" })).toHaveLength(1));
    expect(screen.queryByText(/\{"path"/)).not.toBeInTheDocument();
    adapter.dispose();
  });

  it("finishes multiple write tools independently as each tool_finished event arrives", async () => {
    const sessionId = "session-write-status";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Write status",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let activeAgentRunId = "";
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          activeAgentRunId = input.agentRunId;
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          for (const [index, filePath] of ["first.ts", "second.ts", "third.ts"].entries()) {
            streamHandler?.({
              type: "tool_started",
              turnId: "turn-stream",
              llmCallId: "llm-call-stream",
sessionId: input.sessionId,
              agentRunId: input.agentRunId,
              toolCallId: `tool-write-${index + 1}`,
              toolName: "write_file",
              argsPreview: JSON.stringify({ path: filePath }),
              preview: {
                kind: "write",
                filePath,
                additions: 0,
                deletions: 0,
                diff: "",
                collapsedLines: 5,
                status: "running",
                streamingContent: `export const value${index + 1} = ${index + 1};`,
              },
            });
          }
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "write three files");
    await userEvent.click(screen.getByLabelText("发送消息"));

    for (const filePath of ["first.ts", "second.ts", "third.ts"]) {
      const runningText = await screen.findByText(`Write ${filePath} · 正在生成`);
      expect(runningText.closest(".tool-log-line")).toHaveClass("is-running");
    }

    const finishWrite = async (index: number, filePath: string) => {
      await act(async () => {
        streamHandler?.({
          type: "tool_finished",
          turnId: "turn-stream",
          llmCallId: "llm-call-stream",
sessionId,
          agentRunId: activeAgentRunId,
          toolCallId: `tool-write-${index}`,
          toolName: "write_file",
          resultEventId: `evt-write-${index}`,
          isError: false,
          preview: {
            kind: "write",
            filePath,
            additions: 1,
            deletions: 0,
            diff: `+export const value${index} = ${index};`,
            collapsedLines: 5,
            status: "completed",
          },
        });
      });
    };

    await finishWrite(1, "first.ts");
    expect(screen.getByRole("button", { name: /Write first\.ts/ })).toBeInTheDocument();
    expect(screen.getByText("Write second.ts · 正在生成").closest(".tool-log-line")).toHaveClass("is-running");
    expect(screen.getByText("Write third.ts · 正在生成").closest(".tool-log-line")).toHaveClass("is-running");

    await finishWrite(2, "second.ts");
    expect(screen.getByRole("button", { name: /Write second\.ts/ })).toBeInTheDocument();
    expect(screen.getByText("Write third.ts · 正在生成").closest(".tool-log-line")).toHaveClass("is-running");

    await finishWrite(3, "third.ts");
    expect(screen.getByRole("button", { name: /Write third\.ts/ })).toBeInTheDocument();

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: activeAgentRunId,
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("replaces the visible Todo snapshot when a later Todo tool starts in the same run", async () => {
    const sessionId = "session-todo-stream";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Todo stream",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const now = new Date().toISOString();

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let activeAgentRunId = "";
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: now,
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: now,
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) streamHandler = null;
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          activeAgentRunId = input.agentRunId;
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "tool_started",
            turnId: "turn-todo-stream",
            llmCallId: "llm-todo-stream",
            sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-todo-1",
            toolName: "todo_write",
            argsPreview: "{}",
            preview: {
              kind: "todo",
              todos: [{
                id: "todo-1",
                content: "Inspect current behavior",
                status: "in_progress",
                activeForm: "Inspecting current behavior",
                createdAt: now,
                updatedAt: now,
              }],
              completedCount: 0,
              totalCount: 1,
              revision: 1,
              displayText: "0/1 completed",
            },
          });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "implement the feature");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByRole("listitem", { name: "In progress: Inspect current behavior" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Agent Todo list")).toHaveLength(1);
    const sentUserMessage = screen.getByText("implement the feature").closest(".user-message");
    const todoBlock = screen.getByLabelText("Agent Todo list");
    const executionCard = sentUserMessage?.closest(".turn-prompt-card");
    expect(sentUserMessage).not.toBeNull();
    expect(executionCard).not.toBeNull();
    expect(executionCard).toContainElement(todoBlock);
    expect(sentUserMessage!.compareDocumentPosition(todoBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      streamHandler?.({
        type: "tool_call_streaming",
        turnId: "turn-todo-stream",
        llmCallId: "llm-todo-stream",
        sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-todo-2-partial",
        toolName: "todo_write",
        preview: {
          kind: "todo",
          todos: [],
          completedCount: 0,
          totalCount: 0,
          revision: 0,
          displayText: "0 of 0 To-dos Completed",
        },
      });
    });

    expect(screen.getByRole("listitem", { name: "In progress: Inspect current behavior" })).toBeInTheDocument();

    await act(async () => {
      streamHandler?.({
        type: "tool_started",
        turnId: "turn-todo-stream",
        llmCallId: "llm-todo-stream",
        sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-todo-2",
        toolName: "todo_write",
        argsPreview: "{}",
        preview: {
          kind: "todo",
          todos: [
            {
              id: "todo-1",
              content: "Inspect current behavior",
              status: "completed",
              createdAt: now,
              updatedAt: now,
            },
            {
              id: "todo-2",
              content: "Add the regression test",
              status: "in_progress",
              activeForm: "Adding the regression test",
              createdAt: now,
              updatedAt: now,
            },
          ],
          completedCount: 1,
          totalCount: 2,
          revision: 2,
          displayText: "1/2 completed",
        },
      });
    });

    expect(screen.getAllByLabelText("Agent Todo list")).toHaveLength(1);
    expect(screen.getByRole("listitem", { name: "Completed: Inspect current behavior" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "In progress: Add the regression test" })).toBeInTheDocument();

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: activeAgentRunId,
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("renders a streaming Agent block from SubAgent events and opens the live transcript", async () => {
    const sessionId = "session-subagent-stream";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "SubAgent stream",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const transcriptEvent: SessionEvent = {
      id: "evt-subagent-tool",
      sessionId,
      agentRunId: "turn-subagent:subagent:run-1",
      type: "tool_call",
      timestamp: "2026-06-03T10:00:00.000Z",
      schemaVersion: 2,
      payload: {
        id: "tool-read-app",
        name: "read_file",
        arguments: { path: "apps/desktop/src/renderer/App.tsx" },
      },
    };
    const getReviewSnapshot = vi.fn(async () => createReviewChanges(7, 2));

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      "sessions.getSubAgentTranscript": async () => [{ ...transcriptEvent, type: "tool_result", payload: { toolCallId: "tool-read-app", status: "running", uiPreview: { kind: "read", filePath: "apps/desktop/src/renderer/App.tsx", displayText: "Read apps/desktop/src/renderer/App.tsx" } } }],
      ...settingsApiStub,
      "review.getSnapshot": getReviewSnapshot,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "tool_call_streaming",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-agent-1",
            toolName: "agent",
            isInitial: true,
            preview: {
              kind: "agent",
              description: "Explore renderer flow",
              status: "running",
              subagentType: "explore",
              displayText: "正在读取 · App.tsx",
            },
          });
          streamHandler?.({
            type: "subagent_event",
            sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-agent-1",
            transcriptRef: {
              kind: "subagent_transcript",
              sessionId,
              agentRunId: input.agentRunId,
              runId: "run-1",
            },
            event: transcriptEvent,
            preview: {
              kind: "agent",
              description: "Explore renderer flow",
              status: "running",
              subagentType: "explore",
              displayText: "正在读取 · App.tsx",
              transcriptRef: {
                kind: "subagent_transcript",
                sessionId,
                agentRunId: input.agentRunId,
                runId: "run-1",
              },
              recentEvents: [
                {
                  id: "evt-subagent-tool",
                  type: "tool_call",
                  title: "Read",
                  summary: "Read apps/desktop/src/renderer/App.tsx",
                  timestamp: "2026-06-03T10:00:00.000Z",
                },
              ],
            },
          });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "delegate exploration");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByText("Explore renderer flow")).toBeTruthy();
    expect(await screen.findByText("正在读取 · App.tsx")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "审查待处理变更 +7 -2" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Open SubAgent transcript for Explore renderer flow/ }));

    const panel = await screen.findByRole("region", { name: "子 Agent 详情" });
    expect(panel).toBeTruthy();
    expect(await within(panel).findByText("Read apps/desktop/src/renderer/App.tsx")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /SubAgent transcript: Explore renderer flow/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "审查待处理变更 +7 -2" })).toBeInTheDocument();

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-subagent-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("opens the workspace directory picker when clicking Add workspace", async () => {
    const sessionId = "session-workspace";
    const record = createEmptySessionRecord(sessionId);
    const createdRecord = createEmptySessionRecord("session-created-workspace");
    createdRecord.meta.workspaceRoot = "/tmp/new-workspace";
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Workspace source",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const selectWorkspaceDirectory = vi.fn(async () => ({
      canceled: false,
      workspaceRoot: "/tmp/new-workspace",
    }));
    const createSession = vi.fn(async () => createdRecord);

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(createSession),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      "dialogs.selectWorkspaceDirectory": selectWorkspaceDirectory,
      ...settingsApiStub,
      "events.agentStream": () => () => {},
      execute: async () => ({
        sessionId,
        agentRunId: "turn-unused",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      }),
    }));

    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: "添加工作区" }));

    await waitFor(() => {
      expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(1);
      expect(selectWorkspaceDirectory).toHaveBeenCalledWith({ registerWorkspace: true });
      expect(createSession).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "选择工作区" })).toHaveTextContent("new-workspace");
    });
  });

  it("defers moving the current session to the selected workspace until sending", async () => {
    const sessionId = "session-workspace-switch";
    const record = createEmptySessionRecord(sessionId);
    record.meta.workspaceRoot = "/tmp/workspace";
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Workspace source",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
      {
        id: "session-other-workspace",
        title: "Other workspace",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/alt-workspace",
      },
      {
        id: "session-default-workspace",
        title: "Default workspace chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
      },
    ];
    const callOrder: string[] = [];
    const setSessionWorkspace = vi.fn(async () => {
      callOrder.push("set-workspace");
      return { ok: true };
    });
    const execute = vi.fn(async () => {
      callOrder.push("run-turn");
      return {
        sessionId,
        agentRunId: "turn-workspace-switch",
        status: "completed" as const,
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      };
    });

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "sessions.setWorkspace": setSessionWorkspace,
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": () => () => {},
      execute,
    }));

    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: "选择工作区" }));
    const workspaceMenu = await screen.findByRole("menu", { name: "选择工作区" });
    expect(within(workspaceMenu).getByRole("menuitemradio", { name: /^Default workspace/ })).toBeInTheDocument();
    await userEvent.click(within(workspaceMenu).getByRole("menuitemradio", { name: /^alt-workspace/ }));

    expect(setSessionWorkspace).not.toHaveBeenCalled();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "use the alternate workspace");
    await userEvent.click(screen.getByLabelText("发送消息"));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(setSessionWorkspace).toHaveBeenCalledWith({ sessionId, workspaceRoot: "/tmp/alt-workspace" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sessionId }));
    expect(callOrder).toEqual(["set-workspace", "run-turn"]);
  });

  it("sends attachments through FixtureRunInput and keeps the attachment chip while running", async () => {
    const sessionId = "session-attachments";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const selectedAttachment = {
      id: "att-screenshot",
      kind: "image" as const,
      name: "screenshot.png",
      path: "/Users/test/screenshot.png",
      mimeType: "image/png",
      previewUrl: "data:image/png;base64,preview",
    };

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let capturedInput: FixtureRunInput | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      "dialogs.selectImages": async () => ({ canceled: false, attachments: [selectedAttachment] }),
      "models.listUsable": async () => ({
        models: [{
          key: "deepseek:deepseek-v4-pro",
          label: "DeepSeek V4 Pro",
          provider: "deepseek",
          apiModel: "deepseek-v4-pro",
          contextWindow: 1_000_000,
          thinkingDefault: true,
          capabilities: {
            input: ["text"],
            toolUse: "verified",
            reasoning: true,
            thinkingToggle: true,
          },
        }],
      }),
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          capturedInput = input;
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await userEvent.click(screen.getByRole("option", { name: "图片" }));
    expect(await screen.findByLabelText("已附加的图片 screenshot.png")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "预览附加图片 screenshot.png" }));
    expect(await screen.findByRole("img", { name: "预览图片" })).toHaveAttribute(
      "src",
      "data:image/png;base64,preview",
    );

    await userEvent.type(composer, "what is in this screenshot?");
    await userEvent.click(screen.getByLabelText("发送消息"));

    await waitFor(() => {
      expect(capturedInput?.attachments).toEqual([{
        id: "att-screenshot",
        kind: "image",
        name: "screenshot.png",
        path: "/Users/test/screenshot.png",
        mimeType: "image/png",
      }]);
      expect(capturedInput?.mode).toBe("agent");
      expect(capturedInput?.selectedSkills).toEqual([]);
    });
    const sentImagePreview = await screen.findByRole("button", {
      name: "Preview message image screenshot.png",
    });
    expect(sentImagePreview).toBeEnabled();
    await userEvent.click(sentImagePreview);
    expect(await screen.findByRole("img", { name: "预览图片" })).toHaveAttribute(
      "src",
      "data:image/png;base64,preview",
    );

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-attachments-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("renders web search as a running WebSearch line without result content", async () => {
    const sessionId = "session-test";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "tool_started",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-web-search-1",
            toolName: "web_search",
            argsPreview: "{\"query\":\"最新新闻 今天\"}",
            preview: {
              kind: "web_search",
              mode: "query",
              query: "最新新闻 今天",
              displayText: "Web Search 最新新闻 今天",
            },
          });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "search the web");
    await userEvent.click(screen.getByLabelText("发送消息"));

    const webSearchLine = await screen.findByText("Web Search 最新新闻 今天");
    expect(webSearchLine.closest(".tool-log-line")?.classList.contains("is-running")).toBe(true);
    expect(screen.queryByText("result answer body")).toBeNull();

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-web-search-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("renders grep and glob as independent running tool lines", async () => {
    const sessionId = "session-test";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "tool_started",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-grep-1",
            toolName: "grep",
            argsPreview: "{\"pattern\":\"ToolUiPreview\",\"glob\":\"*.ts\"}",
            preview: {
              kind: "grep",
              pattern: "ToolUiPreview",
              scope: "*.ts",
              displayText: "Grep ToolUiPreview in *.ts",
            },
          });
          streamHandler?.({
            type: "tool_started",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-glob-1",
            toolName: "glob",
            argsPreview: "{\"pattern\":\"src/**/*.ts\",\"path\":\"packages/agent-core\"}",
            preview: {
              kind: "glob",
              pattern: "src/**/*.ts",
              scope: "packages/agent-core",
              displayText: "Glob src/**/*.ts in packages/agent-core",
            },
          });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "inspect files");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByText("Grep ToolUiPreview in *.ts")).toBeTruthy();
    expect(await screen.findByText("Glob src/**/*.ts in packages/agent-core")).toBeTruthy();
    expect(screen.queryByText("Searched files *.ts for ToolUiPreview")).toBeNull();

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-grep-glob-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("marks the active sidebar session as waiting for approval while a tool approval is pending", async () => {
    const sessionId = "session-approval";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Approval session",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let approvalPending = false;
    let activeAgentRunId = "";
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async (input) =>
        input?.sessionId === sessionId && approvalPending
          ? [{
              requestId: "approval-bash-1",
              toolName: "bash",
              summary: "Run install",
              reason: "Bash command requires approval",
              command: "pnpm install",
              createdAt: Date.now(),
              expiresAt: Date.now() + 60_000,
            }]
          : [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          activeAgentRunId = input.agentRunId;
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "tool_started",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-bash-approval",
            toolName: "bash",
            argsPreview: "{\"command\":\"pnpm install\"}",
            preview: {
              kind: "bash",
              status: "running",
              title: "Run install",
              command: "pnpm install",
              commandPreview: "pnpm install",
            },
          });
          approvalPending = true;
          streamHandler?.({
            type: "tool_approval_required",
            sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-bash-approval",
            toolName: "bash",
            requestId: "approval-bash-1",
            summary: "Run install",
            reason: "Bash command requires approval",
            command: "pnpm install",
            executionEnvironment: "sandbox",
          });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "install deps");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByRole("button", { name: "会话状态： 等待审批" })).toBeTruthy();
    expect(screen.getByText("沙盒")).toBeInTheDocument();

    await act(async () => {
      approvalPending = false;
      streamHandler?.({
        type: "tool_approval_resolved",
        sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-bash-approval",
        requestId: "approval-bash-1",
        decision: "once",
      });
      streamHandler?.({
        type: "tool_finished",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-bash-approval",
        toolName: "bash",
        resultEventId: "event-bash-approval-result",
        isError: false,
        preview: {
          kind: "bash",
          status: "success",
          title: "Bash command",
          command: "pnpm install",
          commandPreview: "pnpm install",
          sandboxed: true,
        },
      });
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-approval-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("renders delete_file pending approval as a delete confirmation block", async () => {
    const sessionId = "session-delete-approval";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Delete approval session",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let approvalPending = false;
    let activeAgentRunId = "";
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;
    const submitApproval = vi.fn(async () => ({ ok: true }));

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": submitApproval,
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async (input) =>
        input?.sessionId === sessionId && approvalPending
          ? [{
              requestId: "approval-delete-1",
              toolName: "delete_file",
              summary: "Delete notes.md",
              reason: "delete_file is a destructive file operation and requires approval.",
              createdAt: Date.now(),
              expiresAt: Date.now() + 60_000,
            }]
          : [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          activeAgentRunId = input.agentRunId;
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "tool_call_streaming",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-delete-1",
            toolName: "delete_file",
            isInitial: true,
            preview: {
              kind: "delete",
              filePath: "/tmp/workspace/notes.md",
              displayText: "",
              status: "running",
            },
          });
          approvalPending = true;
          streamHandler?.({
            type: "tool_approval_required",
            sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-delete-1",
            toolName: "delete_file",
            requestId: "approval-delete-1",
            summary: "Delete notes.md",
            reason: "delete_file is a destructive file operation and requires approval.",
            riskLevel: "high",
          });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "delete notes.md");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByText("notes.md")).toBeInTheDocument();
    expect(screen.getByText("notes.md").closest("article")).toHaveClass("approval");
    expect(screen.queryByRole("button", { name: "本会话允许" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "once",
    });
    expect(await screen.findByText("Delete notes.md")).toBeInTheDocument();

    await act(async () => {
      approvalPending = false;
      streamHandler?.({
        type: "tool_approval_resolved",
        sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-delete-1",
        requestId: "approval-delete-1",
        decision: "once",
      });
    });

    await act(async () => {
      streamHandler?.({
        type: "tool_finished",
        turnId: "turn-stream",
        llmCallId: "llm-call-stream",
sessionId,
        agentRunId: activeAgentRunId,
        toolCallId: "tool-delete-1",
        toolName: "delete_file",
        resultEventId: "evt-delete-result",
        isError: false,
      });
    });

    expect(await screen.findByText("Deleted notes.md")).toBeInTheDocument();

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-delete-approval-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("renders browser session approval from the runtime stream and submits allow", async () => {
    const sessionId = "session-browser-approval";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Browser approval session",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;
    const submitApproval = vi.fn(async () => ({ ok: true }));

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": submitApproval,
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) streamHandler = null;
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          streamHandler?.({
            type: "tool_started",
            turnId: "turn-stream",
            llmCallId: "llm-call-stream",
sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-browser-1",
            toolName: "browser_tabs",
            argsPreview: '{"action":"list"}',
          });
          streamHandler?.({
            type: "tool_approval_required",
            sessionId: input.sessionId,
            agentRunId: input.agentRunId,
            toolCallId: "tool-browser-1",
            toolName: "browser_tabs",
            requestId: "approval-browser-1",
            summary: "允许当前会话使用浏览器",
            reason: "Browser tools require session authorization.",
            approvalScope: "browser_session",
          });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "看看浏览器标签页");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByText("确认浏览器操作")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "允许这次" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-browser-1",
      decision: "once",
    });

    await act(async () => {
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-browser-approval-finished",
        status: "completed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });
  });

  it("marks the active sidebar session as failed when a turn fails", async () => {
    const sessionId = "session-failed";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Failure session",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: async () => record,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": async () => true,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        return () => {
          void callback;
        };
      },
      execute: async (input: FixtureRunInput) => ({
        sessionId: input.sessionId,
        agentRunId: input.agentRunId,
        status: "failed",
        events: [],
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
        error: {
          code: "provider_error",
          message: "Provider failed",
        },
      }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "fail this turn");
    await userEvent.click(screen.getByLabelText("发送消息"));

    expect(await screen.findByRole("button", { name: "会话状态： 失败" })).toBeTruthy();
  });

  it("only renders grep and glob tooltips when the tool line is truncated", async () => {
    const longGrepText =
      "Grep react|React|useState|useEffect|useCallback|useMemo|useRef|createContext|useContext in /workspace/packages";

    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return 320;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 640;
      },
    });

    const { rerender } = render(
      <ToolLogLine
        message={{
          kind: "grep",
          id: "grep-short",
          pattern: "ToolUiPreview",
          scope: "*.ts",
          displayText: "Grep ToolUiPreview in *.ts",
          createdAt: new Date().toISOString(),
          status: "running",
        }}
      />,
    );

    const runningGrepLine = screen.getByText("Grep ToolUiPreview in *.ts");
    expect(runningGrepLine).toBeTruthy();
    expect(runningGrepLine.classList.contains("tool-log-text-running")).toBe(true);
    expect(runningGrepLine).toHaveAttribute("data-shimmer-text", "Grep ToolUiPreview in *.ts");
    expect(screen.queryByRole("tooltip")).toBeNull();

    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return 860;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 320;
      },
    });

    rerender(
      <ToolLogLine
        message={{
          kind: "glob",
          id: "glob-long",
          pattern: "react|React|useState|useEffect|useCallback|useMemo|useRef|createContext|useContext",
          scope: "/workspace/packages",
          displayText: longGrepText.replace("Grep", "Glob"),
          createdAt: new Date().toISOString(),
        }}
      />,
    );

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe(
      "Glob react|React|useState|useEffect|useCallback|useMemo|useRef|createContext|useContext in /workspace/packages",
    );
    expect(tooltip.closest(".tool-log-line")?.classList.contains("is-tooltip-open")).toBe(false);

    await userEvent.hover(tooltip.closest(".tool-log-line") as HTMLElement);
    expect(tooltip.closest(".tool-log-line")?.classList.contains("is-tooltip-open")).toBe(true);
  });

  it("switches the send button into a stop button and calls abortAgentRun while streaming", async () => {
    const sessionId = "session-abort";
    const record = createEmptySessionRecord(sessionId);
    let currentRecord = record;
    const getSessionMock = vi.fn(async () => currentRecord);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];

    const abortAgentRunMock = vi.fn(async () => true);
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveExecution: ((value: AgentRunResult) => void) | null =
      null;

    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => sessions,
      getRecord: getSessionMock,
      "sessions.create": projectRecord(async () => record),
      "tasks.abort": abortAgentRunMock,
      "approvals.submit": async () => ({ ok: true }),
      "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null,
      "providers.getDeepSeekBalance": async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "providers.getKimiBalance": async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      "approvals.listPending": async () => [],
      ...settingsApiStub,
      "events.agentStream": (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      execute: (input: FixtureRunInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
          resolveExecution = resolve;
        }),
    }));

    renderApp();

    const composer = await screen.findByLabelText("消息输入框");
    await userEvent.type(composer, "stop me");
    await userEvent.click(screen.getByLabelText("发送消息"));

    const stopButton = await screen.findByLabelText("停止 Agent");
    await userEvent.click(stopButton);

    await waitFor(() => {
      expect(abortAgentRunMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      const timestamp = new Date().toISOString();
      const events: SessionEvent[] = [
        {
          id: "evt-user-abort",
          sessionId,
          agentRunId: "turn-abort-finished",
          type: "user_message",
          timestamp,
          schemaVersion: 2,
          payload: { content: "stop me" },
        },
        {
          id: "evt-turn-aborted",
          sessionId,
          agentRunId: "turn-abort-finished",
          type: "agent_run_aborted",
          timestamp,
          schemaVersion: 2,
          payload: { reason: "user" },
        },
      ];
      currentRecord = {
        ...record,
        meta: { ...record.meta, updatedAt: timestamp, agentRunCount: 1 },
        events,
      };
      streamHandler?.({ type: "agent_run_aborted", sessionId, agentRunId: "turn-abort-finished" });
      resolveExecution?.({
        sessionId,
        agentRunId: "turn-abort-finished",
        status: "aborted",
        events,
        contextSnapshot: {
          totalTokens: 0,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    });

    expect(await screen.findByText("stop me")).toBeTruthy();
    expect(await screen.findByText("Stopped")).toBeTruthy();
    expect((screen.getByLabelText("消息输入框") as HTMLTextAreaElement).disabled).toBe(false);
    expect(getSessionMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it('loads only the latest message page, prepends older messages, and keeps them when a live event arrives', async () => {
    const latest = createEmptySessionRecord('paged');
    latest.meta.title = 'Paged session';
    latest.events = [{ id: 'v2-20', sessionId: 'paged', agentRunId: 'r2', schemaVersion: 2, timestamp: latest.meta.createdAt, type: 'user_message', payload: { content: 'Latest question' } }];
    const earlier = { ...latest, events: [{ ...latest.events[0], id: 'v2-0', agentRunId: 'r1', payload: { content: 'Earlier question' } }] } as SessionRecord;
    const getSession = vi.fn(async () => ({ ...latest, events: [...earlier.events, ...latest.events] }));
    const projectionPage = (record: SessionRecord, eventSeq: number, beforeSeq: number | null) => {
      const base = recordProjectionFixture(record);
      const events = base.window.events.map((event) => ({ ...event, seq: eventSeq }));
      return {
        ...base,
        throughJournalSeq: 20,
        snapshot: { ...base.snapshot, throughJournalSeq: 20 },
        activeMessageIds: ["v2-20", "v2-0"],
        window: { ...base.window, events, fromSeq: eventSeq, throughJournalSeq: beforeSeq === null ? 9 : 20, beforeSeq },
      };
    };
    const latestProjection = projectionPage(latest, 10, 10);
    const earlierProjection = projectionPage(earlier, 0, null);
    const getSessionPage = vi.fn(async ({ beforeSeq }: { sessionId: string; beforeSeq?: number }) => beforeSeq === undefined ? latestProjection : earlierProjection);
    const listSessions = vi.fn(async () => []);
    const live = new Set<(envelope: { event: unknown }) => void>();
    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState,
      "workspaces.list": async () => createWorkspaceRegistryFixture(latest.meta.createdAt),
      "events.sessionLive": (listener: (envelope: { event: unknown }) => void) => { live.add(listener); return () => { live.delete(listener); }; },
      "sessions.listPage": async () => ({ items: [{ id: 'paged', title: 'Paged session', updatedAt: latest.meta.updatedAt, agentRunCount: 2, workspaceRoot: "/tmp/workspace" }], groups: [], indexing: false, failed: 0 }),
      "sessions.list": listSessions, getRecord: getSession,
      "sessions.create": projectRecord(async () => latest), "tasks.abort": async () => true, "approvals.submit": async () => ({ ok: true }), "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null, "approvals.listPending": async () => [], ...settingsApiStub, "sessions.getPage": getSessionPage,
      "events.agentStream": () => () => {}, execute: vi.fn(),
    }));
    renderApp();
    await screen.findByText('Latest question');
    expect(screen.queryByText('Earlier question')).not.toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled(); expect(listSessions).not.toHaveBeenCalled();
    // 已在顶部时继续向上滚（没有 scroll 事件）也会自动加载更早消息。
    fireEvent.wheel(screen.getByLabelText('会话消息'), { deltaY: -120 });
    await screen.findByText('Earlier question');
    expect(getSessionPage).toHaveBeenLastCalledWith({ sessionId: 'paged', beforeSeq: 10 });
    expect(screen.getByText('Latest question')).toBeInTheDocument();
    // 早期页并入 store 之后再收到 live 的 journal 更新：接在窗口末尾，早期内容不丢（14 T10）。
    const pageCalls = getSessionPage.mock.calls.length;
    const liveMessage = { recordKind: 'event', seq: 21, type: 'user/message', eventVersion: 1, criticality: 'ignorable', time: latest.meta.createdAt, source: { ownerPluginId: '@actspace/core' },
      data: { agentRunId: 'r3', messageId: 'v2-21', content: 'Live question' }, surface: { kind: 'append', node: { kind: 'user', messageId: 'v2-21', content: 'Live question' } },
      provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
    act(() => live.forEach(listener => listener({ event: { kind: 'journal-update', schemaVersion: 1, runtimeInstanceId: 'runtime-1', liveSeq: 1, throughJournalSeq: 21, sessionId: 'paged',
      update: { sessionId: 'paged', throughJournalSeq: 21, event: liveMessage, values: {} } } })));
    await screen.findByText('Live question');
    expect(screen.getByText('Earlier question')).toBeInTheDocument();
    expect(screen.getByText('Latest question')).toBeInTheDocument();
    expect(getSessionPage).toHaveBeenCalledTimes(pageCalls);
  });

  it('ignores a slow page response after selecting a different session', async () => {
    const a = createEmptySessionRecord('page-a'); a.meta.title = 'Page A';
    const b = createEmptySessionRecord('page-b'); b.meta.title = 'Page B';
    b.events = [{ id: 'v2-1', sessionId: 'page-b', agentRunId: 'rb', schemaVersion: 2, timestamp: b.meta.createdAt, type: 'user_message', payload: { content: 'B visible question' } }];
    let resolveA!: (page: import('@actspace/shared/runtime-v2').RuntimeV2DesktopSessionProjection) => void;
    setupBridge(taskHostFixture({
      "app.getBootstrapState": async () => bootstrapState, "workspaces.list": async () => createWorkspaceRegistryFixture(a.meta.createdAt),
      "sessions.listPage": async () => ({ items: [a, b].map(record => ({ id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: 0, workspaceRoot: "/tmp/workspace" })), groups: [], indexing: false, failed: 0 }),
      "sessions.list": async () => [], getRecord: vi.fn(),
      "sessions.create": projectRecord(async () => a), "tasks.abort": async () => true, "approvals.submit": async () => ({ ok: true }), "sessions.pin": async () => ({ ok: true }),
      "usage.getStatistics": async () => null, "approvals.listPending": async () => [], ...settingsApiStub,
      "sessions.getPage": ({ sessionId }: { sessionId: string }) => sessionId === 'page-a' ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve(recordProjectionFixture(b)),
      "events.agentStream": () => () => {}, execute: vi.fn(),
    }));
    renderApp();
    await userEvent.click(await screen.findByText('Page B'));
    await screen.findByText('B visible question');
    await act(async () => resolveA(recordProjectionFixture(a)));
    expect(screen.getByText('B visible question')).toBeInTheDocument();
  });

  function setupBackgroundSessions() {
    const records = new Map(['background-a', 'background-b'].map(id => {
      const record = createEmptySessionRecord(id);
      record.meta.title = id === 'background-a' ? 'Background A' : 'Background B';
      return [id, record] as const;
    }));
    let emit!: (event: RuntimeStreamEvent) => void;
    const pending = new Map<string, { input: FixtureRunInput; resolve: (result: AgentRunResult) => void; reject: (error: Error) => void }>();
    const abort = vi.fn(async () => true);
    setupBridge(taskHostFixture({
      ...settingsApiStub,
      "app.getBootstrapState": async () => bootstrapState,
      "sessions.list": async () => [...records.values()].map(r => ({ id: r.meta.id, title: r.meta.title, updatedAt: r.meta.updatedAt, agentRunCount: r.meta.agentRunCount, workspaceRoot: "/tmp/workspace" })),
      getRecord: async ({ sessionId }: { sessionId: string }) => records.get(sessionId),
      "sessions.create": projectRecord(async () => createEmptySessionRecord('background-new')),
      "tasks.abort": abort, "approvals.listPending": async () => [],
      "events.agentStream": (callback: typeof emit) => { emit = callback; return () => {}; },
      execute: (input: FixtureRunInput) => new Promise<AgentRunResult>((resolve, reject) => {
        pending.set(input.sessionId, { input, resolve, reject });
        emit({ type: 'agent_run_started', sessionId: input.sessionId, agentRunId: input.agentRunId });
      }),
    }));
    const send = async (text: string) => {
      await userEvent.type(await screen.findByLabelText('消息输入框'), text);
      await userEvent.click(screen.getByLabelText('发送消息'));
    };
    const select = async (id: string) => {
      const row = document.querySelector(`[data-session-id="${id}"]`)!;
      await userEvent.click(within(row as HTMLElement).getByRole('button', { name: id === 'background-a' ? 'Background A' : 'Background B' }));
    };
    const event = (id: string, value: Record<string, unknown>) => {
      emit({ sessionId: id, agentRunId: pending.get(id)!.input.agentRunId, ...value } as RuntimeStreamEvent);
    };
    const complete = (id: string) => {
      const { input, resolve } = pending.get(id)!;
      const record = records.get(id)!;
      const events: SessionEvent[] = [
        { id: 'v2-1', sessionId: id, agentRunId: input.agentRunId, type: 'user_message', timestamp: record.meta.createdAt, schemaVersion: 2, payload: { content: input.userInput } },
        { id: 'v2-2', sessionId: id, agentRunId: input.agentRunId, type: 'assistant_message', timestamp: record.meta.createdAt, schemaVersion: 2, payload: { content: `${id} finished` } },
      ];
      records.set(id, { ...record, events, messageBlocks: createMessageBlocks(events) });
      event(id, { type: 'agent_run_finished' });
      resolve({ sessionId: id, agentRunId: input.agentRunId, status: 'completed', events, contextSnapshot: null });
    };
    return { records, pending, send, select, event, complete, abort };
  }

  it('keeps background runs and tool state alive across session switches', async () => {
    const fixture = setupBackgroundSessions();
    renderApp();
    await fixture.send('A running question');
    await act(async () => fixture.event('background-a', { type: 'assistant_text_delta', delta: 'A partial reply' }));
    await fixture.select('background-b');
    expect(screen.queryByText('A partial reply')).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-session-id="background-a"]') as HTMLElement).getByLabelText('会话状态： 运行中')).toBeInTheDocument();
    await act(async () => fixture.event('background-a', { type: 'assistant_text_delta', delta: ' continued in background' }));
    await fixture.send('B running question');
    await fixture.select('background-a');
    expect(await screen.findByText('A partial reply continued in background')).toBeInTheDocument();
    expect(screen.getAllByText('A running question')).toHaveLength(1);
    expect(screen.queryByText('B running question')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('停止 Agent'));
    expect(fixture.abort).toHaveBeenCalledWith({ sessionId: 'background-a', agentRunId: fixture.pending.get('background-a')!.input.agentRunId });
    await fixture.select('background-b');
    expect(screen.getByLabelText('停止 Agent')).toBeEnabled();
    await act(async () => fixture.complete('background-a'));
    expect(screen.getByLabelText('停止 Agent')).toBeEnabled();
    expect(screen.queryByText('background-a finished')).not.toBeInTheDocument();
    await fixture.select('background-a');
    expect(await screen.findByText('background-a finished')).toBeInTheDocument();
    expect(screen.queryByLabelText('停止 Agent')).not.toBeInTheDocument();
  });

  it('retains completed tools and subagent activity when returning to a running session', async () => {
    const fixture = setupBackgroundSessions();
    renderApp();
    await fixture.send('Inspect background tools');
    const read = { kind: 'read', filePath: '/tmp/background.txt', displayText: 'Read background.txt', resultPreview: 'read result' };
    await act(async () => fixture.event('background-a', { type: 'tool_started', toolCallId: 'read-a', toolName: 'read_file', preview: read }));
    await fixture.select('background-b');
    await act(async () => {
      fixture.event('background-a', { type: 'tool_finished', toolCallId: 'read-a', toolName: 'read_file', status: 'completed', preview: read });
      fixture.event('background-a', { type: 'tool_call_streaming', toolCallId: 'read-a', toolName: 'read_file', preview: { ...read, displayText: 'stale tool progress' } });
      fixture.event('background-a', {
        type: 'subagent_event', toolCallId: 'child-a',
        preview: { kind: 'agent', description: 'Background child', status: 'running', agentKind: 'agent', subagentType: 'general', displayText: '正在读取 · background files' },
        event: { id: 'child-event', sessionId: 'child-session', agentRunId: 'child-run', type: 'assistant_message', schemaVersion: 2, timestamp: new Date().toISOString(), payload: { content: 'Child progress' } },
      });
    });
    // A history response may already include the in-flight turn. It must not duplicate its live overlay.
    const record = fixture.records.get('background-a')!;
    const runId = fixture.pending.get('background-a')!.input.agentRunId;
    record.events = [
      { id: 'v2-1', sessionId: record.meta.id, agentRunId: runId, type: 'user_message', schemaVersion: 2, timestamp: record.meta.createdAt, payload: { content: 'Inspect background tools' } },
      { id: 'v2-2', sessionId: record.meta.id, agentRunId: runId, type: 'tool_result', schemaVersion: 2, timestamp: record.meta.createdAt, payload: { toolCallId: 'read-a', uiPreview: read, ok: true } },
    ];
    record.messageBlocks = createMessageBlocks(record.events);
    await fixture.select('background-a');
    expect(screen.getAllByText('Inspect background tools')).toHaveLength(1);
    expect(screen.getByText('正在读取 · background files')).toBeInTheDocument();
    expect(screen.queryByText('stale tool progress')).not.toBeInTheDocument();
    expect(screen.getByLabelText('停止 Agent')).toBeInTheDocument();
    expect(document.querySelectorAll('.tool-log-line.is-running')).toHaveLength(0);
    expect(screen.getAllByText('/tmp/background.txt')).toHaveLength(1);
  });

  it('keeps background Bash updates after the run settles and isolates equal task IDs', async () => {
    const fixture = setupBackgroundSessions();
    renderApp();
    await fixture.send('Launch background Bash');
    await fixture.select('background-b');
    await act(async () => fixture.complete('background-a'));
    for (const id of ['background-a', 'background-b']) {
      const record = fixture.records.get(id)!;
      const base = { sessionId: id, agentRunId: `run-${id}`, schemaVersion: 2 as const, timestamp: record.meta.createdAt };
      record.events = [
        { ...base, id: `user-${id}`, type: 'user_message', payload: { content: 'Launch background Bash' } },
        { ...base, id: `call-${id}`, type: 'tool_call', payload: { toolCallId: `bash-${id}`, name: 'bash', args: { command: 'sleep 1' } } },
        { ...base, id: `result-${id}`, type: 'tool_result', payload: { toolCallId: `bash-${id}`, toolName: 'bash', ok: true, detail: [{ label: 'background-task', value: { taskId: 'task-shared', status: 'running' } }] } },
      ] as SessionEvent[];
    }
    await act(async () => fixture.event('background-a', { type: 'bash_task_update', taskId: 'task-shared', status: 'completed', exitCode: 0 }));
    await fixture.select('background-a');
    await userEvent.click(screen.getByRole('button', { name: /^Worked/ }));
    expect(await screen.findByText('后台完成')).toBeInTheDocument();
    await fixture.select('background-b');
    await userEvent.click(screen.getByRole('button', { name: /^Worked/ }));
    expect(await screen.findByText('后台运行中')).toBeInTheDocument();
    expect(screen.queryByText('后台完成')).not.toBeInTheDocument();
  });

  it('marks a background run that finished as unread until the session is opened', async () => {
    const fixture = setupBackgroundSessions();
    renderApp();
    await fixture.send('Finish in the background');
    await fixture.select('background-b');
    await act(async () => fixture.complete('background-a'));
    const row = () => document.querySelector('[data-session-id="background-a"]') as HTMLElement;
    expect(within(row()).getByLabelText('会话状态： 已完成')).toBeInTheDocument();
    await fixture.select('background-a');
    expect(within(row()).queryByLabelText('会话状态： 已完成')).not.toBeInTheDocument();
  });

  it('keeps an accepted background failure separate from another running composer', async () => {
    const fixture = setupBackgroundSessions();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp();
    await fixture.send('A failed input');
    await fixture.select('background-b');
    await fixture.send('B must continue');
    await act(async () => fixture.pending.get('background-a')!.reject(new Error('Background preparation failed')));
    expect(screen.getByLabelText('停止 Agent')).toBeInTheDocument();
    expect(screen.queryByText('Background preparation failed')).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-session-id="background-a"]') as HTMLElement).getByLabelText('会话状态： 失败')).toBeInTheDocument();
    await fixture.select('background-a');
    expect(screen.getByLabelText('消息输入框')).toHaveValue('');
    expect(screen.queryByText('提交结果尚未确认，正文和附件已保留；重试将核对同一次提交。')).not.toBeInTheDocument();
    errorLog.mockRestore();
  });

  it('does not let a delayed stop response change another session stop state', async () => {
    const fixture = setupBackgroundSessions();
    let resolveAbort!: (value: boolean) => void;
    fixture.abort.mockImplementation(() => new Promise(resolve => { resolveAbort = resolve; }));
    renderApp();
    await fixture.send('A stop request');
    await userEvent.click(screen.getByLabelText('停止 Agent'));
    await fixture.select('background-b');
    await fixture.send('B stop request');
    await act(async () => resolveAbort(false));
    expect(screen.getByLabelText('停止 Agent')).toHaveAttribute('aria-disabled', 'false');
    await fixture.select('background-a');
    expect(screen.getByLabelText('停止 Agent')).toHaveAttribute('aria-disabled', 'false');
  });

  it('rejects a stale history page after a background run completes', async () => {
    // 陈旧页是 run 完成前发出的读取，修订号更旧：store 的 applyEnvelope 按修订拒绝它（14 T10），App 的页版本号是第二道防线。
    const fixture = setupBackgroundSessions();
    renderApp();
    await fixture.send('A durable question');
    await fixture.select('background-b');
    let resolveStale!: (record: SessionRecord) => void;
    const stale = { ...fixture.records.get('background-a')!, events: [] };
    let delayNext = true;
    overrideBridge({ "sessions.getPage": projectRecord(vi.fn(async (input: { sessionId: string }) => {
      if (input.sessionId === 'background-a' && delayNext) {
        delayNext = false;
        return new Promise<SessionRecord>(resolve => { resolveStale = resolve; });
      }
      return fixture.records.get(input.sessionId);
    })) });
    await fixture.select('background-a');
    expect(screen.getByText('A durable question')).toBeInTheDocument();
    await act(async () => fixture.complete('background-a'));
    expect(await screen.findByText('background-a finished')).toBeInTheDocument();
    await act(async () => resolveStale(stale));
    expect(screen.getByText('background-a finished')).toBeInTheDocument();
    expect(screen.getAllByText('A durable question')).toHaveLength(1);
    expect(screen.queryByLabelText('停止 Agent')).not.toBeInTheDocument();
  });

  it('keeps a background approval newer than an in-flight approval query', async () => {
    const fixture = setupBackgroundSessions();
    renderApp();
    await fixture.send('A requires approval');
    await fixture.select('background-b');
    let resolveApproval!: (items: []) => void;
    overrideBridge({ "approvals.listPending": vi.fn(() => new Promise<[]>(resolve => { resolveApproval = resolve; })) });
    await fixture.select('background-a');
    await act(async () => {
      fixture.event('background-a', { type: 'tool_started', toolCallId: 'approval-tool', toolName: 'browser_tabs' });
      fixture.event('background-a', { type: 'tool_approval_required', toolCallId: 'approval-tool', toolName: 'browser_tabs', requestId: 'approval-a', summary: 'Approval required', reason: 'Browser session', approvalScope: 'browser_session' });
      resolveApproval([]);
    });
    expect(within(document.querySelector('[data-session-id="background-a"]') as HTMLElement).getByLabelText('会话状态： 等待审批')).toBeInTheDocument();
    expect(screen.getByText('确认浏览器操作')).toBeInTheDocument();
  });

  it('keeps a running session resident while more than five other histories are viewed', async () => {
    // 保留策略（14 T9）：运行中的会话不占 5 个名额；查看 6 个别的会话后再回到它，即使页请求一直不返回，历史和流式内容都还在。
    const fixture = setupBackgroundSessions();
    const others = ['c', 'd', 'e', 'f', 'g', 'h'];
    for (const id of others) fixture.records.set(id, { ...createEmptySessionRecord(id), meta: { ...createEmptySessionRecord(id).meta, title: `Cache ${id}` } });
    const pinned = fixture.records.get('background-a')!;
    fixture.records.set('background-a', { ...pinned, events: [{ id: 'v2-0', sessionId: 'background-a', agentRunId: 'earlier-run', schemaVersion: 2, timestamp: pinned.meta.createdAt, type: 'user_message', payload: { content: 'Durable earlier question' } }] });
    renderApp();
    await screen.findByText('Durable earlier question');
    await fixture.send('Pinned live question');
    await act(async () => fixture.event('background-a', { type: 'assistant_text_delta', delta: 'Pinned reply' }));
    // 8 个会话在同一个工作区，每组先显示 5 个，其余点「展开其余」露出来。
    await userEvent.click(screen.getByRole('button', { name: /^展开其余/ }));
    for (const id of others) await userEvent.click(screen.getByRole('button', { name: `Cache ${id}` }));
    overrideBridge({ "sessions.getPage": () => new Promise(() => {}) });
    await fixture.select('background-a');
    expect(screen.getByText('Durable earlier question')).toBeInTheDocument();
    expect(screen.getByText('Pinned live question')).toBeInTheDocument();
    expect(screen.getByText('Pinned reply')).toBeInTheDocument();
    expect(screen.getByLabelText('停止 Agent')).toBeInTheDocument();
  });

});
