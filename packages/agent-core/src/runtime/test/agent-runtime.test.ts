import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTurnResult, RuntimeStreamEvent, SessionEvent } from "@actspace/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentDeps } from "../../engine/create-agent-deps";
import { createAgentHostRuntime } from "../agent-runtime";
import { AgentRuntimeError, type RuntimeTurnRequest } from "../types";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Agent Runtime", () => {
  it("runs ephemeral turns without product session writes and owns the terminal event", async () => {
    const root = await createTempRoot();
    const events: RuntimeStreamEvent[] = [];
    const harness = vi.fn(async (_input, _deps, options) => {
      options?.onStreamEvent?.({
        type: "assistant_text_delta",
        sessionId: "session-1",
        turnId: "turn-1",
        messageId: "message-1",
        delta: "ok",
      });
      expect(options?.includeUserEvent).toBe(true);
      expect(options?.emitTerminalEvent).toBe(false);
      expect(options?.emitTurnStartedEvent).toBe(false);
      return createResult("completed");
    });
    const runtime = createRuntime(root, events, { runHarness: harness });

    const result = await runtime.runTurn(createRequest(root, "ephemeral"));

    expect(result.status).toBe("completed");
    expect(harness).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual([
      "turn_started",
      "assistant_text_delta",
      "turn_finished",
    ]);
    await expect(readdir(join(root, "sessions"))).rejects.toThrow();
  });

  it("persists the user input before Harness execution and emits success only after commit", async () => {
    const root = await createTempRoot();
    const events: RuntimeStreamEvent[] = [];
    const sessionPath = join(root, "sessions", "session-1", "session.jsonl");
    const harness = vi.fn(async (_input, _deps, options) => {
      const beforeHarness = await readEvents(sessionPath);
      expect(beforeHarness.map((event) => event.type)).toEqual(["user_message"]);
      expect(options?.includeUserEvent).toBe(false);
      return createResult("completed");
    });
    const runtime = createRuntime(root, events, {
      runHarness: harness,
      eventSink: {
        emit: async (event) => {
          if (event.type === "turn_finished") {
            const committed = await readEvents(sessionPath);
            expect(committed.map((item) => item.type)).toEqual([
              "user_message",
              "assistant_message",
              "context_snapshot",
            ]);
          }
          events.push(event);
        },
      },
    });

    const result = await runtime.runTurn(createRequest(root, "persistent"));

    expect(result.events.map((event) => event.type)).toEqual([
      "user_message",
      "assistant_message",
      "context_snapshot",
    ]);
    expect(events.at(-1)?.type).toBe("turn_finished");
  });

  it("maps a failed Agent result to turn_failed instead of turn_finished", async () => {
    const root = await createTempRoot();
    const events: RuntimeStreamEvent[] = [];
    const runtime = createRuntime(root, events, {
      runHarness: async () => createResult("failed"),
    });

    const result = await runtime.runTurn(createRequest(root, "ephemeral"));

    expect(result.status).toBe("failed");
    expect(events.at(-1)).toMatchObject({
      type: "turn_failed",
      error: { code: "LLM_ERROR" },
    });
    expect(events.some((event) => event.type === "turn_finished")).toBe(false);
  });

  it("does not emit turn_finished when persistent commit fails", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "sessions"), { recursive: true });
    await writeFile(join(root, "sessions", "session-1"), "not a directory");
    const events: RuntimeStreamEvent[] = [];
    const dispose = vi.fn(async () => {});
    const runtime = createRuntime(root, events, { dispose });

    await expect(runtime.runTurn(createRequest(root, "persistent"))).rejects.toMatchObject({
      code: "PERSISTENCE_ERROR",
    });
    expect(events.at(-1)).toMatchObject({
      type: "turn_failed",
      error: { code: "PERSISTENCE_ERROR" },
    });
    expect(events.some((event) => event.type === "turn_finished")).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("rejects a concurrent turn for the same session but isolates Runtime instances", async () => {
    const root = await createTempRoot();
    const first = deferred<AgentTurnResult>();
    const runtime = createRuntime(root, [], { runHarness: () => first.promise });
    const otherRuntime = createRuntime(root, [], { runHarness: async () => createResult("completed") });

    const running = runtime.runTurn(createRequest(root, "ephemeral"));
    expect(runtime.isSessionActive("session-1")).toBe(true);
    await expect(runtime.runTurn({
      ...createRequest(root, "ephemeral"),
      turnId: "turn-2",
    })).rejects.toMatchObject({ code: "SESSION_ACTIVE" });
    await expect(otherRuntime.runTurn(createRequest(root, "ephemeral"))).resolves.toMatchObject({
      status: "completed",
    });

    first.resolve(createResult("completed"));
    await running;
    expect(runtime.isSessionActive("session-1")).toBe(false);
  });

  it("aborts the Harness and pending approvals, then waits during dispose", async () => {
    const root = await createTempRoot();
    const abortHarness = vi.fn();
    const approvalAbort = vi.fn();
    const result = deferred<AgentTurnResult>();
    const harnessStarted = deferred<void>();
    const runtime = createRuntime(root, [], {
      approvalAbort,
      runHarness: async (_input, deps) => {
        harnessStarted.resolve();
        deps.abort = () => {
          abortHarness();
          result.resolve(createResult("aborted"));
        };
        return result.promise;
      },
    });

    const running = runtime.runTurn(createRequest(root, "ephemeral"));
    await harnessStarted.promise;
    expect(runtime.abortTurn({ sessionId: "session-1", turnId: "turn-1" })).toBe(true);
    await expect(running).resolves.toMatchObject({ status: "aborted" });
    expect(abortHarness).toHaveBeenCalledOnce();
    expect(approvalAbort).toHaveBeenCalledWith("session-1", "turn-1");

    const second = deferred<AgentTurnResult>();
    const runtimeForDispose = createRuntime(root, [], {
      runHarness: async (_input, deps) => {
        deps.abort = () => second.resolve(createResult("aborted"));
        return second.promise;
      },
    });
    const secondRun = runtimeForDispose.runTurn(createRequest(root, "ephemeral"));
    await runtimeForDispose.dispose();
    await expect(secondRun).resolves.toMatchObject({ status: "aborted" });
    await expect(runtimeForDispose.runTurn(createRequest(root, "ephemeral"))).rejects.toMatchObject({
      code: "RUNTIME_DISPOSED",
    });
  });

  it("does not enter the Harness when abort arrives during Runtime initialization", async () => {
    const root = await createTempRoot();
    const contextReady = deferred<void>();
    const continueContext = deferred<void>();
    const harness = vi.fn(async () => createResult("completed"));
    const runtime = createAgentHostRuntime({
      contextProvider: {
        load: async () => {
          contextReady.resolve();
          await continueContext.promise;
          return { systemPrompt: "test" };
        },
      },
      modelResolver: { resolveConfig: async () => ({}) as any },
      eventSink: { emit: () => {} },
      createDependencies: async () => createDeps(async () => {}),
      runHarness: harness,
    });
    const running = runtime.runTurn(createRequest(root, "ephemeral"));
    await contextReady.promise;
    expect(runtime.abortTurn({ sessionId: "session-1", turnId: "turn-1" })).toBe(true);
    continueContext.resolve();

    await expect(running).resolves.toMatchObject({ status: "aborted" });
    expect(harness).not.toHaveBeenCalled();
  });

  it("records Event Sink failures without rerunning the Harness", async () => {
    const root = await createTempRoot();
    const diagnostics: string[] = [];
    const harness = vi.fn(async () => createResult("completed"));
    const runtime = createRuntime(root, [], {
      runHarness: harness,
      eventSink: { emit: () => { throw new Error("closed stream"); } },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });

    await expect(runtime.runTurn(createRequest(root, "ephemeral"))).resolves.toMatchObject({
      status: "completed",
    });
    expect(harness).toHaveBeenCalledOnce();
    expect(diagnostics).toContain("EVENT_SINK_FAILED");
  });

  it("rolls back prepared workspace metadata when dependency creation fails", async () => {
    const root = await createTempRoot();
    const rollback = vi.fn(async () => {});
    const runtime = createRuntime(root, [], {
      workspaceExecutionProvider: {
        prepare: async () => ({
          workspaceRoot: join(root, "worktree"),
          workspaceId: "workspace-1",
          worktree: {
            sourceWorkspaceRoot: join(root, "workspace"),
            worktreeRoot: join(root, "worktree"),
            branch: "actspace/test",
            baseBranch: "main",
            baseCommit: "abc123",
          },
          rollback,
        }),
      },
      createDependencies: async () => {
        throw new Error("model unavailable");
      },
    });

    await expect(runtime.runTurn({
      ...createRequest(root, "persistent"),
      executionContext: {
        runLocation: "worktree",
        sourceWorkspaceRoot: join(root, "workspace"),
        branch: "main",
      },
    })).rejects.toBeInstanceOf(AgentRuntimeError);
    expect(rollback).toHaveBeenCalledOnce();
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-runtime-test-"));
  tempRoots.push(root);
  return root;
}

function createRequest(
  root: string,
  persistenceMode: RuntimeTurnRequest["persistenceMode"],
): RuntimeTurnRequest {
  return {
    sessionId: "session-1",
    turnId: "turn-1",
    userInput: "hello",
    workspaceRoot: join(root, "workspace"),
    roots: {
      dataRoot: root,
      sessionRoot: join(root, "sessions"),
      tmpRoot: join(root, "tmp"),
      defaultWorkspaceRoot: join(root, "workspace"),
    },
    persistenceMode,
    interactionMode: persistenceMode === "persistent" ? "desktop" : "cli-headless",
  };
}

function createRuntime(
  root: string,
  events: RuntimeStreamEvent[],
  overrides: {
    runHarness?: (...args: any[]) => Promise<AgentTurnResult>;
    eventSink?: { emit(event: RuntimeStreamEvent): Promise<void> | void };
    onDiagnostic?: (diagnostic: any) => void;
    dispose?: () => Promise<void>;
    approvalAbort?: (sessionId: string, turnId: string) => void;
    workspaceExecutionProvider?: any;
    createDependencies?: (...args: any[]) => Promise<AgentDeps>;
  } = {},
) {
  const toolDispose = overrides.dispose ?? vi.fn(async () => {});
  const deps = createDeps(toolDispose);
  return createAgentHostRuntime({
    contextProvider: { load: async () => ({ systemPrompt: "test" }) },
    modelResolver: { resolveConfig: async () => ({}) as any },
    eventSink: overrides.eventSink ?? { emit: (event) => { events.push(event); } },
    approvalBroker: {
      waitForDecision: async (request) => ({ requestId: request.id, decision: "approve_once" }),
      abortTurn: overrides.approvalAbort,
    },
    createDependencies: overrides.createDependencies ?? (async () => deps),
    runHarness: (overrides.runHarness ?? (async () => createResult("completed"))) as any,
    workspaceExecutionProvider: overrides.workspaceExecutionProvider,
    onDiagnostic: overrides.onDiagnostic,
  });
}

function createDeps(dispose: () => Promise<void>): AgentDeps {
  return {
    llm: {} as AgentDeps["llm"],
    toolManager: { dispose } as AgentDeps["toolManager"],
    contextManager: {
      getMessageCount: () => 0,
      getUsageSnapshot: () => ({ totalTokens: 1 }),
    } as AgentDeps["contextManager"],
    thinkingEnabled: false,
    modelSpec: { contextWindow: 100_000 } as AgentDeps["modelSpec"],
    modelDefinition: {
      provider: "deepseek",
      apiModel: "mock-model",
      capabilities: { input: ["text"] },
    } as AgentDeps["modelDefinition"],
    modelKey: "deepseek:deepseek-v4-pro",
  };
}

function createResult(status: AgentTurnResult["status"]): AgentTurnResult {
  const events: SessionEvent[] = status === "completed"
    ? [
        createSessionEvent("assistant_message", { content: "ok" }, "assistant"),
        createSessionEvent("context_snapshot", { totalTokens: 1 }, "snapshot"),
      ]
    : status === "aborted"
      ? [createSessionEvent("turn_aborted", {}, "aborted")]
      : [createSessionEvent("error", { code: "LLM_ERROR", message: "failed" }, "error")];
  return {
    sessionId: "session-1",
    turnId: "turn-1",
    events,
    contextSnapshot: { totalTokens: 1 } as AgentTurnResult["contextSnapshot"],
    status,
    ...(status === "failed" ? { error: { code: "LLM_ERROR", message: "failed" } } : {}),
  };
}

function createSessionEvent(type: SessionEvent["type"], payload: unknown, id: string): SessionEvent {
  return {
    id,
    sessionId: "session-1",
    turnId: "turn-1",
    type,
    timestamp: new Date(0).toISOString(),
    payload,
  };
}

async function readEvents(path: string): Promise<SessionEvent[]> {
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionEvent);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
