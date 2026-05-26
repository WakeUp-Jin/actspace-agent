import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BootstrapState, RunTurnInput, RuntimeStreamEvent, SessionListItem, SessionRecord } from "@actspace/shared";
import { App } from "../App";
import { ToolLogLine } from "../components/messages/ToolLogLine";

const bootstrapState: BootstrapState = {
  appVersion: "0.1.0",
  dataRoot: "/tmp/actspace",
  sessionRoot: "/tmp/actspace/sessions",
  logRoot: "/tmp/actspace/logs",
  tmpRoot: "/tmp/actspace/tmp",
  workspaceRoot: "/tmp/workspace",
};

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

describe("App streaming user message", () => {
  const originalScrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
  const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");

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
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      listPendingApprovals: async () => [],
      onAgentStream: () => () => {},
      runTurn: () =>
        new Promise((resolve) => {
          resolveRunTurn = resolve;
        }),
    };

    render(<App />);

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
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      listPendingApprovals: async () => [],
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

    render(<App />);

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
      listSessions: async () => sessions,
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: async () => true,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      listPendingApprovals: async () => [],
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

    render(<App />);

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
      listPendingApprovals: async () => [],
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

    render(<App />);

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
      listPendingApprovals: async () => [],
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

    render(<App />);

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
        }}
      />,
    );

    expect(screen.getByText("Grep ToolUiPreview in *.ts")).toBeTruthy();
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
      getSession: async () => record,
      createSession: async () => record,
      abortTurn: abortTurnMock,
      submitApproval: async () => ({ ok: true }),
      pinSession: async () => ({ ok: true }),
      listPendingApprovals: async () => [],
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

    render(<App />);

    const composer = await screen.findByLabelText("Message composer");
    await userEvent.type(composer, "stop me");
    await userEvent.click(screen.getByLabelText("Send message"));

    const stopButton = await screen.findByLabelText("Stop agent");
    await userEvent.click(stopButton);

    await waitFor(() => {
      expect(abortTurnMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveRunTurn?.({
        sessionId,
        turnId: "turn-abort-finished",
        status: "aborted",
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

    expect(await screen.findByText("stop me")).toBeTruthy();
    expect(await screen.findByText("Stopped")).toBeTruthy();
  });
});
