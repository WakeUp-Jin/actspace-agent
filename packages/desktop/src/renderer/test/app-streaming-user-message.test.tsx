import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BootstrapState, RunTurnInput, RuntimeStreamEvent, SessionListItem, SessionRecord } from "@actspace/shared";
import { App } from "../App";

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
