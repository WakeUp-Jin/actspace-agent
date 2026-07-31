import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings, BootstrapState, CompactContextInput, GenerateEvalCandidateInput, ReviewGetSnapshotResult, RunTurnInput, RuntimeStreamEvent, SessionEvent, SessionListItem, SessionRecord, WorkspaceListResult } from "@actspace/shared";
import { createMessageBlocks } from "@actspace/shared";
import { App } from "../App";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { TooltipProvider } from "../components/ui/Tooltip";

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
  kairos: { modelId: null, thinking: "auto", enabledSkills: [] },
  plugins: { repoRoot: null, fsWatch: { enabled: false } },
  skills: { disabled: [] },
};

/** window.actspace 的设置相关方法默认 stub，供各用例 spread 进 mock。 */
const settingsApiStub = {
  getSettings: async () => defaultSettings,
  readAgentSystemPrompt: async () => ({ path: defaultSettings.agent.systemPromptPath, content: "" }),
  writeAgentSystemPrompt: async (input: { content: string }) => ({
    path: defaultSettings.agent.systemPromptPath,
    content: input.content,
  }),
  updateSettings: async () => defaultSettings,
  setProviderKey: async () => ({ ok: true }),
  clearProviderKey: async () => ({ ok: true }),
  testProviderConnection: async () => ({ ok: true, message: "连接成功" }),
  visualizeReply: async () => ({ html: "<!doctype html><html></html>", sourceHash: "stub", cached: false }),
  listVisualizations: async () => ({ items: [] }),
  describeContext: async () => null,
  getReviewSnapshot: async () => createReviewChanges(0, 0),
  initGitRepository: async () => ({
    ok: true,
    alreadyRepository: true,
    workspaceRoot: "/tmp/workspace",
  }),
  compactContext: async (input: CompactContextInput) => ({
    sessionId: input.sessionId,
    turnId: input.turnId,
    status: "skipped" as const,
    events: [],
    contextSnapshot: {
      totalTokens: 0,
      maxTokens: 200_000,
      percentUsed: 0,
      buckets: [],
    },
    contextState: null,
  }),
  listWorkspaceDir: async () => ({ root: "/tmp/workspace", relativePath: "", entries: [] }),
  readWorkspaceFile: async () => ({ relativePath: "", renderKind: "text" as const, size: 0, mtimeMs: 0, content: "" }),
  archiveSession: async () => ({ ok: true }),
  archiveSessions: async (input: { sessionIds: string[] }) => ({
    ok: true,
    archivedSessionIds: input.sessionIds,
    failedSessionIds: [],
  }),
  setUiZoom: () => {},
  setNativeTheme: () => {},
  onShuttingDown: () => () => {},
};

function createWorkspaceRegistryFixture(createdAt: string, updatedAt = createdAt): WorkspaceListResult {
  return {
    version: 1,
    defaultWorkspaceId: "default",
    items: [
      {
        id: "default",
        kind: "default",
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
      id: sessionId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      turnCount: 0,
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

  afterEach(() => {
    delete (window as unknown as { actspace?: unknown }).actspace;

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
      { id: active.meta.id, title: active.meta.title, updatedAt: now, turnCount: 1, workspaceId: "ws_source", workspaceRoot: "/tmp/workspace" },
      { id: "session-pinned", title: "Pinned workspace session", updatedAt: now, turnCount: 1, workspaceId: "ws_source", workspaceRoot: "/tmp/workspace", pinned: true },
      { id: fallback.meta.id, title: fallback.meta.title, updatedAt: now, turnCount: 1, workspaceId: "ws_alt", workspaceRoot: "/tmp/alt-workspace" },
    ];
    const archiveSessions = vi.fn(async (input: { sessionIds: string[] }) => ({
      ok: true,
      archivedSessionIds: input.sessionIds,
      failedSessionIds: [],
    }));
    const records = new Map([[active.meta.id, active], [fallback.meta.id, fallback]]);

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(now),
      listSessions: async () => sessions,
      getSession: async ({ sessionId }) => records.get(sessionId) ?? null,
      createSession: async () => active,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({ provider: "deepseek", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      getKimiBalance: async () => ({ provider: "kimi", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      archiveSessions,
      onAgentStream: () => () => {},
      runTurn: async () => ({ sessionId: active.meta.id, turnId: "unused", status: "completed", events: [], contextSnapshot: null, contextState: null }),
    };

    renderApp();
    await screen.findByRole("button", { name: "Show session details for Active workspace session" });
    await user.click(screen.getByRole("button", { name: "workspace" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive All" }));

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
      { id: active.meta.id, title: active.meta.title, updatedAt: now, turnCount: 1, workspaceId: "ws_source", workspaceRoot: "/tmp/workspace" },
      { id: fallback.meta.id, title: fallback.meta.title, updatedAt: now, turnCount: 1, workspaceId: "ws_alt", workspaceRoot: "/tmp/alt-workspace" },
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

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => registry,
      listSessions: async () => sessions,
      getSession: async ({ sessionId }) => records.get(sessionId) ?? null,
      createSession: async () => active,
      setWorkspaceVisibility,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({ provider: "deepseek", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      getKimiBalance: async () => ({ provider: "kimi", isConfigured: false, isAvailable: null, generatedAt: now, displayBalance: null }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: () => () => {},
      runTurn: async () => ({ sessionId: active.meta.id, turnId: "unused", status: "completed", events: [], contextSnapshot: null, contextState: null }),
    };

    renderApp();
    await screen.findByRole("button", { name: "Show session details for Hidden active session" });
    await user.click(screen.getByRole("button", { name: "workspace" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from Sidebar" }));

    await waitFor(() => {
      expect(setWorkspaceVisibility).toHaveBeenCalledWith({ workspaceId: "ws_source", hidden: true });
      expect(screen.queryByText("Hidden active session")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Show session details for Visible fallback session" })).toBeInTheDocument();
    });
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
        turnCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    let reviewAdditions = 7;
    let reviewDeletions = 2;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;
    const getReviewSnapshot = vi.fn(async () => createReviewChanges(reviewAdditions, reviewDeletions));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      getReviewSnapshot,
      onAgentStream: () => () => {},
      runTurn: () =>
        new Promise((resolve) => {
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    expect(await screen.findByRole("button", { name: "Review pending changes +7 -2" })).toHaveTextContent("Review+7-2");
    await waitFor(() => {
      expect(getReviewSnapshot).toHaveBeenCalledWith({
        workspaceRoot: "/tmp/workspace",
        sessionId,
        selection: { kind: "uncommitted" },
      });
    });

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "update files");
    await userEvent.click(screen.getByLabelText("Send message"));

    reviewAdditions = 10;
    reviewDeletions = 1;
    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-review-summary-finished",
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

    expect(await screen.findByRole("button", { name: "Review pending changes +10 -1" })).toHaveTextContent("Review+10-1");
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
        turnCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const getSessionPreview = vi.fn(async () => ({
      sessionId,
      workspaceRoot: "/tmp/workspace",
      modelId: "deepseek-v4-pro" as const,
      contextSnapshot: {
        totalTokens: 42_000,
        maxTokens: 100_000,
        percentUsed: 42,
        buckets: [],
      },
    }));

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      getSessionPreview,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: () => () => {},
      runTurn: async () => ({
        sessionId,
        turnId: "turn-unused",
        status: "completed",
        events: [],
        contextSnapshot: null,
        contextState: null,
      }),
    };

    renderApp();

    const titleTrigger = await screen.findByRole("button", { name: "Show session details for Hover preview" });
    await user.hover(titleTrigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(getSessionPreview).toHaveBeenCalledWith({ sessionId });
    expect(tooltip).toHaveTextContent(`sessionId: ${sessionId}`);
    expect(tooltip).toHaveTextContent("/tmp/workspace");
    expect(tooltip).toHaveTextContent("DeepSeek V4 Pro");
    expect(tooltip).toHaveTextContent("42,000 / 100,000");
  });

  it("scrolls to the latest message when the user sends a new message", async () => {
    const sessionId = "session-scroll";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];

    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });

    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: () => () => {},
      runTurn: () =>
        new Promise((resolve) => {
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "scroll me");
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-scroll-finished",
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
        turnCount: 0,
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "show me immediately");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("show me immediately")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("show me immediately")).toBeTruthy();
    });

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-finished",
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

  it("shows the shared running shimmer while waiting for model activity", async () => {
    const sessionId = "session-model-wait";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Model wait",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let activeTurnId = "";
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) => new Promise((resolve) => {
        activeTurnId = input.turnId;
        streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
        resolveRunTurn = resolve;
      }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "wait for the model");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(screen.queryByText("Operating Space · Expanding")).toBeNull();

    const initialWaitingText = await screen.findByText("Operating Space · Expanding");
    expect(initialWaitingText).toHaveClass("tool-log-text-running");
    expect(initialWaitingText).toHaveAttribute("data-shimmer-text", "Operating Space · Expanding");

    await act(async () => {
      streamHandler?.({
        type: "tool_started",
        sessionId,
        turnId: activeTurnId,
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

    await act(async () => {
      streamHandler?.({
        type: "tool_finished",
        sessionId,
        turnId: activeTurnId,
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
        sessionId,
        turnId: activeTurnId,
        messageId: "evt-wait-answer",
        delta: "Model response",
      });
    });

    expect(await screen.findByText("Model response")).toBeInTheDocument();
    expect(screen.queryByText("Operating Space · Expanding")).toBeNull();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: activeTurnId,
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
        turnCount: 0,
      },
      {
        id: betaSessionId,
        title: betaRecord.meta.title,
        updatedAt: "2026-07-17T07:09:00.000Z",
        turnCount: 0,
      },
    ];
    const streamListeners = new Set<(event: RuntimeStreamEvent) => void>();
    const turnIds = new Map<string, string>();
    const resolveTurns = new Map<string, () => void>();
    const emit = (event: RuntimeStreamEvent) => {
      for (const listener of streamListeners) listener(event);
    };

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async ({ sessionId }) => records[sessionId] ?? null,
      createSession: async () => alphaRecord,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamListeners.add(callback);
        return () => {
          streamListeners.delete(callback);
        };
      },
      runTurn: (input: RunTurnInput) => new Promise((resolve) => {
        turnIds.set(input.sessionId, input.turnId);
        emit({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
        if (input.sessionId === betaSessionId) {
          emit({
            type: "assistant_text_delta",
            sessionId: input.sessionId,
            turnId: input.turnId,
            messageId: "evt-beta-text",
            delta: "beta streamed once",
          });
        }
        resolveTurns.set(input.sessionId, () => resolve({
          sessionId: input.sessionId,
          turnId: input.turnId,
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
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "alpha prompt");
    await userEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => {
      expect(turnIds.has(alphaSessionId)).toBe(true);
      expect(streamListeners.size).toBe(1);
    });

    const betaTitle = await screen.findByText("Beta chat");
    await userEvent.click(betaTitle.closest("button") as HTMLButtonElement);

    const betaComposer = await screen.findByLabelText("Message composer");
    await userEvent.type(betaComposer, "beta prompt");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("beta streamed once")).toBeInTheDocument();
    expect(screen.queryByText("beta streamed oncebeta streamed once")).toBeNull();
    expect(streamListeners.size).toBe(1);

    const alphaTurnId = turnIds.get(alphaSessionId)!;
    await act(async () => {
      emit({
        type: "assistant_text_delta",
        sessionId: alphaSessionId,
        turnId: alphaTurnId,
        messageId: "evt-stale-alpha",
        delta: "stale alpha text",
      });
    });
    expect(screen.queryByText("stale alpha text")).toBeNull();

    await act(async () => {
      resolveTurns.get(alphaSessionId)?.();
    });
    expect(await screen.findByText("beta streamed once")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop agent")).toBeInTheDocument();

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
        turnCount: 0,
      },
    ];
    let currentRecord = record;
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;
    let resolveFinalSessionList: ((value: SessionListItem[]) => void) | null = null;
    let listSessionsCallCount = 0;
    const getSession = vi.fn(async () => currentRecord);

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: () => {
        listSessionsCallCount += 1;
        if (listSessionsCallCount === 1) return Promise.resolve(sessions);
        return new Promise((resolve) => {
          resolveFinalSessionList = resolve;
        });
      },
      getSession,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) streamHandler = null;
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "assistant_text_delta",
            sessionId,
            turnId: input.turnId,
            messageId: "evt-stream-delta",
            delta: "handoff reply",
          });
          const timestamp = new Date().toISOString();
          const events: SessionEvent[] = [
            {
              id: "evt-handoff-user",
              sessionId,
              turnId: input.turnId,
              type: "user_message",
              timestamp,
              schemaVersion: 1,
              payload: { content: "handoff prompt" },
            },
            {
              id: "evt-handoff-assistant",
              sessionId,
              turnId: input.turnId,
              type: "assistant_message",
              timestamp,
              schemaVersion: 1,
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
            meta: { ...record.meta, updatedAt: timestamp, turnCount: 1 },
            events,
            messageBlocks: createMessageBlocks(events),
          };
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "handoff prompt");
    await userEvent.click(screen.getByLabelText("Send message"));

    const streamingUserNode = (await screen.findByText("handoff prompt")).closest(".message-turn");
    const streamingAssistantNode = (await screen.findByText("handoff reply")).closest(".assistant-reply");
    expect(streamingUserNode).not.toBeNull();
    expect(streamingAssistantNode).not.toBeNull();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: currentRecord.events[0].turnId,
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
      expect(getSession).toHaveBeenCalledTimes(2);
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
    const runTurn = vi.fn(async (input: RunTurnInput) => ({
      sessionId: input.sessionId,
      turnId: input.turnId,
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

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => [],
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: () => () => {},
      runTurn,
    };

    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: /DeepSeek V4 Pro/i }));
    await userEvent.click(screen.getByRole("button", { name: "DeepSeek V4 Flash" }));

    let composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "start with flash");
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(runTurn).toHaveBeenCalledTimes(1);
    });

    composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "continue with flash");
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(runTurn).toHaveBeenCalledTimes(2);
    });
    expect(runTurn.mock.calls.map(([input]) => input.model)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-flash",
    ]);
  });

  it("routes /compact to compactContext without creating a normal run turn", async () => {
    const sessionId = "session-compact";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    const runTurn = vi.fn();
    let resolveCompactContext: (() => void) | null = null;
    const compactContext = vi.fn((input: CompactContextInput) => new Promise<Awaited<ReturnType<NonNullable<typeof window.actspace>["compactContext"]>>>((resolve) => {
      streamHandler?.({
        type: "context_compaction_started",
        sessionId: input.sessionId,
        turnId: input.turnId,
        trigger: "manual",
        stage: "preparing",
      });
      streamHandler?.({
        type: "context_compaction_finished",
        sessionId: input.sessionId,
        turnId: input.turnId,
        trigger: "manual",
        stage: "completed",
        status: "compacted",
        payload: {
          triggerTokens: 20,
          thresholdTokens: 1000,
          beforeCount: 6,
          afterCount: 1,
          summaryChars: 240,
          historyRefPath: "/tmp/session.jsonl",
          trigger: "manual",
          status: "compacted",
          removedCount: 5,
        },
      });
      resolveCompactContext = () => resolve({
        sessionId: input.sessionId,
        turnId: input.turnId,
        status: "compacted" as const,
        events: [],
        contextSnapshot: {
          totalTokens: 20,
          maxTokens: 200_000,
          percentUsed: 0,
          buckets: [],
        },
        contextState: null,
      });
    }));

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      compactContext,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn,
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "/compact");
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(compactContext).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("separator", { name: "Context compacted · 5 messages" })).toBeInTheDocument();
    expect(runTurn).not.toHaveBeenCalled();

    await act(async () => {
      resolveCompactContext?.();
    });
  });

  it("routes /eval to candidate generation without creating a normal run turn", async () => {
    const sessionId = "session-eval";
    const record = createEmptySessionRecord(sessionId);
    record.events.push({
      id: "evt-user",
      sessionId,
      turnId: "turn-user",
      type: "user_message",
      timestamp: record.meta.createdAt,
      schemaVersion: 1,
      payload: { content: "Fix login and add tests" },
    });
    const sessions: SessionListItem[] = [{
      id: sessionId,
      title: "Eval session",
      updatedAt: record.meta.updatedAt,
      turnCount: 1,
    }];
    const runTurn = vi.fn();
    const generateEvalCandidate = vi.fn(async (input: GenerateEvalCandidateInput) => {
      const event: SessionEvent = {
        id: "evt-eval",
        sessionId,
        turnId: input.turnId,
        type: "eval_candidate",
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          candidateId: "failure-1",
          relativePath: "eval-candidates/failure-1",
          status: "generated",
          summary: "Eval candidate generated · /tmp/actspace/eval-candidates/failure-1",
        },
      };
      record.events.push(event);
      return {
        sessionId,
        turnId: input.turnId,
        targetTurnId: "turn-user",
        status: "generated" as const,
        candidateId: "failure-1",
        candidatePath: "/tmp/actspace/eval-candidates/failure-1",
        events: [event],
      };
    });

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      generateEvalCandidate,
      onAgentStream: () => () => {},
      runTurn,
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "/eval Agent did not add tests");
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(generateEvalCandidate).toHaveBeenCalledTimes(1);
    });
    expect(generateEvalCandidate.mock.calls[0][0]).toMatchObject({
      sessionId,
      reason: "Agent did not add tests",
    });
    expect(await screen.findByText("Eval candidate generated · /tmp/actspace/eval-candidates/failure-1")).toBeInTheDocument();
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("renders read tool arguments as soon as tool_started arrives", async () => {
    const sessionId = "session-test";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "tool_started",
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolCallId: "tool-read-1",
            toolName: "read_file",
            argsPreview: "{\"path\":\"src/main.ts\"}",
            preview: {
              kind: "read",
              filePath: "src/main.ts",
              displayText: "Read src/main.ts",
            },
          });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "read that file");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("Read src/main.ts")).toBeTruthy();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-read-finished",
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

  it("finishes multiple write tools independently as each tool_finished event arrives", async () => {
    const sessionId = "session-write-status";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "Write status",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let activeTurnId = "";
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          activeTurnId = input.turnId;
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          for (const [index, filePath] of ["first.ts", "second.ts", "third.ts"].entries()) {
            streamHandler?.({
              type: "tool_started",
              sessionId: input.sessionId,
              turnId: input.turnId,
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
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "write three files");
    await userEvent.click(screen.getByLabelText("Send message"));

    for (const filePath of ["first.ts", "second.ts", "third.ts"]) {
      const runningText = await screen.findByText(`Write ${filePath}`);
      expect(runningText.closest(".file-diff-block")).toHaveClass("is-streaming");
    }

    const finishWrite = async (index: number, filePath: string) => {
      await act(async () => {
        streamHandler?.({
          type: "tool_finished",
          sessionId,
          turnId: activeTurnId,
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
    expect(screen.getByText("Write second.ts").closest(".file-diff-block")).toHaveClass("is-streaming");
    expect(screen.getByText("Write third.ts").closest(".file-diff-block")).toHaveClass("is-streaming");

    await finishWrite(2, "second.ts");
    expect(screen.getByRole("button", { name: /Write second\.ts/ })).toBeInTheDocument();
    expect(screen.getByText("Write third.ts").closest(".file-diff-block")).toHaveClass("is-streaming");

    await finishWrite(3, "third.ts");
    expect(screen.getByRole("button", { name: /Write third\.ts/ })).toBeInTheDocument();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: activeTurnId,
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
        turnCount: 0,
      },
    ];
    const transcriptEvent: SessionEvent = {
      id: "evt-subagent-tool",
      sessionId,
      turnId: "turn-subagent:subagent:run-1",
      type: "tool_call",
      timestamp: "2026-06-03T10:00:00.000Z",
      payload: {
        id: "tool-read-app",
        name: "read_file",
        arguments: { path: "packages/desktop/src/renderer/App.tsx" },
      },
    };
    const getReviewSnapshot = vi.fn(async () => createReviewChanges(7, 2));

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      getSubAgentTranscript: async () => [],
      ...settingsApiStub,
      getReviewSnapshot,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "tool_call_streaming",
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolCallId: "tool-agent-1",
            toolName: "agent",
            isInitial: true,
            preview: {
              kind: "agent",
              description: "Explore renderer flow",
              status: "running",
              subagentType: "explore",
              displayText: "Explore renderer flow",
            },
          });
          streamHandler?.({
            type: "subagent_event",
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolCallId: "tool-agent-1",
            transcriptRef: {
              kind: "subagent_transcript",
              sessionId,
              turnId: input.turnId,
              runId: "run-1",
            },
            event: transcriptEvent,
            preview: {
              kind: "agent",
              description: "Explore renderer flow",
              status: "running",
              subagentType: "explore",
              displayText: "Explore renderer flow",
              transcriptRef: {
                kind: "subagent_transcript",
                sessionId,
                turnId: input.turnId,
                runId: "run-1",
              },
              recentEvents: [
                {
                  id: "evt-subagent-tool",
                  type: "tool_call",
                  title: "Read",
                  summary: "Read packages/desktop/src/renderer/App.tsx",
                  timestamp: "2026-06-03T10:00:00.000Z",
                },
              ],
            },
          });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "delegate exploration");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("Explore renderer flow")).toBeTruthy();
    expect(await screen.findByText("Read packages/desktop/src/renderer/App.tsx")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Review pending changes +7 -2" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Open SubAgent transcript for Explore renderer flow/ }));

    const panel = await screen.findByRole("region", { name: /SubAgent transcript: Explore renderer flow/ });
    expect(panel).toBeTruthy();
    expect(within(panel).getByText("Read App.tsx")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /SubAgent transcript: Explore renderer flow/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review pending changes +7 -2" })).not.toBeInTheDocument();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-subagent-finished",
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
        turnCount: 0,
      },
    ];
    const selectWorkspaceDirectory = vi.fn(async () => ({
      canceled: false,
      workspaceRoot: "/tmp/new-workspace",
    }));
    const createSession = vi.fn(async () => createdRecord);

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      selectWorkspaceDirectory,
      ...settingsApiStub,
      onAgentStream: () => () => {},
      runTurn: async () => ({
        sessionId,
        turnId: "turn-unused",
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
    };

    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: "Add workspace" }));

    await waitFor(() => {
      expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(1);
      expect(createSession).toHaveBeenCalledWith({
        title: "New chat",
        workspaceRoot: "/tmp/new-workspace",
      });
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
        turnCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
      {
        id: "session-other-workspace",
        title: "Other workspace",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
        workspaceRoot: "/tmp/alt-workspace",
      },
      {
        id: "session-default-workspace",
        title: "Default workspace chat",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];
    const callOrder: string[] = [];
    const setSessionWorkspace = vi.fn(async () => {
      callOrder.push("set-workspace");
      return { ok: true };
    });
    const runTurn = vi.fn(async () => {
      callOrder.push("run-turn");
      return {
        sessionId,
        turnId: "turn-workspace-switch",
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

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt, record.meta.updatedAt),
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      setSessionWorkspace,
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: () => () => {},
      runTurn,
    };

    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: "Select workspace" }));
    const workspaceMenu = await screen.findByRole("menu", { name: /options$/ });
    expect(within(workspaceMenu).getByRole("menuitem", { name: "Default workspace" })).toBeInTheDocument();
    await userEvent.click(within(workspaceMenu).getByRole("menuitem", { name: "alt-workspace" }));

    expect(setSessionWorkspace).not.toHaveBeenCalled();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "use the alternate workspace");
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(runTurn).toHaveBeenCalledTimes(1));
    expect(setSessionWorkspace).not.toHaveBeenCalled();
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      executionContext: {
        runLocation: "this_mac",
        workspaceId: "ws_alt",
        sourceWorkspaceRoot: "/tmp/alt-workspace",
      },
    }));
    expect(callOrder).toEqual(["run-turn"]);
  });

  it("sends attachments through RunTurnInput and keeps the attachment chip while running", async () => {
    const sessionId = "session-attachments";
    const record = createEmptySessionRecord(sessionId);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];
    const selectedAttachment = {
      id: "att-screenshot",
      kind: "image" as const,
      name: "screenshot.png",
      path: "/Users/test/screenshot.png",
      mimeType: "image/png",
      previewUrl: "file:///Users/test/screenshot.png",
    };

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let capturedInput: RunTurnInput | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      selectImages: async () => ({ canceled: false, attachments: [selectedAttachment] }),
      listUsableModels: async () => ({
        models: [{
          key: "deepseek:deepseek-v4-pro",
          label: "DeepSeek V4 Pro",
          provider: "deepseek",
          apiModel: "deepseek-v4-pro",
          contextWindow: 1_000_000,
          thinkingDefault: true,
          capabilities: {
            input: ["text", "image"],
            toolUse: "verified",
            reasoning: true,
            thinkingToggle: true,
          },
        }],
      }),
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          capturedInput = input;
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Image" }));
    expect(await screen.findByLabelText("Attached image screenshot.png")).toBeTruthy();

    await userEvent.type(composer, "what is in this screenshot?");
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(capturedInput?.attachments).toEqual([selectedAttachment]);
      expect(capturedInput?.mode).toBe("agent");
      expect(capturedInput?.selectedSkills).toEqual([]);
    });
    expect(await screen.findByLabelText("Attached image screenshot.png")).toBeTruthy();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-attachments-finished",
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
        turnCount: 0,
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "tool_started",
            sessionId: input.sessionId,
            turnId: input.turnId,
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
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "search the web");
    await userEvent.click(screen.getByLabelText("Send message"));

    const webSearchLine = await screen.findByText("Web Search 最新新闻 今天");
    expect(webSearchLine.closest(".tool-log-line")?.classList.contains("is-running")).toBe(true);
    expect(screen.queryByText("result answer body")).toBeNull();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-web-search-finished",
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
        turnCount: 0,
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "tool_started",
            sessionId: input.sessionId,
            turnId: input.turnId,
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
            sessionId: input.sessionId,
            turnId: input.turnId,
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
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "inspect files");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("Grep ToolUiPreview in *.ts")).toBeTruthy();
    expect(await screen.findByText("Glob src/**/*.ts in packages/agent-core")).toBeTruthy();
    expect(screen.queryByText("Searched files *.ts for ToolUiPreview")).toBeNull();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-grep-glob-finished",
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
        turnCount: 0,
      },
    ];

    let approvalPending = false;
    let activeTurnId = "";
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async (input) =>
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
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          activeTurnId = input.turnId;
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "tool_started",
            sessionId: input.sessionId,
            turnId: input.turnId,
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
            turnId: input.turnId,
            toolCallId: "tool-bash-approval",
            toolName: "bash",
            requestId: "approval-bash-1",
            summary: "Run install",
            reason: "Bash command requires approval",
            command: "pnpm install",
            executionEnvironment: "sandbox",
          });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "install deps");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByRole("button", { name: "Session status: Waiting approval" })).toBeTruthy();
    expect(screen.getByText("沙盒")).toBeInTheDocument();

    await act(async () => {
      approvalPending = false;
      streamHandler?.({
        type: "tool_approval_resolved",
        sessionId,
        turnId: activeTurnId,
        toolCallId: "tool-bash-approval",
        requestId: "approval-bash-1",
        decision: "approve_once",
      });
      streamHandler?.({
        type: "tool_finished",
        sessionId,
        turnId: activeTurnId,
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
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-approval-finished",
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
        turnCount: 0,
      },
    ];

    let approvalPending = false;
    let activeTurnId = "";
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;
    const submitApproval = vi.fn(async () => ({ ok: true }));

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval,
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async (input) =>
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
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          activeTurnId = input.turnId;
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "tool_call_streaming",
            sessionId: input.sessionId,
            turnId: input.turnId,
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
            turnId: input.turnId,
            toolCallId: "tool-delete-1",
            toolName: "delete_file",
            requestId: "approval-delete-1",
            summary: "Delete notes.md",
            reason: "delete_file is a destructive file operation and requires approval.",
            riskLevel: "high",
          });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "delete notes.md");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("Delete file requires approval")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-delete-1",
      decision: "approve_once",
    });
    expect(await screen.findByText("Delete notes.md")).toBeInTheDocument();

    await act(async () => {
      approvalPending = false;
      streamHandler?.({
        type: "tool_approval_resolved",
        sessionId,
        turnId: activeTurnId,
        toolCallId: "tool-delete-1",
        requestId: "approval-delete-1",
        decision: "approve_once",
      });
    });

    await act(async () => {
      streamHandler?.({
        type: "tool_finished",
        sessionId,
        turnId: activeTurnId,
        toolCallId: "tool-delete-1",
        toolName: "delete_file",
        resultEventId: "evt-delete-result",
        isError: false,
      });
    });

    expect(await screen.findByText("Deleted notes.md")).toBeInTheDocument();

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-delete-approval-finished",
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
        turnCount: 0,
      },
    ];

    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;
    const submitApproval = vi.fn(async () => ({ ok: true }));

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval,
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) streamHandler = null;
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          streamHandler?.({
            type: "tool_started",
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolCallId: "tool-browser-1",
            toolName: "browser_tabs",
            argsPreview: '{"action":"list"}',
          });
          streamHandler?.({
            type: "tool_approval_required",
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolCallId: "tool-browser-1",
            toolName: "browser_tabs",
            requestId: "approval-browser-1",
            summary: "允许当前会话使用浏览器",
            reason: "Browser tools require session authorization.",
            approvalScope: "browser_session",
          });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "看看浏览器标签页");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("允许 ActSpace 在当前会话中使用浏览器？")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "允许" }));

    expect(submitApproval).toHaveBeenCalledWith({
      requestId: "approval-browser-1",
      decision: "approve_once",
    });

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-browser-approval-finished",
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
        turnCount: 0,
      },
    ];

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        return () => {
          void callback;
        };
      },
      runTurn: async (input: RunTurnInput) => ({
        sessionId: input.sessionId,
        turnId: input.turnId,
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
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "fail this turn");
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByRole("button", { name: "Session status: Failed" })).toBeTruthy();
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

  it("switches the send button into a stop button and calls abortTurn while streaming", async () => {
    const sessionId = "session-abort";
    const record = createEmptySessionRecord(sessionId);
    let currentRecord = record;
    const getSessionMock = vi.fn(async () => currentRecord);
    const sessions: SessionListItem[] = [
      {
        id: sessionId,
        title: "New chat",
        updatedAt: record.meta.updatedAt,
        turnCount: 0,
      },
    ];

    const abortTurnMock = vi.fn(async () => true);
    let streamHandler: ((event: RuntimeStreamEvent) => void) | null = null;
    let resolveRunTurn: ((value: Awaited<ReturnType<NonNullable<typeof window.actspace>["runTurn"]>>) => void) | null =
      null;

    window.actspace = {
      getBootstrapState: async () => bootstrapState,
      listSessions: async () => sessions,
      getSession: getSessionMock,
      createSession: async () => record,
      abortTurn: abortTurnMock,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      getUsageStatistics: async () => null,
      getDeepSeekBalance: async () => ({
        provider: "deepseek",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      getKimiBalance: async () => ({
        provider: "kimi",
        isConfigured: false,
        isAvailable: null,
        generatedAt: new Date().toISOString(),
        displayBalance: null,
      }),
      listPendingApprovals: async () => [],
      ...settingsApiStub,
      onAgentStream: (callback) => {
        streamHandler = callback;
        return () => {
          if (streamHandler === callback) {
            streamHandler = null;
          }
        };
      },
      runTurn: (input: RunTurnInput) =>
        new Promise((resolve) => {
          streamHandler?.({ type: "turn_started", sessionId: input.sessionId, turnId: input.turnId });
          resolveRunTurn = resolve;
        }),
    };

    renderApp();

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "stop me");
    await userEvent.click(screen.getByLabelText("Send message"));

    const stopButton = await screen.findByLabelText("Stop agent");
    await userEvent.click(stopButton);

    await waitFor(() => {
      expect(abortTurnMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      const timestamp = new Date().toISOString();
      const events: SessionEvent[] = [
        {
          id: "evt-user-abort",
          sessionId,
          turnId: "turn-abort-finished",
          type: "user_message",
          timestamp,
          schemaVersion: 1,
          payload: { content: "stop me" },
        },
        {
          id: "evt-turn-aborted",
          sessionId,
          turnId: "turn-abort-finished",
          type: "turn_aborted",
          timestamp,
          schemaVersion: 1,
          payload: { reason: "user" },
        },
      ];
      currentRecord = {
        ...record,
        meta: { ...record.meta, updatedAt: timestamp, turnCount: 1 },
        events,
      };
      streamHandler?.({ type: "turn_aborted", sessionId, turnId: "turn-abort-finished" });
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-abort-finished",
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
    expect((screen.getByLabelText("Message composer") as HTMLTextAreaElement).disabled).toBe(false);
    expect(getSessionMock).toHaveBeenCalledTimes(2);
  });
});
